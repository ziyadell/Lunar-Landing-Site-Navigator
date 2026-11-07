import { useCameraInfo } from '../three/GlobeCamera';

/**
 * Map scale and data-resolution readout for the Orbital View.
 * The "limit" note appears when the screen shows finer ground detail than the
 * best measured source at that location, so magnified pixels are never mistaken
 * for real detail.
 */
const NICE = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export function ScaleBar() {
  const { metersPerPixel, latDeg, mode } = useCameraInfo();
  if (!metersPerPixel) return null;
  const target = metersPerPixel * 90; // ~90 px bar
  const km = NICE.find((k) => k * 1000 >= target * 0.6) ?? 1000;
  const px = Math.max(16, Math.min(160, (km * 1000) / metersPerPixel));
  const polar = latDeg <= -80.6;
  const imgM = polar ? 100 : 670;
  const relM = polar ? 80 : 1900;
  const limit = metersPerPixel < imgM * 0.9;
  return (
    <div className="scalebar" aria-label={`Scale ${km} kilometres. Imagery ${imgM} metres per pixel, relief ${relM} metres.`}>
      <div className="scalebar__bar" style={{ width: px }}>
        <span className="num">{km < 1 ? `${km * 1000} m` : `${km} km`}</span>
      </div>
      <div className="scalebar__src">
        {mode === 'site' ? 'Site view' : 'Global view'} · Imagery {polar ? 'LROC WAC polar 100 m' : 'LROC WAC 670 m'}/px · Relief LOLA{' '}
        {polar ? '80 m' : '1.9 km'}
        {limit && <span className="scalebar__limit"> · beyond imagery resolution</span>}
      </div>
    </div>
  );
}
