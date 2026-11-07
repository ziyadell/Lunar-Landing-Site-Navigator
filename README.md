# Lunar Landing Site Navigator

An interactive instrument for examining **Sun and Earth visibility at candidate
landing regions near the lunar south pole**, built for the NASA Space Apps
Challenge 2026 ("Lunar Landing Site Navigator").

> Independent hackathon project. Not an official NASA product and not endorsed by
> NASA. NASA data are used under NASA's media and data usage guidelines — see
> [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md).

## What it does

| Mode | Purpose |
|---|---|
| **01 Orbital View** | Interactive 3D Moon: 4K base map that streams 16K LROC WAC tiles as you zoom, LOLA relief (146 m/px around the south pole), real Sun direction at the chosen epoch. Select a region, fly to it, read conditions at its observation point. |
| **02 Surface View** | Stand at the observation point: LOLA terrain (24 km @ 80 m + 120 km @ 400 m) with cast shadows and DEM-derived occlusion shading, the computed terrain skyline, the Sun and Earth at their computed azimuth/elevation, 2,847 real stars (Yale BSC5), az/el grid, range rings, a 360° skyline strip, and labelled display aids (enhanced visibility, illustrative fine texture). |
| **03 Mission Analysis** | Compare two site + period scenarios: % of time Sun / Earth / both are above the terrain horizon, longest gaps, elevation ranges, timelines, horizon panoramas, CSV export. |

Region, epoch and mode stay synchronised across all three views and are kept in
the URL (`?mode=surface&site=haworth&t=2027-01-12T06:00Z`) so any view can be shared.

### Scientific basis (summary — full detail in [docs/SCIENCE.md](docs/SCIENCE.md))

- **Ephemeris:** NASA/JPL Horizons, hourly sub-solar and sub-Earth points on the
  Moon plus Earth range, 2026-07-01 → 2028-12-31 UTC. The app derives topocentric
  azimuth/elevation by vector geometry. **Validated** against Horizons' own
  topocentric Az/El for every observation point: max error 0.007°.
- **Terrain:** LRO LOLA `LDEM_80S_80M` (PDS). Terrain horizon profiles are
  ray-traced to 150 km in 0.5° azimuth steps, so visibility is **terrain-corrected**,
  not just geometric.
- **Observation points:** NASA has not published coordinates for its candidate
  regions (≈15 × 15 km each), so each region uses one representative point,
  chosen by a documented, reproducible rule anchored to the IAU Gazetteer feature.
  These are **not** NASA-designated landing sites.
- **No invented numbers.** Outside the precomputed ephemeris range the app shows
  "no data" rather than extrapolating. No suitability scores are computed.

## Run it

Requirements: Node 18+ (tested on Node 26 / npm 11).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build → dist/
npm run preview    # serve dist/
```

`dist/` is fully static (relative `base: './'`) and can be deployed to GitHub
Pages, Netlify, Vercel, S3, etc. All scientific data ships precomputed in
`public/data/`; there are no API keys or runtime calls to external services.

## Regenerate the data (optional)

The committed `public/` assets were produced by the scripts in `preprocess/`.
Raw downloads (~250 MB) go to `data_raw/`, which is git-ignored.

```bash
pip install -r preprocess/requirements.txt         # numpy, Pillow
python preprocess/fetch_ephemeris.py               # JPL Horizons → public/data/ephemeris.json
# download raw inputs (see docs/ATTRIBUTION.md for URLs) into data_raw/:
#   lroc_color_poles_8k.tif, lroc_color_poles_16k.tif, ldem_16.tif  (NASA SVS CGI Moon Kit)
#   ldem_80s_80m.img, ldem_80s_80m.lbl     (PDS Geosciences, LOLA GDR polar)
python preprocess/build_globe_textures.py          # globe colour + normal maps
python preprocess/process_dem.py                   # observation points, horizons, terrain tiles, polar-cap normals
python preprocess/validate_ephemeris.py            # cross-check vs Horizons topocentric → public/data/validation.json
python preprocess/build_stars.py                   # Yale Bright Star Catalogue + IAU Moon rotation validation
```

`process_dem.py` takes a few minutes: it evaluates ~490 candidate points against a
full year of hourly Sun positions.

## Project structure

```
src/
  data/        typed scientific interfaces, loaders, React data context
  science/     geometry (frames, topocentric Az/El), ephemeris interpolation, visibility & metrics
  state/       app store (zustand), URL sync
  three/       Moon material + globe, orbital scene & camera rig, surface scene
  ui/          top bar, panels, time controls, mobile sheet, compass
  ui/analysis/ comparison workspace, timelines, horizon panorama
  styles/      design tokens + global styles
preprocess/    Python data pipeline (reproducible)
public/data    ephemeris.json, sites.json, validation.json, terrain/*.bin
public/textures  globe colour/normal maps, south polar cap normal map
docs/          SCIENCE.md, ATTRIBUTION.md
```

## Status

**Implemented**
- 3D Moon with authentic LRO imagery and LOLA relief; detailed LOLA polar cap; real-epoch lighting; adaptive texture tier and pixel ratio; WebGL-missing and scene-error fallbacks.
- Region selection, camera focus / global / reset, Orbital → Surface dive transition.
- Surface View with terrain-corrected horizon, Sun/Earth placement and labels, cast shadows, DEM-derived occlusion shading, real star field, az/el grid, range rings, 360° skyline strip (click to turn), Earth phase, heading tape, pointer/touch/keyboard look, FOV zoom.
- Display aids that are not measurements are labelled and switchable: "Enhanced visibility" fill light (default on; "physical" lighting when off) and "Fine texture (illustrative)" below LOLA resolution.
- UTC date/time controls, ±hour/day stepping, playback through the ephemeris, 30-day terrain-corrected visibility strip (also a keyboard slider).
- Mission Analysis with two scenarios, metrics table, factual observations, timelines, horizon panoramas, CSV export, explicit limitations.
- Responsive layouts (desktop deck, tablet, mobile bottom sheet); reduced-motion support.

**Not implemented / limitations**
- Only 4 of NASA's candidate regions; one observation point each (no free point picking — that needs client-side horizon computation).
- Ephemeris coverage is fixed to 2026-07-01 – 2028-12-31.
- Visibility uses the body's disc centre; partial-disc fraction is shown in readings only. No atmospheric/instrument models, no communication link budgets, no thermal or slope hazard analysis.
- Measured surface terrain is limited to 80 m DEM resolution; the optional fine texture below that scale is illustrative and labelled as such. Earth is drawn as a shaded disc (correct phase, no surface imagery).
- The official challenge page could not be fetched from the development environment (TLS certificate error); requirements were taken from the team brief.
- Mission Voice Assistant: deferred by design.
