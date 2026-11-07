import { create } from 'zustand';

/**
 * The data release this bundle was built with (see vite.config.ts → release()).
 * Every data/texture URL carries ?v=<assets>, so a browser never pairs this bundle with an
 * older cached file; core JSON files are verified against their build-time SHA-256.
 */
declare const __RELEASE__: { assets: string; core: Record<string, string>; build: string };
export const RELEASE = __RELEASE__;

const BASE = import.meta.env.BASE_URL;

/** Versioned URL for anything in /public (data, textures, audio). */
export function assetUrl(p: string): string {
  if (/^(https?:|data:|blob:)/.test(p)) return p;
  const path = p.replace(/^\.?\//, '');
  return `${BASE}${path}${path.includes('?') ? '&' : '?'}v=${RELEASE.assets}`;
}

/** SHA-256 hex of bytes, or null where Web Crypto is unavailable (plain-http hosts). */
export async function sha256(buf: ArrayBuffer): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const d = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export class ReleaseMismatch extends Error {
  constructor(public file: string) {
    super(`${file} does not belong to this version of the app`);
  }
}

/**
 * Fetch a core JSON file of this release. If the bytes do not match the build-time hash
 * (an older copy from a cache or a CDN edge), fetch once more bypassing the HTTP cache;
 * if it still does not match, throw ReleaseMismatch (never use mixed-release data).
 */
export async function fetchReleaseJson<T>(p: string): Promise<T> {
  const expected = RELEASE.core[p];
  for (const cache of ['default', 'reload'] as RequestCache[]) {
    const r = await fetch(assetUrl(p), { cache });
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    const buf = await r.arrayBuffer();
    const got = expected ? await sha256(buf) : null;
    if (!expected || got === null || got === expected) return JSON.parse(new TextDecoder().decode(buf)) as T;
  }
  throw new ReleaseMismatch(p);
}

/** Set when a newer release is live than the one this tab is running. */
export const useRelease = create<{ updateAvailable: boolean }>(() => ({ updateAvailable: false }));

/**
 * Ask the server which release is live (never cached). Used after a data/asset failure:
 * if the deployment changed under an open tab, offer a reload instead of mixing releases.
 */
export async function checkForUpdate(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}version.json`, { cache: 'no-store' });
    if (!r.ok) return false;
    const v = (await r.json()) as { assets?: string };
    const newer = !!v.assets && v.assets !== RELEASE.assets;
    if (newer) useRelease.setState({ updateAvailable: true });
    return newer;
  } catch {
    return false;
  }
}
