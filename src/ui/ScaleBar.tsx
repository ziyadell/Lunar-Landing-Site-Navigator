import { useCameraInfo, useCursorLL } from '../three/GlobeCamera';
import { useApp } from '../state/store';
import { fmtLat, fmtLon } from '../utils/format';

/**
 * Map scale, data-resolution and cursor readout for the Orbital View.
 * The "limit" note appears when the screen shows finer ground detail than the
 * best measured source at that location, so magnified pixels are never mistaken
 * for real detail.
 */
const NICE = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export function ScaleBar() {
  const { metersPerPixel, latDeg } = useCameraInfo();
  const cursor = useCursorLL((s) => s.ll);
  if (!metersPerPixel) return null;
  const target = metersPerPixel * 90;
  const km = NICE.find((k) => k * 1000 >= target * 0.6) ?? 1000;
  const px = Math.max(16, Math.min(160, (km * 1000) / metersPerPixel));
  const polar = (cursor?.latDeg ?? latDeg) <= -80.6;
  const imgM = polar ? 100 : 670;
  const limit = metersPerPixel < imgM * 0.9;
  return (
    <div className="scalebar" aria-label={`Scale ${km} kilometres.`}>
      <div className="scalebar__bar" style={{ width: px }}>
        <span className="num">{km < 1 ? `${km * 1000} m` : `${km} km`}</span>
      </div>
      <div className="scalebar__src">
        {polar ? 'LROC WAC polar mosaic 100 m · LOLA 80 m' : 'LROC WAC 670 m · LOLA 1.9 km'}
        {limit && <span className="scalebar__limit"> · beyond imagery resolution</span>}
      </div>
      <div className="scalebar__cursor num" aria-live="off">
        {cursor ? `${fmtLat(cursor.latDeg, 2)}  ${fmtLon(cursor.lonDeg, 2)}` : ' '}
      </div>
    </div>
  );
}

/** Zoom / focus / reset stack: an accessible alternative to wheel and gestures. */
export function CameraStack() {
  const zoom = useApp((s) => s.zoomCamera);
  const focus = useApp((s) => s.focusRegion);
  const reset = useApp((s) => s.resetCamera);
  const transitioning = useApp((s) => s.transitioning);
  return (
    <div className="cam-stack" role="group" aria-label="Camera">
      <button type="button" className="cam-stack__btn" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(0.6)} disabled={transitioning}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <button type="button" className="cam-stack__btn" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1.65)} disabled={transitioning}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h10" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <span className="cam-stack__sep" aria-hidden="true" />
      <button type="button" className="cam-stack__btn" aria-label="Focus selected region" title="Focus selected region" onClick={focus} disabled={transitioning}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="2.2" fill="currentColor" /><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
      <button type="button" className="cam-stack__btn" aria-label="Whole Moon" title="Whole Moon" onClick={reset} disabled={transitioning}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M7 1.8a5.2 5.2 0 0 0 0 10.4" fill="currentColor" opacity=".5" /></svg>
      </button>
    </div>
  );
}
