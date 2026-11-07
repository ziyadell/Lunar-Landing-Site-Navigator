# Experience pass — November 2026

This pass is on branch `experience-pass`, built on `quality-pass`, which already
fixed:
- the polar `smoothstep` bug;
- the site-aware camera;
- multi-scale markers;
- the continuous LOLA surface mesh;
- the 100 m polar imagery.

See [QUALITY-PASS.md](QUALITY-PASS.md). This pass changes the design direction
to roughly 50 % premium scientific interface, 30 % cinematic exploration and
20 % spacecraft identity, and adds interaction, regions and realism.

Screenshots of this pass are in [`screenshots/experience/`](screenshots/experience/),
at original browser resolution. They come from headless Edge (SwiftShader) and,
for the `firefox-*` files, Firefox 159 on the local GPU. The
*before* state is [`screenshots/after/`](screenshots/after/) (quality pass) and
[`screenshots/before/`](screenshots/before/) (initial production).

## 1. Reference study (what was actually inspected)

| Reference | Accessed? | Takeaway used |
|---|---|---|
| RIFDAN (ziyad-jammah.sa) | Yes. Measured computed styles. | Body text 15–17 px with ~1.85 line height, 8–10 px radii, soft navy surfaces separated by tone rather than rules, one accent for the primary action, large confident numbers. Applied as a philosophy only, with no layout or branding copied. |
| LROC QuickMap | Yes (UI shell and globe; it announces a move to quickmap.lroc.im-ldi.com). | Live LAT / LON / RES readout under the cursor, slim tool rail, scale bar. Adopted: cursor lat/lon readout, scale bar with source resolution. |
| NASA Moon Trek | Only the loading screen rendered in headless software WebGL. | Visible: minimal zoom +/−/home stack and scale bar. Adopted: camera stack. Deeper behaviour not inspected. |
| NASA Eyes | Only the loading screen rendered. | Not inspected beyond that; no claims made. |
| CesiumJS | Product page only. | Its principles (camera targeting a surface point, terrain level of detail, screen-space markers) were already implemented in the quality pass with R3F. Replacing the renderer showed no benefit large enough to justify the risk. |
| NASA SVS 14959 (Moon 3D models) | Yes. GLB/USDZ downloads listed (`moon.glb`, `Moon_NASA_LRO_23k_Flat.usdz`, …). | Single-mesh globes from the same LRO sources. Our 16K tiles and 100 m polar mosaic are finer where it matters, so they were not adopted. |
| NASA CGI Moon Kit (SVS 4720) | Yes (since the first release). | Source of the global colour and relief. |

## 2. Moon

- **Polar blend:** the shader fix from the quality pass was verified again
  visually; the high-res polar layers show no seam at 80.6°S in
  `experience/02-*`, `03-*`.
- **8K base on high-DPI screens:** at the default view a 2× display resolves
  ~1.85 km per device pixel, finer than the 4K base (2.7 km/px). High-tier
  devices with DPR ≥ 1.5 now load an 8K base (downsampled from the 16K
  mosaic, never upscaled). Other devices keep the 4K base.
- **Retained from the quality pass:**
  - 16K tile LOD with an LRU budget;
  - 100 m LROC polar mosaic plus a native window around the selected site;
  - anti-aliased LOLA relief;
  - zoom limits based on the data.

## 3. Navigation and markers

- **Camera stack** (zoom in, zoom out, focus region, whole Moon) on the viewport
  edge: an accessible alternative to wheel and gestures, at 40–44 px touch
  targets. It drives the same damped camera as the wheel.
- **Cursor readout:** latitude and longitude under the pointer (mouse), from a
  ray–sphere intersection, shown under the scale bar.
- **Marker tooltips:** hovering or keyboard-focusing a region label shows that
  region's live Sun and Earth state at the selected time. On touch, a tap
  selects directly with no hover required.
- **Six regions:** clustering and label placement scale to six points
  (`experience/02-*`, `08-*`).

## 4. Interface (premium, comfortable)

- **Deck:** panels and the 3D viewport are inset surfaces with 12 px gaps and
  radii, and no hard full-height rules. The palette is unchanged; one derived
  raised navy (`#172033`) was added.
- **Type:** sentence-case labels replace tiny uppercase technical labels. Body
  text is 14–15 px, labels 13 px, and the smallest text 11.5 px.
- **Mode switcher:** a segmented control.
- **Readings panel with progressive disclosure:**
  - two instrument cards (Sun, Earth), each with a large elevation figure, a
    state chip, and a plain sentence against the measured skyline (e.g.
    "+1.4° above the LOLA skyline");
  - all readings, location, and data & method are one click away and never
    removed.
