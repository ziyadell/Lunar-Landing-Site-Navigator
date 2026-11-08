# LunaNav — scientific methods and data provenance

LunaNav (Lunar Landing Site Navigator) by Team AFUQ.

Every number in the interface comes from one of the sources below, at a stated
location, time and method. This document is the reference for those claims.

## 1. Reference frames and conventions

| Item | Convention |
|---|---|
| Body frame | Moon Mean-Earth / polar-axis (ME). LOLA products use ME of DE421; Horizons reports sub-points in its Moon body-fixed frame. Differences between these realisations are far below the DEM resolution. |
| Shape | Sphere, R = 1737.4 km (LOLA reference radius). Elevations are relative to this sphere. |
| Coordinates | Planetocentric latitude, **east-positive** longitude, degrees. |
| Azimuth | Clockwise from local north (direction toward the lunar north pole). |
| Elevation | Above the local horizontal plane (sphere normal), degrees. |
| Time | UTC throughout. |

## 2. Sun and Earth positions

**Source:** NASA/JPL Horizons API, observer table, target 301 (Moon), observer
500@399 (Earth geocentre), quantities 14 (sub-observer point), 15 (sub-solar
point), 20 (range), hourly from 2026-07-01 00:00 to 2028-12-31 23:00 UTC
(21,960 epochs). Script: `preprocess/fetch_ephemeris.py`. Output:
`public/data/ephemeris.json`.

**Method in the app** (`src/science/geometry.ts`, `ephemeris.ts`):
1. Sub-points → unit vectors in the Moon frame; interpolated linearly between
   hourly epochs and re-normalised.
2. Sun is treated as infinitely distant (parallax from the lunar surface is ~2″).
3. Earth position = sub-Earth unit vector × Earth–Moon range; the topocentric
   vector is that minus the observer position (parallax ≈ 0.26° at the limb, included).
4. Azimuth/elevation from the local east/north/up basis.

**Validation** (`preprocess/validate_ephemeris.py` → `public/data/validation.json`):
Horizons was queried directly for topocentric apparent Az/El (quantity 4, airless)
of the Sun (10) and Earth (399) from each observation point (`CENTER=coord@301`,
geodetic site coordinates), 2027-01-01 → 2027-02-28, every 6 h (233 samples per
body per site). Maximum differences versus the app's method:

| | Elevation | Azimuth (× cos el) |
|---|---|---|
| Sun | 0.0007° | 0.0002° |
| Earth | 0.0006° | 0.006° |

**Coverage:** outside 2026-07-01 – 2028-12-31 the app reports "no ephemeris"
and never extrapolates.

## 3. Terrain data

**Source:** LRO LOLA Gridded Data Record `LDEM_80S_80M` (product V2.0,
LRO-L-LOLA-4-GDR-V1.0), PDS Geosciences Node. Polar stereographic (spherical),
80 m/px, 80°S–90°S, heights in metres relative to 1737.4 km.

Projection orientation was verified against IAU crater positions. At the
gazetteer centres of Shackleton and Cabeus the DEM gives −2788 m and −3736 m,
lower than at the same latitude with mirrored (−lon), flipped (180°−lon) or
rotated (lon+180°) longitudes (Shackleton: +672, +758, −1120 m; Cabeus: +1779,
−2751, −3114 m).

### 3.1 Terrain-corrected horizon profiles

For each observation point (`preprocess/process_dem.py`, `horizon()`):
- 720 azimuths (0.5° step).
- Samples along each great-circle ray from 80 m to 150 km (step 80 m, growing
  to 0.4 % of range).
- DEM bilinearly interpolated; each sample converted to a 3-D point on the
  1737.4 km sphere + height, so lunar curvature is exact.
- Observer 2 m above the surface. Skyline = maximum elevation angle along the ray.
- Samples outside the 80°S product edge are ignored.

**Visibility** in the app: a body is "visible" when its **disc centre** is above
the skyline at its azimuth (`marginDeg > 0`). States:
- *Above terrain horizon*
- *Blocked by terrain* (above the local horizontal plane but below the skyline)
- *Below local horizontal*

The readings panel also gives the **fraction of the disc above the skyline**,
using the circular-segment area for a locally flat skyline (Sun angular radius
from the Sun–Moon distance; Earth radius 6371 km at the current range).

This is a **geometric** line-of-sight calculation. Earth visibility indicates a
possible direct-to-Earth path, not a working communication link.

### 3.2 Surface View terrain

Three height tiles per site, all in the observation point's local tangent frame
(heights include the curvature drop):
- near: 301 × 301 samples, 80 m spacing (±12 km), from `LDEM_80S_80M`;
- far: 301 × 301 samples, 400 m spacing (±60 km), 5 × 5 block mean;
- regional: 301 × 301 samples, 1 km spacing (±150 km), 12 × 12 block mean
  (`preprocess/build_polar_products.py`). Cells outside the 80°S product are
  set to −20 km (below any skyline).

