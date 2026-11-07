# Performance pass: November 2026

Branch `review`. All numbers below were measured, not estimated, except where marked.

## How it was measured

- The app now records timing marks in `window.__perf`:
  - `moon-first-frame`, `moon-base-hires`, `moon-hires`;
  - `surface-tiles`, `surface-mesh`, `surface-ready`;
  - region-switch times;
  - main-thread long tasks (over 50 ms).
- `scripts/bench.json` drives headless Edge through four steps:
  1. a cold load;
  2. three cold region switches;
  3. a switch back to a recent region;
  4. entering Surface View.

Both runs used the same dev server, URL and steps (Malapert Massif, 2027-01-13 14:00 UTC,
1440 × 900).

**Important limits of this environment:**

- Headless Edge renders WebGL in software (SwiftShader, on the CPU). Every GPU upload and
  draw shows up as main-thread time, so absolute numbers are far worse than on a real
  GPU.
- The test machine was out of memory and disk during the runs: about 33.5 of 34.7 GB
  committed by other applications and under 200 MB of free disk. Repeated runs varied by
  ±40%.
- Assets came from localhost, so network transfer was nearly free. The byte counts are
  the meaningful network measure.
- No physical phones, tablets or real GPUs were tested.

## Results

| Measure | Before | After | Notes |
|---|---|---|---|
| Texture bytes required before the first Moon frame | **8,256 KB** (4K colour + 4K normal + 5 MB PNG polar relief) | **224 KB** (1K colour + 1K normal) | Deterministic. On a 20 Mbit/s link this is about 3.3 s versus 0.1 s of download before the Moon can appear (computed). |
| First Moon frame | 2.57 s | 2.91 s | On localhost this is dominated by JavaScript and data loading, not textures. The gain shows on real networks (row above). |
| Full-resolution global imagery on screen | — (it gated the first frame) | 3.3 s | Streams in after the first frame and swaps in seamlessly. |
| Polar mosaic + site 100 m imagery ready | 3.13 s | 3.45 s | Same bytes as before, now decoded off the main thread. |
| Total transferred during load | 22.7 MB | 21.3 MB | Normal maps are now lossless WebP (identical pixels, 18–20% smaller). |
| Main-thread blocking, 3 cold region switches + 1 return | **4.88 s** (worst task 3.69 s) | **2.27–2.31 s** (worst 1.5–1.8 s) | ImageBitmap decoding off the main thread; shared in-flight requests. |
| Return to a recently visited region | 97 ms | **12–26 ms** | GPU-resident cache: no download, decode or upload. |
| Surface View entry | 8.8 s | 9.1–12.4 s (noisy) | Stage marks show the time is the dive, context creation and software-rendered first frames. The terrain was already prefetched and the mesh is now built in a Web Worker. The dive was shortened from 2.6 s to 1.8 s. Not representative of a real GPU. |
| WebGL context loss | none | 1 run (fixed) | An intermediate version cached three regions on the GPU and lost the context on this starved machine. The cache is now 2 regions (1 on the standard tier), and the page lets the browser restore a lost context. |

## What changed

### Moon: progressive, non-blocking

1. **First frame:** the globe renders from 1K maps (about 110 KB each, box-downsampled
   from the same NASA maps). The 4K/8K colour map and 2K/4K normal map stream in and
   swap in per patch.
2. **Polar relief:** the LOLA normals no longer block anything. The shader skips them
   until they arrive (`capNrmOn`).
3. **Decoding:** all large images are decoded off the main thread with `ImageBitmap`
   (`ImageBitmapLoader`). Older Safari (before 17) and Firefox (before 98) fall back to
   the standard loader, as three.js does. Bitmaps are closed on dispose.
4. **Shared requests:** a second request for a file in flight waits for the first. This
   also removed duplicate downloads under React StrictMode in development.
5. **Accuracy unchanged:** the same NASA imagery and geographic mapping. Only the order
   and the decoding thread changed.

### Regions

1. **GPU cache:** recently visited regions stay on the GPU (2, or 1 on the standard tier).
   Going back is instant.
2. **Stale requests:** a newer selection always wins. A slower, older response is kept in
   the cache instead of overwriting the view or being thrown away.
3. **Prefetch:**
   - when idle, the previous and next regions' imagery is fetched into the HTTP cache
     (network only: no decoding or GPU work);
   - the selected region's three LOLA terrain tiles are fetched into memory, so Surface
     View starts with its data ready.

### Surface View

1. **Worker mesh:** the terrain mesh (rings, LOLA sampling, occlusion shading, normals)
   is built in a Web Worker (`terrainMesh.ts`, `terrainWorker.ts`), falling back to the
   main thread if workers are unavailable. The output matches the previous geometry:
   same samples, same normals formula.
2. **Fade-in:** the scene fades in only once the mesh exists; the fade shows "Loading
   LOLA terrain…".
3. **Albedo decoding:** the albedo drape uses the same off-thread decoding.
4. **Dive:** 2.6 s became 1.8 s, and the fade starts earlier.

### Adaptive quality (Settings → Display quality)

| | Pixel density | Texture tier | Shadow map | Terrain segments |
|---|---|---|---|---|
| Performance | ≤ 1.25× | high if the GPU allows | 1024 | 240 |
| Auto | chosen from the device (below) | | | |
| High quality | ≤ 2× | high if the GPU allows | 4096 (2048 on smaller GPUs) | 360 |

**How Auto decides:**

- Software rendering (SwiftShader, llvmpipe) → Performance.
- Small screen, 4 or fewer CPU cores, or 4 GB or less of device memory → Balanced.
- Otherwise → High.

The settings panel states what Auto chose and why. **Moon imagery is never reduced.**

### Loading feedback

A small status chip names what is streaming, for example "Loading Full-resolution Moon
imagery · 1 more". It appears only after 400 ms, so fast loads never flicker. The scene
stays interactive the whole time.

### Texture repetition (Surface)

The illustrative ground texture already uses two rotated samples at non-integer scales,
with distance fades (previous pass). It is unchanged here.

## Investigated, not adopted (yet)

- **KTX2 / Basis Universal.** For the 2048² site windows and the 4K global map this would
  cut GPU memory 4–8× and upload cost substantially. That is the right next step for
  mobile. It was not adopted in this pass for three reasons:
  - it needs the `basisu`/`toktx` toolchain;
  - the build machine had no free disk to install it or store transcoded copies;
  - it adds about 200 KB of transcoder WebAssembly.

  Recommended setup:
  - colour maps: `toktx --t2 --encode uastc --uastc_quality 2 --zcmp 18`;
  - normal maps: `--normal_mode` with UASTC, verified against the PNG originals;
  - loading: three's `KTX2Loader`, keeping the current files as fallback.
- **Keeping both WebGL contexts alive** (Orbit and Surface) would make mode switches
  instant but doubles GPU memory. That was rejected after the context-loss result above.
- **Precomputed terrain meshes** (download instead of build) would add about 6–8 MB per
  region. Rejected: the Web Worker build is off the main thread and needs no download.

## Remaining limitations

- No measurements on real GPUs or physical devices. The Surface View entry time in
  particular could not be measured meaningfully here.
- First-frame timing on a real network is computed from byte counts, not measured.
- GPU memory figures are estimates (2048² RGBA with mipmaps ≈ 22 MB per texture).
