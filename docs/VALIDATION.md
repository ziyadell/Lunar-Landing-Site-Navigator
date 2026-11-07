# Validation record

What was checked, how, and with what result, for the deployed build at
https://lunar-landing-site-navigator-six.vercel.app (Vercel production,
deployed 2026-11-07 from commit `65140f4`). The record is factual and includes
gaps and failures; it is not a quality score.

## 1. Build

| Check | Result |
|---|---|
| `npm run build` (tsc strict + Vite) on the development machine | Pass |
| Fresh `git clone` → `npm ci` → `npm run build` | Pass. Terrain `.bin` files byte-identical after the git round trip |
| Vercel production build (`npm ci`, `npm run build`, output `dist/`) | Pass |
| Deployed JS bundle hash equals local build (`index-Ct_ib_ZQ.js`) | Yes. The same code was deployed |
| Secrets scan (tokens, keys, passwords, emails) of committed files | None found |

## 2. Scientific data and calculations

| Check | Method | Result |
|---|---|---|
| Topocentric Sun/Earth geometry | App's vector method vs Horizons topocentric apparent Az/El (quantity 4, `coord@301`), 4 sites × 2 bodies × 233 epochs (Jan–Feb 2027) | Max error 0.0007° elevation (Sun), 0.006° azimuth (Earth) |
| Moon orientation model (for stars) | IAU 2009 model rotating Horizons' Sun J2000 direction vs Horizons sub-solar point, 122 epochs 2026–2028 | Max error 0.008° |
| LOLA DEM orientation | Known crater depths at IAU gazetteer centres (Shackleton, Cabeus) vs mirrored/rotated longitudes | Consistent only with the correct orientation |
| Surface View terrain vs horizon profile | Max elevation angle of the rendered terrain tiles vs the ray-traced skyline, every 5° azimuth, all 4 sites | Tiles never exceed the skyline by more than 0.10° |
| Deployed data identical to local | HTTP size of `ephemeris.json`, `sites.json`, terrain tiles, textures on the live URL | Identical byte counts |
| CSV export content | Exported 60-day Haworth scenario from the live site | 5,760 rows at 15-min steps, provenance header, values match on-screen metrics |

## 3. Functional tests on the live deployment

Run in the Claude desktop app's embedded Chromium browser against the public URL.
Interactions were driven by real UI controls (DOM clicks, keyboard events,
synthetic wheel/pointer events on the canvas).

| Area | Tested | Result |
|---|---|---|
| Orbital View | Moon renders; base + 16K tiles load (HTTP 200); all 4 regions selectable and update readings; Focus region / Global view; wheel zoom; drag rotate | Pass |
| Transition | Enter Surface View → mode switches, terrain and stars load; Return to orbit | Pass |
| Surface View | Terrain, skyline, Sun and Earth with labels; Face Sun / Face Earth match computed azimuths (e.g. heading 019° for Earth az 18.63°); 360° strip; display toggles | Pass |
| Time controls | Date input, ±1 h/±1 d stepping, visibility strip | Pass (tested in development; read back on the live site via URL time) |
| Mission Analysis | Change region / start date / period → metrics, observations, timelines, panoramas recompute; CSV export | Pass |
| Console | Errors during the above flows | None, except one test artefact (see §6) |

## 4. Responsive checks on the live deployment

| Width | Modes checked | Horizontal overflow | Notes |
|---|---|---|---|
| 375 × 812 | Orbital, Surface, Analysis | None | Bottom sheet; all visible controls ≥ 40 px tall |
| 768 × 1024 | Orbital, Surface, Analysis | None | Compact layout |
| 1024 × 768 | Orbital, Surface, Analysis | None | Three-column deck; display toggles wrap below the dock |
| 1440 × 900 | Orbital, Surface, Analysis | None | Full deck |

Screenshots of the live site are in [`screenshots/`](screenshots/). The capture
tool downsamples them: desktop images are 800 × 500 (from a 1440 × 900 viewport),
mobile images are 375 × 812.

## 5. Not tested

- Real phones/tablets (touch tested only via emulated viewport and synthetic events).
- Browsers other than Chromium (Safari/WebKit, Firefox).
- Frame rate / GPU performance on low-end hardware. No FPS or Lighthouse measurements were taken.
- Screen readers. Keyboard paths and ARIA labels exist but were not tested with assistive technology.
- Real-time animation smoothness. The test browser pane was in the background,
  which throttles animation frames, so camera transitions were exercised in
  their "instant" path.

## 6. Known issues

1. **Fine texture moiré:** at grazing angles the illustrative regolith normal map
   shows horizontal banding in Surface View (most visible on mobile). It can be
   switched off with "Fine texture (illustrative)".
2. **Mobile metrics table** is ~8 px wider than its card at 375 px, so it scrolls
   horizontally inside the card. The page itself does not overflow.
3. **Duplicate normal-map download:** both 2K and 4K globe normal maps load on
   desktop, because the texture tier is decided after the WebGL context exists
   (~0.5 MB wasted).
4. **Eager 16K tile loading:** zooming in loads every tile within a generous
   visibility cone. After exploring the pole, all 32 tiles (≈20 MB) may be
   downloaded.
5. **Test artefact:** a synthetic pointer drag produced
   `releasePointerCapture: No active pointer`. This comes from the test's fake
   pointer, not from a real mouse or touch.
6. **Globe shading:** the globe has no cast shadows, and the LROC mosaic contains
   baked-in illumination. Quantitative judgements should use the Surface View
   and readings.
7. **Vercel deploys come from the CLI.** The Vercel project is not connected to
   the GitHub repository for automatic deploys.
8. **Challenge page:** the official challenge page could not be read from the
   development environment (TLS certificate error).

## 7. Quality pass (branch `quality-pass`, Nov 2026)

The improvements, root causes, performance measurements and the rerun of all
validation checks for this branch are documented in
[QUALITY-PASS.md](QUALITY-PASS.md). Summary of the new results:

- Ephemeris and Moon-orientation validation reproduced (≤ 0.007° / 0.008°).
- Independent Python recomputation of a Mission Analysis scenario matches the app exactly.
- Polar mosaic georeferencing verified against five permanently shadowed craters.
- Edge (headless, software WebGL) and Firefox 159 (local GPU) pass all three modes with no console errors.
- WebKit/Safari, real touch devices, screen readers and GPU frame-rate profiling remain untested.

## 8. Experience pass (branch `experience-pass`)

Six regions validated (≤ 0.0009° vs Horizons; Moon orientation ≤ 0.0083°).
Edge (all sizes) and Firefox 159 (local GPU) pass all modes with no console
errors. Details: [EXPERIENCE-PASS.md](EXPERIENCE-PASS.md).
