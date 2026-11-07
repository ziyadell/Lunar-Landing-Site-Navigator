# Quality pass — November 2026

Audit and fixes made on branch `quality-pass` (from `866ee68`, tag
`checkpoint-before-quality-pass`). Each issue was reproduced in a browser
first, then fixed at its root cause. The fix was verified with a screenshot or
a measurement.

- **Before:** [`screenshots/before/`](screenshots/before/), production, captured 2026-11-07.
- **After:** [`screenshots/after/`](screenshots/after/), this branch.

All images are at original browser resolution (1440 × 900, 1024 × 768,
768 × 1024, 375 × 812). Most were captured with headless Microsoft Edge
(SwiftShader software WebGL); the `firefox-*` files come from headless
Firefox 159 on the local GPU.

## Ranked issues and root causes

| # | Priority | Issue | Root cause | Fix | Evidence |
|---|---|---|---|---|---|
| 1 | P0 | Moon blurry when zoomed | Above 80°S the best imagery was the 16K equirectangular mosaic (0.67 km/px; my earlier docs wrongly said 0.33 km/px). Polar relief was 146 m/px. No regional product. | Added the authentic LROC WAC South Pole Summer Mosaic (100 m native): 146 m cap texture, plus a native 100 m window around the selected site with matching LOLA normals. Zoom limits follow data resolution; the scale bar states the source and warns "beyond imagery resolution". No upscaling. | `after/orbital-5-max-zoom-104km-1440.png` vs `before/orbital-global-1440.png` |
| 2 | P0 | Moiré / grid on polar relief | Normals were point-sampled from the 80 m DEM onto 146/293 m grids without low-pass filtering, so the two grids beat into a ~1 km pattern. Found by toggling layers and reading the source textures 1:1. | Box prefilter matched to the output grid before computing normals; lossless PNG for normal maps. | `after/polar-relief-moire-before-fix.jpg` vs `…-after-fix.jpg` (each: detail on / detail off / imagery off) |
| 3 | P0 | Polar blend ill-defined | `smoothstep(EDGE, INNER, lat)` with edge0 > edge1, which GLSL leaves undefined. | `1 − smoothstep(INNER, EDGE, lat)`. | `src/three/moonMaterial.ts` |
| 4 | P0 | Region markers crowded / overlapping | Fixed-size 3D rings and absolutely placed labels for four points within ~6° of the pole, with no clustering or collision handling. | DOM marker layer: cluster pin when points are closer than 24 px; greedy 12-position label placement with leader lines, kept inside the viewport and away from on-screen controls; close-range annotation of "representative observation point · not a NASA-designated landing site" plus the IAU feature centre. Markers are buttons (mouse, touch, keyboard). Coordinates are never moved. | `after/orbital-1-*`, `-2-*`, `-3*`, `mobile-375-orbital-regional.png` |
| 5 | P0 | Zoom/drag unintuitive near regions | `OrbitControls` always orbited the Moon's centre, so close zoom slid regions off-screen and drag rotated the whole globe. | New controller: global and site modes, both expressed as target + heading/tilt/range. Site mode orbits and zooms on a surface point, right-drag / two-finger pans, double-click zooms to a point. Global↔site hand-over converts the pose exactly (measured continuous: 591.3 → 590.3 km at the switch). Data-based zoom limits. | `GlobeCamera.tsx`; CDP zoom test |
| 6 | P1 | Surface "puddle" texture, moiré bands | The illustrative regolith map had strong low-frequency octaves and no distance fade, and was on by default. | Low octaves removed; fade 60–320 m; off by default (on only in "Realistic"). | `before/surface-*` vs `after/surface-*` |
| 7 | P1 | Near/far seams, artificial horizon wall | Two overlapping square tiles (far sunk 60 m) plus a vertical silhouette wall at 90 km. | One continuous radial mesh to 150 km from the 80 m / 400 m / 1 km LOLA tiles with cross-fades; wall removed; skyline kept as an annotation line. | `after/surface-1…6` |
| 8 | P1 | Range rings invisible | At 2 m eye height, rings at 1–10 km lie within 0.1° of the horizon. | Rings at 100/250/500/1000 m with a small lift. | `after/surface-*` |
| 9 | P1 | Compass labels clipped | Off-screen Sun/Earth labels were inside the tape's fade mask. | Listed beside the tape (below it on mobile). | `after/surface-*` |
| 10 | P1 | Viewport too narrow at 900–1280 px | Two fixed panels (288 + 328 px). | Collapsible panels with rails (region numbers; Sun/Earth status as text). Left rail is the default below 1280 px. At 1024 px the 3D viewport grew from ~485 px to 680 px. | `before/orbital-global-1024.png` vs `after/…-1024` |
| 11 | P1 | Tiny text | 9.5 px chart labels, 10.5 px micro text. | 10.5 px / 11 px minimum; label size 12 px. | — |
| 12 | P1 | Mobile comparison table cramped | Four-column table at 375 px. | Stacked metric cards (A / B / B−A) under 640 px. | `before/analysis-375.png` vs `after/analysis-375-stacked.png` |
| 13 | P1 | Credit text overlapped the Moon | Absolutely positioned credit line. | Moved to the Data Sources panel; viewport carries the scale and resolution readout instead. | `before/orbital-global-1440.png` |
| 14 | Sci | Outdated NASA region reference | Listings cited only the Aug 2022 release, and equated "Mons Mouton" with the 2022 "Leibnitz Beta Plateau". | Updated to NASA's Oct 28, 2024 list of nine (verified on nasa.gov); Mons Mouton is listed separately from Mons Mouton Plateau. | `public/data/sites.json`, `SCIENCE.md §4` |
| 15 | Sci | Wrong 16K resolution in docs | Arithmetic error. | 16384 px / 360° → 0.67 km/px at the equator. | `SCIENCE.md §6` |
| 16 | Perf | Duplicate normal-map download | Texture tier decided after the first GL context. | Tier probed before the canvas mounts. | network log |
| 17 | Perf | Unbounded 16K tile retention (up to 32 × ~22 MB GPU) | Tiles were never evicted. | LRU with a budget (10 high / 4 standard), frustum + horizon visibility, and loading only when needed (< 2 km/px). | `__tiles` counter |
| 18 | Perf | Detail textures not loading in dev | React StrictMode effect re-run combined with an early-return guard. | Guard set only on success. | CDP state check |
| 19 | Robustness | Drag broke with synthetic/edge pointers | `setPointerCapture` threw before the handler registered the pointer. | Capture is best-effort. | CDP drag test |
| 20 | Robustness | Dive could take 5 s on slow GPUs | Hand-over checked only inside the render loop. | Frame-independent 2.8 s fallback. | CDP dive test |
| 21 | Bundle | Unused `@react-three/drei`, `gsap` | Replaced by the custom controller. | Removed: JS 1,233 → 1,181 KB (gzip 355 → 334 KB). | build log |

