# Review pass — November 2026

Branch `review`, built on `redesign`. Recovery checkpoint: tag
`checkpoint/redesign-0e2f99e` (the previous preview). Production is untouched.

This pass answers two briefs together: a visual completion pass (Moon sharpness, star
field, all nine regions, Surface View, Sun and Earth, fewer notes) and a senior design
review (exploration first, discovery, Surface usability, time, interaction details,
first-time guidance).

## 1. All nine NASA candidate regions

**Before:** six regions. Each was placed by a rule around an IAU feature, because NASA
publishes no coordinates. Three regions (Mons Mouton Plateau, Nobile Rim 2, Slater Plain)
were left out for lack of a defensible location.

**Finding:** the only official geometry is NASA's map of the nine regions (release of
28 Oct 2024; also Image 1 of George et al., LPSC 2026 #1901). Checked against it, three of
the six previous points lay **outside** their NASA region:

- Peak near Cabeus B was about 80 km away.
- The "Mons Mouton" point sat inside the Mons Mouton Plateau box.
- de Gerlache Rim 2 was outside its box.

**Method** (`preprocess/register_nasa_regions.py`):

1. NASA's map (`artemis-iii-landing-region-candidates.jpg`, credit NASA/GSFC/ASU/JSC/AGDT)
   is registered to our own LROC WAC South Pole Summer Mosaic. The registration is a
   similarity transform (scale, rotation, pole position) that maximises image
   correlation. It is seeded by the map's 50 km scale bar and South Pole star.
   - Result: normalised cross-correlation 0.97.
   - Six independent tiles show residual shift below 0.5 km. Scale and rotation needed
     no correction.
2. The yellow region boxes are detected and converted to polar-stereographic km and
   lat/lon. The outline accuracy is about 0.5 km.
3. One observation point per region, by a single rule (`preprocess/process_dem.py`):
   - Candidates lie on a 1 km grid inside the outline (2 km for the 78 × 58 km Mons
     Mouton Plateau).
   - Candidates with local LOLA slope above 10° (240 m baseline) are excluded.
   - The chosen point is the one where the Sun's centre clears the LOLA skyline for the
     largest share of 2027 hours.
4. For every point, the pipeline then recomputed the horizon (rays to 150 km), terrain
   tiles, 100 m imagery window, normals, the region picture, and the locator map.
5. The JPL Horizons check was re-run for all nine points. Maximum error was 0.006° in
   azimuth and 0.0008° in elevation.

| Region | Outline (km) | Point | 2027 Sun |
|---|---|---|---|
| Peak near Cabeus B | 21 × 20 | 83.59°S 68.45°W | 57.9 % |
| Haworth | 31 × 29 | 86.34°S 23.33°W | 55.9 % |
| Malapert Massif | 22 × 21 | 85.91°S 4.16°W | 63.1 % |
| Mons Mouton Plateau | 78 × 58 | 84.56°S 38.00°E | 55.4 % |
| Mons Mouton | 17 × 16 | 85.48°S 31.02°E | 66.7 % |
| Nobile Rim 1 | 21 × 20 | 85.14°S 36.53°E | 64.2 % |
| Nobile Rim 2 | 21 × 20 | 83.82°S 59.08°E | 50.6 % |
| de Gerlache Rim 2 | 21 × 20 | 88.63°S 68.06°W | 58.0 % |
| Slater Plain | 21 × 20 | 87.26°S 127.52°E | 62.4 % |

The outlines are NASA's. The points are ours, chosen by the rule above. The interface
says so in the region card, the atlas, the measurements drawer and Data & method.

**Changed values:** because points moved into the official outlines, readings differ
from earlier previews. The earlier Malapert check (59.4 % Sun in January 2027) referred
to the old point.

## 2. Orbital View

- **Sharpness:** the problem was low local contrast, not resolution. The fix is
  display processing of NASA imagery only; no detail is added:
  - The global map and the polar mosaics are sampled with a small negative mip bias.
  - A mild unsharp mask is applied: the fine mip minus a coarse mip of the same texture.
  - The south-polar WAC mosaic (293 m/px) now loads at the default view. Before, it only
    loaded when zoomed in, so the hero area showed the coarser global map.
  - 16K tiles are requested by device pixels rather than CSS pixels.
- **Stars:**
  - The real Yale Bright Star Catalogue, rotated into the Moon-fixed frame with the IAU
    model at the selected date.
  - Small and dimmed with a compressed magnitude scale, so they never compete with the
    sunlit Moon.
  - Drawn just inside the far plane, so they always sit behind the globe.
- **NASA outlines on the globe:** the selected region is cyan, the others faint. They
  fade in as you approach the pole. At close range the outline is labelled.

## 3. Surface View

- **Lighting:** "enhanced visibility" used a flat hemisphere light, which made the
  ground muddy and shapeless whenever the Sun was behind terrain. It is now:
  - a soft key light from the Sun's true azimuth, raised to at least 7°;
  - a neutral sky fill;
  - softer Earthshine.

  Relief reads in any situation, and the light still comes from the right direction.
  This mode is labelled a display aid.