- **Regions panel:**
  - each row shows the live Sun and Earth status at the selected time;
  - "How this point was chosen" and "NASA regions not shown" are disclosures.
- **Value-change feedback:** a 600 ms highlight when a reading changes, disabled
  under reduced motion.

## 5. Interactive analysis

- **Visibility timelines:** hover or arrow keys move a crosshair; the tooltip
  shows the exact UTC time, Sun and Earth elevation, and clearance. Clicking (or
  Enter) pins the moment, offering **Open in Surface View** and **Open in
  Orbital View**, which set region, time and mode. Tested: the pin opened
  Surface View at 2027-01-13 13:45 UTC for Malapert Massif.
- **Horizon panoramas:** hover reads out azimuth and LOLA skyline elevation.
- **Unchanged:** CSV export, the stacked mobile metrics, and every calculation.

## 6. Surface View

- **LROC albedo drape:** the 100 m mosaic is mapped onto the terrain by each
  vertex's exact polar-stereographic coordinate. Pixels in 2010 shadow fall back
  to the regional mean; the response is compressed (`(a/ā)^0.6`, clamped 0.6–1.4)
  so the mosaic's own slope shading isn't double-counted. It is labelled
  "LROC albedo (100 m)" and can be switched off.
- **Measured finding:** the drape changes very little. Within 5 km of the sites,
  24–65 % of mosaic pixels are 2010 shadow, and from 2 m eye height the visible
  foreground lies within one or two 100 m pixels. A pixel-difference test at
  Haworth found a mean change of 0.2 grey levels. It adds km-scale brightness
  variation at most; it **cannot** add near-field detail, and no detail was invented.
- **Unchanged:** presets, the continuous mesh and the honest labelling from the
  quality pass. The dock's display toggles now fit three columns.

## 7. Regions

NASA's Oct 28, 2024 list has nine regions. Added with defensible, documented rules:

| Region | Anchor (IAU) | Rule | Point | 2027 Sun-visible |
|---|---|---|---|---|
| Peak near Cabeus B | Cabeus B crater (8058), 82.26°S 54.58°W, 59.6 km | highest smoothed LOLA point 0.6–1.6 crater radii from centre (*provisional*) | 81.348°S 57.584°W, 1294 m | 48.6 % |
| de Gerlache Rim 2 | de Gerlache crater (1439), 88.48°S 88.34°W, 32.7 km | rim-crest rule (as Haworth / Nobile) | 89.004°S 96.597°W, 1552 m | 72.3 % |

Not represented, with reasons (also shown in the app): Mons Mouton Plateau,
Nobile Rim 2, Slater Plain.

The pipeline is deterministic: the original four points came out byte-identical
on re-run. For Peak near Cabeus B (263 km from the pole), horizon rays toward
the north leave the 80°S DEM after ~40 km instead of 150 km; this is disclosed
in the region notes.

Custom observation points were **not** implemented. They need horizon
ray-tracing in the browser against the 115 MB LOLA grid (or a server), and the
app should not show unvalidated numbers.

## 8. Validation (rerun for six regions)

- Sun/Earth topocentric vs JPL Horizons: ≤ 0.0007° elevation (Sun), ≤ 0.0009°
  (Earth), ≤ 0.006° azimuth. 233 epochs × 6 sites.
- IAU Moon orientation vs Horizons: ≤ 0.0083°.
- Polar mosaic orientation: five permanently shadowed craters are dark only in
  the correct orientation.
- The quality-pass independent Python check of a Mission Analysis scenario
  still holds (unchanged code path).

## 9. Testing

- **Edge (headless, SwiftShader):** all three modes at 375 / 768 / 1024 / 1440
  px; camera stack, tooltip, timeline hover / pin / open-in-Surface, albedo
  on/off. No console errors.
- **Firefox 159 (local AMD GPU):** all three modes. No console errors.
- **Not tested:** Safari/WebKit, physical touch devices, screen readers, GPU
  frame-rate profiling (the software renderer is not representative).

## 10. Remaining limitations

- Near-field terrain is smooth: LOLA's 80 m grid is the finest measured relief used.
- The LROC albedo drape is subtle for the reasons in §6.
- Three of NASA's nine regions are not represented (§7).
- No texture compression (KTX2/Basis). The 8K base adds ~5.4 MB on high-DPI desktops.
- NASA Eyes and Moon Trek could not be inspected beyond their loading screens.
