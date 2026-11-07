# Redesign — November 2026

Branch `redesign`, built on `experience-pass`. This is a change of **layout and
interaction model**, not of styling. The previous layout was a three-column
dashboard: a top bar across the window, a 300 px region panel, the viewport, a
330 px readings panel, and a 128 px time dock underneath. The 3D scene got
roughly 55 % of a 1440 × 900 window. Now the scene fills the whole window and
everything else floats over it or opens only when asked for.

Scientific calculations, data files and validation are unchanged. Every
measurement that was shown before is still available (§5).

## 1. Before and after

Full-resolution screenshots are in [`screenshots/redesign/`](screenshots/redesign/).
They come from headless Edge (SwiftShader), at the same URL, region and time
(Malapert Massif, 2027-01-13 14:00 UTC).

| View | Side by side |
|---|---|
| Orbital, 1440 × 900 | [`compare-orbital-1440.jpg`](screenshots/redesign/compare-orbital-1440.jpg) |
| Surface, 1440 × 900 | [`compare-surface-1440.jpg`](screenshots/redesign/compare-surface-1440.jpg) |
| Mission Analysis, 1440 × 900 | [`compare-analysis-1440.jpg`](screenshots/redesign/compare-analysis-1440.jpg) |
| Orbital, tablet 768 × 1024 | [`compare-orbital-768.jpg`](screenshots/redesign/compare-orbital-768.jpg) |
| Orbital, phone 375 × 812 | [`compare-orbital-375.jpg`](screenshots/redesign/compare-orbital-375.jpg) |

Secondary states: `after-orbital-atlas-1440.png` (all regions),
`after-orbital-measurements-1440.png`, `after-orbital-timesheet-1440.png`,
`after-analysis-glance-1440.png`, `after-analysis-timeline-1440.png` (hover
readout), plus `after-*-1024/375` images.

## 2. Layout decisions

| Decision | Before | After | Why |
|---|---|---|---|
| Scene size | Viewport framed between two side panels and a dock | Full window, edge to edge | The Moon and the terrain are the product. At 1440 × 900 the globe is now ≈ 800 px across instead of ≈ 680 px, and nothing covers its centre. |
| Composition | Fixed grid of columns and rows | Four quiet corners around an open centre: identity and navigation at the top, live conditions top right, the region bottom left, time at the bottom | The panels sit on a diagonal (top right, bottom left), so the eye goes to the Moon first and then to the two answers that matter. |
| Navigation | Three numbered tabs in an engineering top bar (`01 Orbital View`…) | One floating control with icon and word (Orbit · Surface · Analysis) and a highlight that slides between them | Reads as three ways of looking at the same place rather than three separate tools. "Surface" still plays the descent from orbit. |
| Region discovery | A text list of six names with coordinates and Sun/Earth dots | A region card that shows the place through its **own LROC image** (24 km square, 100 m/px), previous/next, and a strip of six image thumbnails with live Sun/Earth lights. "Compare all" opens an atlas of image cards side by side, with live elevations and the 2027 sunlit share. | Regions are recognised by their ground, not their names. The images are crops of the existing mosaic at native resolution (see §4). |
| Scientific readings | A full-height panel of cards, readouts and disclosures | A compact card with only the two answers: Sun and Earth elevation, visible or not, and the margin to the skyline in words. "All measurements" opens a drawer with azimuth, skyline, clearance, disc fraction, range, location and how the point was chosen. | The essential answer stays on screen; precision is one tap away and never removed. |
| Time | A permanent 128 px dock: date and time inputs, steppers, a 30-day strip and layer toggles | A pill: ±1 day, ±1 hour, play, and the date. Clicking the date opens a sheet with the 30-day visibility scrubber (drag or arrow keys) and exact UTC inputs. | Time is changed often but needs little space; the scrubber appears only while in use. |
| Display layers | Checkboxes in the dock | A layers button in the tool column, opening a popover (Surface View adds the presets there) | Rarely changed settings no longer take permanent space. |
| Data and method | Collapsible section at the bottom of the readings panel | "Data & method" in the masthead opens a drawer (Surface View also shows what is measured and what is a display aid) | Same content, one consistent place. |
| Drawers | — | One drawer at a time. The scene stays visible and usable beside it; Escape closes it. | Progressive disclosure without leaving the 3D view. |

### Surface View

- The terrain takes the lower half of the frame. On entry the camera now puts
  the Sun (or Earth) in the upper third, not near the centre.
- The heading tape sits at the top; Sun and Earth markers hang below it so they
  no longer collide with the bearing numbers.
- The 360° LOLA skyline becomes a ribbon above the time pill: it is both the
  compass and the horizon record. Clicking it turns you to that azimuth.
- Look controls (face Sun, face Earth, face north, field of view, layers) are a
  slim column on the right. The region card switches its action to "Back to orbit".

### Mission Analysis

The analysis is now a study page in one reading column instead of a stack of
dashboard panels:

1. **A question as the title**: "How much sunlight and Earth contact does each site get?"
2. **Two scenario cards side by side**: each has the region's image, a
   six-image region picker, a start date and period buttons (7 d, 30 d, 90 d,
   1 yr, plus a menu with every period offered before).