## Performance measurements

Environment: Windows 11 test machine. Headless Edge used SwiftShader
(software WebGL), so frame rates are **not** representative of a GPU. The
numbers below are counts, sizes and timings that do not depend on frame rate.

| Measure | Result |
|---|---|
| Initial download, desktop (JS gz + data + base textures + 2048² polar relief) | ≈ 9.6 MB |
| Polar imagery on approach to the pole (4096²) | 6.6 MB, once |
| Selected-site detail (imagery + lossless normals) | ≈ 6 MB per site, on selection |
| 16K tiles | ≈ 0.6 MB each; ≤ 10 resident (high tier), ≤ 4 (standard) |
| GPU resources across 3 Orbital ↔ Surface cycles | orbital 6 textures / 34 geometries, surface 1 / 6, identical every cycle (no leak) |
| JS heap across those cycles | 50–60 MB, stable |
| Surface View mount after mode switch (SwiftShader) | ≈ 1.0 s |
| Orbital → Surface dive (worst case) | ≤ 2.8 s (fallback) |
| Frame rate | not measured: software renderer only (~3–4 fps), not meaningful |

## Validation rerun (2026-11-07)

- Topocentric Sun/Earth vs JPL Horizons: max 0.0007° elevation (Sun),
  0.006° azimuth (Earth), 233 epochs × 4 sites.
- IAU Moon orientation vs Horizons: max 0.008°.
- Mission Analysis independently recomputed in Python (Malapert Massif,
  Jan 2027, 15 min): Sun above skyline 59.4%, Earth 96.1%, identical to the app.
- Polar mosaic georeferencing: five permanently shadowed crater centres are
  dark only in the correct orientation.

## Tested

- **Engines:** Microsoft Edge (Chromium, headless, SwiftShader) and Firefox 159
  (headless, local GPU). **WebKit/Safari: not tested** (not available on Windows).
- **Sizes:** 375 × 812 (mobile emulation with touch), 768 × 1024, 1024 × 768,
  1440 × 900. No horizontal overflow at any size.
- **Interactions** (scripted via DevTools / WebDriver BiDi):
  - focus, global and pole views; wheel zoom through the mode hand-over;
    drag-rotate; right-drag pan;
  - dive to Surface and return; marker-label selection; keyboard focus on markers;
  - all three presets; mode switching;
  - Mission Analysis region, date and period changes; stacked mobile layout.
- **Console:** no errors in any scripted run after the fixes.

## Remaining limitations

- The near-field surface (within a few hundred metres) is smooth, because
  LOLA's 80 m grid is the finest measured terrain available here. Higher
  resolution (5–20 m LOLA products near the pole) exists but was not integrated.
- The polar mosaic has baked 2010 illumination. Shadows are suppressed as
  "no albedo", but subtle shading remains in lit areas.
- Outside 80.6°S the imagery limit is 0.67 km/px, so the site-mode zoom limit
  is wider there.
- No texture compression (KTX2/Basis); GPU memory is managed by the LRU budget instead.
- Real-device touch, Safari/WebKit, screen readers and GPU frame-rate profiling
  were not tested.
