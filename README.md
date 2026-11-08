# LunaNav — Lunar Landing Site Navigator

**By Team AFUQ.** LunaNav is a browser application for studying when the Sun and the Earth are visible from
NASA's nine Artemis III candidate landing regions near the lunar south pole. For one
observation point in each region it computes the Sun and Earth directions at any time between
1 July 2026 and 31 December 2028 (UTC), and compares them with the horizon formed by the
real terrain, measured by the Lunar Orbiter Laser Altimeter (LOLA) out to 150 km.

- Live site: https://www.afuq.website/
- Source: branch `review` (see `git log` for the exact commit)

LunaNav is an independent student project by Team AFUQ built for the NASA Space Apps Challenge 2026. It uses
public NASA data, but it is not a NASA product and is not endorsed by NASA. It is a
demonstration and decision-support prototype, not an operational mission-planning tool.

## What the application does

| View | Purpose |
|---|---|
| **Orbit** | A 3D Moon with LROC imagery and LOLA relief, lit by the Sun's direction at the selected time. Shows the nine NASA region outlines, a Landing Regions list, a polar locator map, live Sun/Earth readings and time controls. |
| **Surface** | The view from 2 m above the selected observation point: LOLA terrain to 150 km with cast shadows, the computed LOLA skyline, the Sun, the Earth and catalogued stars. Three display presets (Survey, Landscape, Physical) separate measured layers from display aids. |
| **Analysis** | Compares two scenarios (region, start date, duration of 7 days to 1 year). Shows how much of the period the Sun and/or Earth are above the terrain horizon, the longest gaps, timelines, horizon panoramas and a CSV export. |

The **Mission guide** reads short explanations aloud from pre-recorded MP3 files (one
narrator voice, with captions). Live readings of the current Sun/Earth state are voiced by a
small server function (`api/tts.js`) that needs an ElevenLabs key; without the key the app
shows those readings as captions. The app never uses the device's built-in speech voice.

The selected view, region, time and both Mission Analysis scenarios are kept in the URL (and the scenarios also in the browser), for example
`https://www.afuq.website/?mode=analysis&site=haworth&t=2027-01-16T10:00Z&a=malapert-massif,2027-01-01,30&b=nobile-rim-1,2027-01-01,365`.
Scenario format: `region,YYYY-MM-DD,days` with days one of 7, 14, 30, 60, 90, 180, 365.

## Prerequisites

- Node.js 20 or later and npm (last built with Node 26.13.0 and npm 11.20.0).
- A browser with WebGL 2 for the 3D views. Readings, time controls and Analysis also work
  without WebGL.
- Optional: the Vercel CLI, to run the voice endpoint locally or to deploy.
- Optional, only for regenerating the data: Python 3 with `numpy`, `Pillow` and `scipy` (`preprocess/requirements.txt`).

## Install and run

```bash
npm ci              # install the exact versions in package-lock.json
npm run dev         # development server (Vite), prints a local URL
npm run typecheck   # TypeScript check only
npm run test:data   # data-validation regression test
npm run test:science # production calculations: Horizons fixture, nine regions, crossings, intervals
npm test            # both test suites
npm run build       # type-check and production build into dist/
npm run preview     # serve the production build locally
```

`npm run dev` and `npm run preview` serve only the static app. The `/api/tts` endpoint does
not run there, so live readings fall back to captions; all recorded narration still plays.
To run the endpoint locally, use `vercel dev` with the key configured as described below.

## Environment variables

Only one variable exists, and it is optional:

| Variable | Used by | Effect if missing |
|---|---|---|
| `ELEVENLABS_API_KEY` | `api/tts.js` (server, live readings) and `scripts/generate-narration.mjs` (re-recording the MP3 clips) | Live readings appear as captions. The recorded clips in `public/audio/narration/` are unaffected. |

Paid-voice protection: `api/tts.js` accepts only the app's fixed reading template, only from LunaNav's own origins (afuq.website, its Vercel previews, localhost), and responses are cached by the CDN. The browser allows at most 25 new live readings per tab session; after that, readings are shown as captions. Recorded narration is not affected.

Copy `.env.example` to `.env.local` and fill in the value. `.env.local` is ignored by git and
must not be committed. On Vercel, set the variable in the project settings
(Environment Variables) instead. The key is read only on the server and is never sent to
the browser.

## Deployment

