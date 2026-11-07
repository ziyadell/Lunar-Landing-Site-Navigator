# Scientific methods and data provenance

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

### 3.2 Surface View heightfields

Two tiles per site, both in the observation point's local tangent frame
(heights include the curvature drop):
- near: 301 × 301 samples, 80 m spacing (24 km);
- far: 301 × 301 samples, 400 m spacing (120 km), from a 5 × 5 block-averaged
  DEM; cells under the near tile are lowered 60 m so the near tile always renders on top.

Beyond 60 km the computed skyline is drawn as a wall on a 90 km ring whose
normals face the observer, so skyline segments opposite the Sun receive light.

Vertex shading on both tiles is derived from the DEM: cells lower than the
mean of their 5×5 and 17×17 neighbourhoods are darkened, crests slightly
brightened (an ambient-occlusion approximation computed only from LOLA heights).

**Display aids (not measurements), all labelled and switchable in the UI:**
- *Enhanced visibility* (default on): a hemisphere fill light and ~9× brighter
  Earthshine so shadowed terrain stays readable. Off = physical lighting
  (sunlight + faint Earthshine only).
- *Fine texture (illustrative)*: a procedurally generated, tileable small-crater /
  regolith normal map on the near tile (24 m repeat). LOLA cannot resolve
  anything this small; the texture only conveys surface roughness.
- Az/El grid (10° altitude circles, 30° azimuth spokes), ground range rings at
  1, 2, 5 and 10 km draped on the DEM, and a 360° skyline strip.

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

NASA's Artemis III candidate regions (NASA release 22-089, Aug 2022) are about
15 × 15 km. NASA does not publish their coordinates, so the app anchors each
region to an IAU Gazetteer of Planetary Nomenclature feature (retrieved
2026-11-07) and selects **one representative observation point** with a stated rule:

| Region | IAU reference feature | Centre (lat, lon E) | Rule |
|---|---|---|---|
| Malapert Massif | Mons Malapert (ID 16338), 67 km | −85.98, −1.67 | Of 172 points on a 2 km grid within 15 km of the centre, the one with the Sun's centre above the LOLA skyline for the largest fraction of 2027 hours |
| Mons Mouton (listed in 2022 as "Leibnitz Beta Plateau") | Mons Mouton (ID 16070), 130 km | −84.60, 31.00 | Same as above |
| Nobile Rim 1 | Nobile crater (ID 4321), 79.3 km | −85.28, 53.27 | Of 72 rim-crest points (highest point between 0.8 and 1.2 crater radii on radial profiles every 5°), the most sunlit in 2027. NASA does not distinguish Rim 1 from Rim 2 by coordinates, so this is a representative rim point. |
| Haworth | Haworth crater (ID 14502), 51.4 km | −87.45, −5.17 | Same rim-crest rule |

Resulting points (LOLA elevation; 2027 Sun-visible fraction used for selection):

| Region | Lat | Lon E | Elevation | 2027 Sun-visible |
|---|---|---|---|---|
| Malapert Massif | −85.8746 | −4.8806 | 4430 m | 55.6 % |
| Mons Mouton | −84.3683 | 32.0082 | 5600 m | 51.0 % |
| Nobile Rim 1 | −85.5525 | 37.5526 | 6099 m | 70.7 % |
| Haworth | −87.0201 | −24.4343 | 1721 m | 54.2 % |

The rule deliberately favours well-lit locations because the real candidate
regions were chosen with illumination as a criterion. The points remain
**illustrative of their regions**. They are not landing sites, and the results
do not represent the whole 15 × 15 km region.

## 5. Mission Analysis metrics

Series are sampled every 15 min (periods ≤ 60 days) or 60 min (longer).
Durations are therefore accurate to ± one sample. Runs that touch the period
boundary are reported as "≥". Metrics: % of samples with the Sun / Earth / both
/ neither above the skyline, longest continuous runs, and elevation ranges.
"Observations" are direct arithmetic comparisons of these metrics. No
suitability ranking or score is computed.

## 6. Global Moon rendering

- Colour: LROC WAC mosaic with polar fill (NASA SVS CGI Moon Kit), sRGB. The
  globe is built from 8 × 4 patches. Each starts with its slice of the 4K map;
  when the camera is within 2.9 Moon radii, visible patches stream their 2048²
  tile of the **16K** mosaic (16384 × 8192, ≈0.33 km/px at the equator).
- Relief: normal map from LOLA `ldem_16` at true vertical scale. Poleward of
  ~80.6°S it is replaced by object-space normals from `LDEM_80S_80M`, resampled
  to 4096² (~146 m/px), blended over 0.6°.
- Rendering at full device pixel ratio (≤ 2×), no adaptive down-scaling, with
  maximum anisotropic filtering.
- Lighting: the real Sun direction at the selected epoch. Photometry blends
  Lambert with Lommel–Seeliger (lunar-Lambert approximation) to avoid unrealistic
  limb darkening. No cast shadows on the globe; the Surface View has them.
- The globe imagery itself contains illumination baked in from the source mosaic.
  Use the Surface View and the readings, not the globe shading, for quantitative judgements.

## 7. Known limitations

- 80 m DEM: small boulders, crater rims narrower than ~160 m and sub-pixel
  relief are not represented; near-field horizons may be smoothed.
- Horizon search limited to 150 km and the 80°S DEM edge.
- One observation point per region; observer height fixed at 2 m.
- No refraction (airless body), no instrument field of view, no link budget.
