# Regression checks

| Check | How to run | What it guards |
|---|---|---|
| Data validation | `npm run test:data` | Legacy or malformed `sites.json` / `ephemeris.json` cannot crash the app; a bad outline drops only its overlay. |
| Marker drift | Paste `marker-drift.js` into the browser console on the dev server (`npm run dev`), after selecting a region and zooming to it. | During a full 360° orbit every marker stays on its lunar point. It also checks that restoring the same camera transform puts every marker on the same pixel. |

**Marker drift tolerance.** The test reports two values:

- `worstSameFramePx`: must stay below 1 px. Measured 0.063–0.069 px.
- `worstReturnPx`: must be 0 px when the camera matrix is identical. Measured 0 px.

For comparison, with the camera-matrix refresh removed from `MarkerProjector`, the
same-frame error rose to 855.8 px.

The drift test uses development-only hooks (`window.__globe`, `__camera`, `__markerPts`,
`__invalidate`), which are not present in production builds.