3. **At a glance**: four questions (Sun above the skyline, Earth above the
   skyline, both together, longest stretch without Sun). Each has paired bars
   for A and B, coloured by what they measure (gold Sun, cyan Earth, white
   both), and a one-line verdict ("A higher by 49.5 pp"). The existing
   plain-language observations sit beside them.
4. **Through time**: the existing interactive timelines (hover, keys, pin, open in 3D).
5. **From the ground**: the horizon panoramas, with CSV export.
6. **Every metric**: the full ten-row table (and the stacked phone version),
   behind one disclosure.
7. **Method and limits**: unchanged content, set as footnotes.

### Tablet and phone

- **760–1199 px:** the same composition. Time moves to the bottom right and the
  scale moves above it. Below 1024 px the day-step buttons and scale bar are
  dropped (hour steps and the scrubber remain).
- **Under 760 px:** a top band (masthead, conditions, tool row) and a bottom
  band (time pill, region card with image strip), with the Moon between them.
  Drawers become bottom sheets. Zoom is by pinch, so the zoom buttons are hidden.

## 3. Visual system

- **Palette:** unchanged. Floating surfaces use the deep navy at 78–92 %
  opacity with a light backdrop blur, a 1 px hairline and a soft shadow. Blur
  only ever applies behind controls; the Moon itself is never filtered.
- **Type:**
  - Space Grotesk for names and titles (region 21 px, study title up to 40 px).
  - IBM Plex Sans for interface text (13–16.5 px, with 1.6–1.75 line height for reading text).
  - IBM Plex Mono only for numbers.
  - No uppercase micro-labels.
- **Accent:** one per screen (the cyan primary action: Descend). Sun and Earth
  keep gold and cyan everywhere. Visible / not-visible always carries a word as
  well as a colour.
- **Motion:**
  - the mode highlight slides (360 ms);
  - drawers and sheets rise (220–280 ms);
  - values briefly highlight when they change.
  - All of it is disabled under `prefers-reduced-motion`.
- **RIFDAN as benchmark:** used for comfort only — generous spacing, large
  confident type, tone-separated surfaces and a single accent. No layout or
  branding was taken from it.

## 4. New data product: region images

`preprocess/build_thumbnails.py` writes `public/textures/polar/thumbs/{id}.jpg`:
the central 240 × 240 px of each region's existing LROC WAC South Pole Summer
Mosaic window. That is 24 × 24 km at 100 m/px, centred on the observation
point to within one pixel (offsets printed by the script).

- **Processing:** no resampling, sharpening or retouching; the crop is the only step.
- **Orientation:** up is polar-stereographic +y, toward 0° longitude.
- **Shadows:** black areas were in shadow when imaged in 2010. The atlas states this.
- **Size:** 6 files, 87 kB in total.

## 5. Functionality kept

All of the following were checked by script against the production build in headless Edge:

- **Regions:** select from the image strip, previous and next, the atlas, and globe labels (unchanged).
- **Deep links:** URL sync still works, for example `?site=haworth`.
- **Time:**
  - ±1 day and ±1 hour steps;
  - drag scrubbing on the 30-day strip (moved to 6 Jan 12:00);
  - the sheet closes on Escape;
  - play.
- **Display layers:** the popover lists the same layers. Surface presets work
  (Clean selected → `aria-checked`).
- **Modes:**
  - Descend runs the orbital dive into Surface View;
  - Back to orbit;
  - mode navigation.
- **Surface View:** face Sun (heading 254°), face Earth, face north, field of view.
- **Drawers:** Measurements shows 14 readouts; Data & method includes the Surface method.
- **Mission Analysis:**
  - changing B's region updates the bars;
  - the 7-day period updates the timelines;
  - pinning a moment and choosing "Open in Surface View" opened Surface View at 2027-01-04 12:00 UTC;
  - CSV export and the full metric table are still there.
- **Unchanged values:** Malapert, January 2027 still reads 59.4 % Sun and
  96.1 % Earth, matching the independent Python check in QUALITY-PASS.md.

Removed components: `TopBar`, `SitePanel`, `PanelRails`, `MobileSheet`,
`SciencePanel`, and the `TimeDock` container. Their content moved into
`ui/stage/*`. Unused CSS for them was pruned: about 1,050 lines from
`global.css` and `experience.css`.

## 6. Bug found and fixed while testing

Peak near Cabeus B in Surface View raised
`computeBoundingSphere(): radius is NaN`. Its 400 m terrain tile contains 18
no-data samples at the edge of the 80°S LOLA product, and they reached the mesh.

- **Fix:** the terrain sampler now treats NaN and the −20 km sentinel as "no
  measurement". Beyond coverage, the mesh continues from the last measured
  height as a smooth sphere (curvature drop only). No terrain is invented.
- **What it affects:** only geometry beyond 80°S coverage. The skyline used for
  every calculation is the precomputed LOLA profile and is not affected.

## 7. Testing and limits

- **Tested:** headless Edge (SwiftShader) at 1440 × 900, 1024 × 768, 768 × 1024
  and 375 × 812, all three modes. No console errors after the fix in §6.
- **Not tested:**
  - Safari / WebKit;
  - physical phones and tablets (touch was emulated);
  - screen readers;
  - GPU frame rate. `backdrop-filter` on many floating surfaces may cost
    frames on low-end GPUs; it should be profiled on real hardware.
- **Not done:** recentring the globe when a drawer opens. The drawer currently
  covers part of the Moon at 1440 px.