The site is hosted on Vercel, configured by `vercel.json` (`npm ci`, then `npm run build`,
serving `dist/` plus the `api/` function). The production domain is `www.afuq.website`.

```bash
vercel deploy          # preview deployment
vercel deploy --prod   # production
```

## Project structure

```
api/tts.js              server function: voices live readings (ElevenLabs), template-checked input
voice-config.mjs        the single narrator voice configuration (shared by api/ and scripts/)
src/
  App.tsx, main.tsx     application shell, fonts and styles
  audio/                narration engine, Mission guide UI, guided tours, narration scripts (narration.json)
  data/                 typed loaders for the precomputed data, release/version checks
  science/              coordinate frames, ephemeris interpolation, visibility and metrics
  state/                application state (zustand), settings, URL sync
  three/                Orbit globe and camera, region outlines and markers
  three/surface/        Surface terrain mesh (built in a Web Worker), sky objects, stars, aids
  ui/                   interface: masthead, region card, readings, time controls, drawers
  ui/analysis/          Mission Analysis page, timelines, horizon panorama
  styles/               design tokens (tokens.css) and component styles
public/
  data/                 ephemeris.json, sites.json, stars.json, validation.json, terrain tiles
  textures/             globe maps, 16K tiles, south-polar imagery and relief, region thumbnails
  audio/narration/      50 recorded narration clips and manifest.json
preprocess/             Python pipeline that produced public/data and public/textures
scripts/                generate-narration.mjs (records narration clips)
tests/                  data-validation and science tests, portable fixtures (tests/fixtures), marker-drift browser check
docs/ATTRIBUTION.md     data and asset credits
```

## Data and method (summary)

| Data | Source | Used for |
|---|---|---|
| Sun and Earth positions | NASA/JPL Horizons, hourly, 2026-07-01 to 2028-12-31 UTC | Azimuth and elevation at each observation point (interpolated to the minute) |
| Terrain | LRO LOLA `LDEM_80S_80M` (80 m/pixel), PDS Geosciences Node | Horizon profiles (720 directions to 150 km), Surface terrain, polar relief |
| Imagery | LRO LROC WAC global mosaic (NASA SVS) and LROC WAC South Pole Summer Mosaic (100 m) | Globe imagery, region pictures, surface brightness |
| Stars | Yale Bright Star Catalogue (5th ed.), V < 5.5 | Night sky in both 3D views |

Terrain grids around each point (Surface): 301 × 301 samples at 80 m (±12 km), 400 m (±60 km) and 1 km (±150 km); the mesh uses 80 m data to about 11 km, 400 m to 55 km and 1 km to 150 km. Accuracy terms are kept separate: Sun/Earth direction accuracy (≤ 0.006° against Horizons), terrain resolution (80 m, not independently validated) and Analysis sampling (15 or 60 minutes). See `docs/SCIENCE.md`.
| Regions | NASA's list of nine Artemis III candidate regions (28 October 2024) and its published map | Region names and outlines (digitised from the map, about 0.5 km accuracy) |

A body counts as visible when the centre of its disc is above the LOLA skyline in its
direction. Each region uses one observation point chosen by a fixed rule (on a 1 km grid
inside the outline, local slope at most 10°, the most hours of sunlight in 2027). These
points are not NASA landing sites, and results apply to that point only. Earth visibility is
a geometric line of sight, not a guaranteed communication link.

To regenerate the data, `pip install -r preprocess/requirements.txt`, download the raw products
listed in `docs/ATTRIBUTION.md` into `data_raw/` (about 1.3 GB, not included), and run the
scripts in `preprocess/`. The committed outputs in `public/` are enough to run and build
the app.

## Known limitations

- One observation point per region, observer height fixed at 2 m.
- Terrain detail is limited to 80 m; features smaller than about 160 m are not represented.
- Ephemeris coverage ends on 31 December 2028; the app does not extrapolate.
- No slope, hazard, thermal or communication-link modelling, and no suitability score.
- Not tested on physical iPhone, iPad or Android devices, Safari, or with screen readers.

## License and attribution

This snapshot does not include a software license file. Data and asset credits are listed
in `docs/ATTRIBUTION.md`. Fonts (IBM Plex Sans, IBM Plex Mono, Space Grotesk) are
installed from npm (`@fontsource`) under the SIL Open Font License 1.1.
