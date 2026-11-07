import { create } from 'zustand';

/**
 * User preferences, persisted in localStorage (never required: every read is guarded).
 *  - Display quality: Auto picks from measured device capabilities.
 *  - Audio Guide: off by default; nothing plays without an explicit action.
 */
export type Quality = 'auto' | 'performance' | 'high';
export type VoicePref = 'recorded' | 'browser';

interface Settings {
  quality: Quality;
  audioGuide: boolean;
  voice: VoicePref;
  rate: 1 | 1.25 | 1.5;
  transcript: boolean;
  welcomeSeen: boolean;
  set: (p: Partial<Omit<Settings, 'set'>>) => void;
}

const KEY = 'lsn.settings.v1';
const defaults = { quality: 'auto' as Quality, audioGuide: false, voice: 'recorded' as VoicePref, rate: 1 as const, transcript: true, welcomeSeen: false };

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v === 'object' ? { ...defaults, ...v } : defaults;
  } catch {
    return defaults;
  }
}

export const useSettings = create<Settings>((set) => ({
  ...read(),
  set: (p) =>
    set((s) => {
      const next = { ...s, ...p };
      try {
        const { set: _omit, ...data } = next;
        void _omit;
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* storage unavailable: settings last for this visit */
      }
      return next;
    }),
}));

/** What the device can do, measured once (no rendering work). */
export interface DeviceProfile {
  maxTexture: number;
  software: boolean;
  cores: number;
  memoryGB: number | null;
  small: boolean;
  dpr: number;
  renderer: string;
}

let profile: DeviceProfile | null = null;
export function deviceProfile(): DeviceProfile {
  if (profile) return profile;
  let maxTexture = 2048;
  let renderer = 'unknown';
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* keep defaults */
  }
  profile = {
    maxTexture,
    renderer,
    software: /swiftshader|llvmpipe|software|basic render/i.test(renderer),
    cores: navigator.hardwareConcurrency || 4,
    memoryGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
    small: Math.min(window.innerWidth, window.innerHeight) < 700,
    dpr: window.devicePixelRatio || 1,
  };
  return profile;
}

export interface RenderSettings {
  level: 'performance' | 'balanced' | 'high';
  dpr: number;
  tier: 'high' | 'standard';
  shadowMap: number;
  terrainSegments: number;
  reason: string;
}

/** Concrete rendering settings for a quality choice. Moon imagery stays full-resolution in
 *  every mode; Performance lowers pixel density, shadow resolution and mesh density. */
export function renderSettings(q: Quality): RenderSettings {
  const d = deviceProfile();
  const bigTex = d.maxTexture >= 4096;
  const perf: RenderSettings = { level: 'performance', dpr: Math.min(d.dpr, 1.25), tier: d.small || !bigTex ? 'standard' : 'high', shadowMap: 1024, terrainSegments: 240, reason: 'Performance chosen' };
  const high: RenderSettings = { level: 'high', dpr: Math.min(d.dpr, 2), tier: bigTex ? 'high' : 'standard', shadowMap: d.maxTexture >= 8192 ? 4096 : 2048, terrainSegments: 360, reason: 'High quality chosen' };
  if (q === 'performance') return perf;
  if (q === 'high') return high;
  // Auto
  if (d.software) return { ...perf, reason: 'Software rendering detected' };
  const weak = d.cores <= 4 || (d.memoryGB !== null && d.memoryGB <= 4);
  if (d.small || weak)
    return { level: 'balanced', dpr: Math.min(d.dpr, 1.75), tier: d.small || !bigTex ? 'standard' : 'high', shadowMap: 2048, terrainSegments: d.small ? 240 : 300, reason: d.small ? 'Small screen' : 'Modest CPU or memory' };
  return { ...high, level: 'high', reason: 'Capable device' };
}