The scene renders **one continuous radial mesh** centred on the observer
(360 azimuth segments, 240 on small screens; ring spacing ≈ r·Δθ) out to
150 km, the same range as the horizon ray-tracing. Heights are bilinearly
sampled from the three tiles and cross-faded at 10–11 km and 50–55 km, so
there are no seams or level steps. The far tile's original −60 m offset
inside the near tile's footprint is removed before blending.

Within 11 km the mesh is denser than the 80 m DEM; those vertices are
bilinear interpolations, so they add **no** measured detail. The near field
is smooth by construction.

Vertex shading is derived from the DEM: each vertex is compared with the mean
height of six samples at ~3× the local mesh spacing, so hollows are darkened
and crests slightly brightened (an ambient-occlusion approximation computed
only from LOLA heights).

The ray-traced skyline (§3.1) is drawn as a thin annotation line. It coincides
with the rendered terrain edge. A Python check confirmed that the rendered
tiles never exceed the profile by more than 0.10° at any azimuth.

**Albedo:** the LROC WAC South Pole Summer Mosaic (100 m) is draped by each
vertex's exact polar-stereographic coordinate (site window, then the polar cap).
Pixels in 2010 shadow use the regional mean, and the response is compressed
(`(a/ā)^0.6`, 0.6–1.4). Within 5 km of the sites, 24–65 % of mosaic pixels are
shadowed, and the visible foreground spans one or two pixels, so the effect is
km-scale and subtle. It adds no fine detail.

Cast shadows cover ±80 km (~39 m per shadow texel at 4096²). Beyond that,
terrain is shaded but casts no shadows. Direct sunlight is scaled by the
visible fraction of the solar disc at the observation point.

**Display presets** (each has one purpose; individual toggles remain):

| Preset | Purpose | Layers |
|---|---|---|
| Survey | read measurements | LOLA skyline line, az/el grid, range rings, stars, lifted shadows, illustrative fine texture |
| Landscape (default) | orientation / presentation | terrain, Sun, Earth, stars, LOLA skyline line, lifted shadows, fine texture; no grid or rings |
| Physical | appearance under physical light | sunlight and faint Earthshine only, fine texture, stars; no skyline line, no lifted shadows |

Display aids that are not measurements:
- *Enhanced visibility*: a hemisphere fill light and ~9× brighter Earthshine.
  Real shadowed terrain is much darker.
- *Fine texture (illustrative)*: a procedural small-crater / regolith normal map
  (24 m repeat, no low-frequency octaves). It fades out between 60 m and 320 m
  from the camera so it cannot alias into moiré. LOLA does not resolve anything
  at this scale, so the texture is **off by default** and on only in the
  "Realistic" preset.
- Range rings at 100 m, 250 m, 500 m and 1 km. From a 2 m eye height, farther
  rings sit within ~0.1° of the horizon. On convex summits even the near rings
  can fall behind the crest, which is geometrically correct.

### 3.3 Star field

Stars: Yale Bright Star Catalogue, 5th revised edition (VizieR V/50), V < 5.5,
2,847 stars, J2000. They are rotated into the Moon-fixed frame with the IAU 2009
Moon rotation model (Archinal et al. 2011, including all 13 periodic terms), and
then into the observer's local frame. Validation (`preprocess/build_stars.py`):
the Sun's J2000 direction from the Moon's centre (Horizons), rotated with the
same model, matches the Horizons sub-solar point to **0.008° max** (122 epochs,
2026–2028). Stars are shown regardless of Sun elevation (there is no
atmosphere). Their rendered size and brightness are a display mapping of
magnitude, not a photometric simulation.
Direct sunlight in the scene is scaled by the visible fraction of the solar disc
at the observation point, so a Sun hidden behind distant terrain puts the
observer in shadow. Earthshine is a fill light from Earth's direction scaled by
Earth's illuminated fraction, (1 − cos θ)/2. Its absolute brightness is
exaggerated for legibility and labelled as such.

## 4. Candidate regions and observation points

The nine regions are NASA's Artemis III candidates of **28 October 2024**
([NASA](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/)).
NASA published them only as outlines on a map. The outlines were digitised by registering
NASA's map to the LROC WAC South Pole Summer Mosaic (similarity transform maximising image
correlation; `preprocess/register_nasa_regions.py`, which uses SciPy); accuracy about 0.5 km.

**Observation point rule** (`preprocess/process_dem.py`): of candidate points on a **1 km grid
inside the outline** with local slope at most **10°** (LOLA, 240 m baseline), the one where the
Sun's centre is above the LOLA horizon for the largest fraction of **2027 hours**. The rule
favours well-lit high ground, so a point represents a well-lit location inside its region, not
the region as a whole, and is not a NASA-designated landing site.

