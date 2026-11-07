import * as THREE from 'three';

/**
 * ILLUSTRATIVE fine surface texture (not measured data).
 * LOLA resolves nothing below ~80 m, so the near field would otherwise look like a
 * smooth plastic sheet. This tileable normal map adds generic small-crater and
 * regolith roughness at metre scale so slope and lighting read correctly. It is
 * labelled in the UI and can be switched off.
 */
let cached: THREE.DataTexture | null = null;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function regolithNormalMap(): THREE.DataTexture {
  if (cached) return cached;
  const N = 512;
  const h = new Float32Array(N * N);
  const r = rng(20261107);
  const wrap = (v: number) => ((v % N) + N) % N;

  // Value-noise fBm (tileable).
  // No low octaves: broad undulations would read as fake terrain (LOLA already provides shape).
  for (const [cells, amp] of [[32, 0.3], [64, 0.2], [128, 0.12], [256, 0.06]] as const) {
    const g = new Float32Array(cells * cells).map(() => r());
    const step = N / cells;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const gx = x / step, gy = y / step;
        const x0 = Math.floor(gx) % cells, y0 = Math.floor(gy) % cells;
        const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
        const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const a = g[y0 * cells + x0] + (g[y0 * cells + x1] - g[y0 * cells + x0]) * sx;
        const b = g[y1 * cells + x0] + (g[y1 * cells + x1] - g[y1 * cells + x0]) * sx;
        h[y * N + x] += (a + (b - a) * sy) * amp;
      }
  }
  // Small craters: bowl + raised rim, power-law sizes.
  for (let k = 0; k < 420; k++) {
    const cx = r() * N, cy = r() * N;
    const rad = 2 + Math.pow(r(), 3) * 22;
    const depth = rad * 0.035;
    const R = Math.ceil(rad * 1.6);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy) / rad;
        if (d > 1.6) continue;
        const v = d < 1 ? -depth * (1 - d * d) + depth * 0.25 * d ** 6 : depth * 0.25 * Math.exp(-(((d - 1) * 4) ** 2));
        h[wrap(Math.round(cy + dy)) * N + wrap(Math.round(cx + dx))] += v;
      }
  }
  const data = new Uint8Array(N * N * 4);
  const s = 6.0; // slope gain
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (h[y * N + wrap(x + 1)] - h[y * N + wrap(x - 1)]) * s;
      const dy = (h[wrap(y - 1) * N + x] - h[wrap(y + 1) * N + x]) * s;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 4;
      data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  cached = t;
  return t;
}