- **Ground texture (illustrative):**
  - Two rotated samples at non-integer scales, so the tile does not repeat visibly.
  - A finer octave within about 45 m of the eye.
  - Faint albedo mottling at three scales.
  - Everything fades out with distance. Beyond a few hundred metres, only measured LOLA
    relief and LROC brightness remain.
- **Sun:** a true-size (0.53°) white disc, a tight halo and a faint wide corona.
- **Earth:** a true-size (≈1.9°) disc at the correct phase, with limb darkening, soft
  terminator and a thin atmospheric rim. No continents are drawn, because the app does
  not model Earth's rotation.
- **Visibility:** both glows are depth-tested, so terrain hides them exactly where it
  hides the body.
- **Orientation:**
  - The heading tape is unchanged.
  - A new **Reset view** button returns to the default: the Sun if it is up, otherwise
    Earth, at a 55° field of view.
  - Sky labels are shorter: name, elevation, and "behind terrain" when relevant.
- **Measured vs display aids:** the layers popover groups layers as *Measured* (LROC
  brightness, LOLA skyline, stars) and *Display aids · not measurements* (lifted shadows,
  fine texture, grid, rings). The preset names are now Landscape (default), Survey and
  Physical.
- **Loading:** the descent fade shows "Loading LOLA terrain…".

## 4. Interaction design

| Area | Change |
|---|---|
| Choosing a region | The region card holds a **locator map**: our LROC polar mosaic with NASA's nine outlines as real buttons (enlarged hit areas, focus rings, live Sun/Earth dots). The selected outline is lit and shows its observation point. This replaces the decorative thumbnail strip. |
| Region pictures | Atlas pictures cover NASA's outline, with the observation point marked. |
| Focus mode | **F** key or the masthead button. Hides everything except the scene, the time control and the way back. Escape or a drawer exits. |
| Drawers | A drawer no longer hides the subject. The camera **lens-shifts** to re-centre the Moon or horizon in the free space. The camera does not move, so geography and markers stay exact. |
| Time | Playback at 1 h/s, 6 h/s or 1 day/s, in whole-minute steps about 20 times a second. Pause on any manual step. The sheet says **UTC** and shows the ephemeris coverage. |
| First visit | A dismissible four-line hint in the empty top-left corner: rotate, pick a region, explore the surface, compare. It goes away when dismissed, when a region is chosen, or when you leave Orbit. It never returns once dismissed. |
| Notes | Analysis "Method and limits" and the atlas image notes moved behind disclosures. The close-range globe note is shortened. Layer labels are in plain words. |
| Targets & states | Round buttons 36 px, text buttons 36 px, primary 40 px. One 2 px focus outline everywhere. A pressed state on buttons. |
| Phone | The locator is hidden; previous/next and Compare all remain. The hint floats compactly at the bottom. |

### Glass blur and GPU cost

The previous build had ten floating surface types with `backdrop-filter: blur(16px)
saturate(1.15)`. A blur re-samples the canvas under each panel every frame the scene
changes: while orbiting, during playback and during the descent. Cost grows with
radius × area.

The blur affects only what lies behind a panel. It is unrelated to Moon sharpness,
which was a texture-contrast issue (§2).

This pass:

- raises panel opacity to 0.84;
- uses an 8 px blur without saturate;
- makes surfaces that rarely sit over the scene opaque, with no blur (drawers, time
  sheet, popovers, hint);
- turns blur off under `prefers-reduced-transparency`.

Frame-rate impact on real GPUs was **not measured** (§6).

## 5. Tests

Headless Edge (SwiftShader) against the dev build, 1440 × 900:

- Locator: clicking the Slater Plain outline selects it, updates the card, and dismisses
  the hint. Nine outlines.
- Atlas: nine cards, nine observation-point markers.
- Focus mode: the button sets the mode, panels go to opacity 0 and are hidden from
  hit-testing, Escape exits, and opening a drawer exits.
- Playback: 6 h/s advanced 16.2 simulated hours in about 2.7 s of wall time on the slow
  renderer. That matches the requested speed.
- Stars: 2,847 points drawn. They were visible after the shader fix.
- TypeScript: clean. No console errors in the runs above.

## 6. Limits and open items

- **Drawer lens-shift:** the first version moved too slowly on very slow renderers. It
  now runs on its own clock. The final check of that change was cut short by the
  machine's memory limits.
- **Not tested:**
  - Safari / WebKit;
  - physical phones and tablets;
  - screen readers;
  - frame rate on real GPUs.
- **Headless screenshots are unreliable on this machine.** The disk is full and system
  memory is nearly exhausted (≈33.5 of 34.7 GB committed by other applications), so
  long runs were killed. Final screenshots are listed in `screenshots/review/`.
- **Raw data removed to free disk space:** `data_raw/` no longer holds the LROC WAC
  mosaic or the global colour sources. They are public downloads (see `preprocess/`);
  the built products are in `public/`. Only the LOLA DEM remains.
- **Point choice:** observation points come from one rule (sunlight plus slope). A
  real landing site also depends on hazards, thermal limits and operations, which are
  not modelled.