| Region | Lat | Lon E | Elevation | 2027 Sun-visible | Outline size |
|---|---|---|---|---|---|
| Peak near Cabeus B | -83.5925 | -68.4540 | 4579 m | 57.9 % | 20.9 × 20.0 km |
| Haworth | -86.3354 | -23.3339 | 2797 m | 55.9 % | 31.1 × 29.3 km |
| Malapert Massif | -85.9119 | -4.1570 | 4773 m | 63.1 % | 22.1 × 20.8 km |
| Mons Mouton Plateau | -84.5635 | 37.9959 | 6632 m | 55.4 % | 78.1 × 58.0 km |
| Mons Mouton | -85.4781 | 31.0203 | 6283 m | 66.8 % | 17.5 × 15.9 km |
| Nobile Rim 1 | -85.1394 | 36.5272 | 6745 m | 64.2 % | 21.4 × 20.3 km |
| Nobile Rim 2 | -83.8179 | 59.0760 | 1057 m | 50.6 % | 20.9 × 19.8 km |
| de Gerlache Rim 2 | -88.6320 | -68.0601 | 1737 m | 58.0 % | 21.4 × 20.0 km |
| Slater Plain | -87.2638 | 127.5189 | 529 m | 62.4 % | 21.4 × 20.0 km |

Reference features (names, centres, diameters) come from the IAU Gazetteer of Planetary
Nomenclature and are used in region descriptions only.

## 5. Mission Analysis metrics

Series are sampled every 15 min (periods ≤ 60 days) or 60 min (longer).
Durations are therefore accurate to ± one sample. Runs that touch the period
boundary are reported as "≥". Metrics: % of samples with the Sun / Earth / both
/ neither above the skyline, longest continuous runs, and elevation ranges.
"Observations" are direct arithmetic comparisons of these metrics. No
suitability ranking or score is computed.

## 6. Global Moon rendering (multi-resolution)

| Level | When | Imagery | Relief |
|---|---|---|---|
| Global | always | LROC WAC mosaic, 4K base map (≈2.7 km/px at the equator); 8K base (≈1.3 km/px) on high-DPI screens | LOLA `ldem_16` normal map, 1.9 km |
| Regional | visible patches when on-screen ground resolution < 2 km/px | 16K mosaic tiles (16384 × 8192; **≈0.67 km/px at the equator**, 0.022° per pixel in latitude) | as above |
| South polar cap (poleward of 80.6°S) | pole in view | **LROC WAC South Pole Summer Mosaic**, 643 nm, 100 m native, as a 4096² texture (146 m/px; 2048² on small screens) | LOLA `LDEM_80S_80M` object-space normals, 2048² (293 m) at start, 4096² (146 m) when zoomed |
| Selected site | the selected region | the same mosaic at its **native 100 m**, 2048² window (204.8 km) | LOLA normals on the same 100 m grid |

- The polar mosaic (Speyerer et al. 2020) combines images from 2010-09-21 to
  2010-10-23, chosen for minimal shadows and map-projected onto LOLA. Its
  georeferencing was verified with permanently shadowed crater floors
  (Shackleton, Haworth, Faustini, Shoemaker, Cabeus), which are dark only in
  the correct orientation. Its brightness is matched to the global map on lit
  pixels at 80.5–83°S (gain 1.54).
- Baked shadows from 2010 remain in the mosaic. Pixels in shadow carry no
  albedo information, so the shader replaces them with the regional mean
  albedo, and the **current** lighting decides what is dark. Shape always comes
  from LOLA.
- Relief normals are computed from the DEM **after** a box low-pass matched to
  the output grid. Point-sampling the 80 m grid at 146/293 m had produced a
  ~1 km moiré (fixed in this release).
- Zoom limits follow the data. The site view stops at ~104 km range near the
  pole (≈80 m per screen pixel at 1440 × 900) and at ~570 km elsewhere. The
  on-screen scale bar names the imagery and relief resolution and flags
  "beyond imagery resolution" when the screen is finer than the source.
- 16K tiles are held in an LRU set: at most 10 resident on the high tier,
  4 on the standard tier (~22 MB GPU each with mipmaps).
- Lighting: the real Sun direction at the selected epoch. Photometry blends
  Lambert with Lommel–Seeliger (lunar-Lambert approximation). There are no
  cast shadows on the globe; the Surface View has them.
- The polar blend weight is `1 − smoothstep(−81.2°, −80.6°, lat)`. The earlier
  release passed reversed edges to `smoothstep`, which GLSL leaves undefined.

## 7. Accuracy terms (kept separate)

- **Direction accuracy** (Sun/Earth azimuth and elevation): compared with JPL Horizons
  topocentric output, worst 0.0008° in elevation and 0.006° in azimuth (validation.json, nine
  points, Jan–Feb 2027); re-checked by `npm run test:science` against a stored Horizons fixture.
  This says nothing about terrain.
- **Terrain/horizon accuracy**: limited by the 80 m LOLA grid; not independently validated.
- **Rendering**: the Surface terrain mesh is a display of the same data; the horizon line is the
  computed profile. Rendered appearance is not a measurement.
- **Sampling resolution**: Mission Analysis checks visibility every 15 min (≤ 60 days) or 60 min
  (longer), so durations are accurate to one sample.

## 8. Known limitations

- 80 m DEM: small boulders, crater rims narrower than ~160 m and sub-pixel
  relief are not represented; near-field horizons may be smoothed.
- Horizon search limited to 150 km and the 80°S DEM edge.
- One observation point per region; observer height fixed at 2 m.
- No refraction (airless body), no instrument field of view, no link budget.
