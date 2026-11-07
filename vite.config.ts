import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Release binding between the app bundle and its data.
 *
 * The JavaScript is content-hashed by Vite, but data and textures live in /public under
 * fixed names, so a browser can hold an older copy (this happened in production: a cached
 * four-region sites.json met the nine-region bundle). This plugin
 *  - hashes every file in public/data, public/textures and public/audio into one release
 *    id, appended as ?v=<id> to every data/texture URL the app requests, so a new bundle
 *    never reuses an older cached file;
 *  - embeds the SHA-256 of each core JSON file, which the app checks after download;
 *  - writes /version.json (never cached) so an open tab can tell that a newer release
 *    is live and offer a reload instead of mixing releases.
 */
function release(): Plugin {
  const pub = fileURLToPath(new URL('./public', import.meta.url));
  const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const compute = () => {
    const files = ['data', 'textures', 'audio']
      .flatMap((d) => {
        try {
          return walk(join(pub, d));
        } catch {
          return [];
        }
      })
      .sort();
    const all = createHash('sha256');
    const core: Record<string, string> = {};
    for (const f of files) {
      const rel = relative(pub, f).split(sep).join('/');
      const h = sha(readFileSync(f));
      all.update(`${rel}:${h}\n`);
      if (/^data\/[^/]+\.json$/.test(rel)) core[rel] = h;
    }
    const assets = all.digest('hex').slice(0, 12);
    return { assets, core, build: `${assets}-${Date.now().toString(36)}` };
  };
  let rel = compute();
  return {
    name: 'lsn-release',
    config() {
      rel = compute();
      return { define: { __RELEASE__: JSON.stringify(rel) } };
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: rel.build, assets: rel.assets }) });
    },
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.setHeader('cache-control', 'no-store');
        res.end(JSON.stringify({ build: rel.build, assets: rel.assets }));
      });
    },
  };
}

// `base: './'` keeps the build portable for static hosts (GitHub Pages, Netlify, S3).
export default defineConfig({
  plugins: [react(), release()],
  base: './',
  optimizeDeps: {
    // Pre-bundle everything up front so the dev server never re-optimises mid-session.
    include: ['three', '@react-three/fiber', 'zustand', 'react', 'react-dom/client'],
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber'],
        },
      },
    },
  },
});
