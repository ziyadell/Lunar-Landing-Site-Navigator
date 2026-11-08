import { useMemo } from 'react';
import { useConditions } from '../data/useConditions';
import { useApp, useLook } from '../state/store';
import { fmtDeg } from '../utils/format';
import { wrap360 } from '../science/geometry';
import { FoldButton } from './Fold';
import { useSettings } from '../state/settings';
import { Listen } from '../audio/ui';

/** Sun / Earth labels in the 3D sky (positioned by SkyLabelProjector). */
export function SkyLabels() {
  const { conditions } = useConditions();
  if (!conditions) return null;
  const tag = (body: 'sun' | 'earth') => {
    const b = conditions[body];
    return (
      <div id={`sky-label-${body}`} className={`sky-label sky-label--${body}`} style={{ visibility: 'hidden' }}>
        <span className="sky-label__name">{body === 'sun' ? 'Sun' : 'Earth'}</span>
        <span className="sky-label__val num">{fmtDeg(b.elDeg, 1)}</span>
        {b.state !== 'visible' && <span className="sky-label__state">{b.state === 'below-horizontal' ? 'below horizon' : 'behind terrain'}</span>}
      </div>
    );
  };
  return (
    <div className="sky-labels" aria-hidden="true">
      {tag('sun')}
      {tag('earth')}
    </div>
  );
}

/**
 * 360° skyline strip: the LOLA horizon profile, Sun and Earth positions, and the
 * current field of view. Click to turn toward an azimuth.
 */
export function SurfacePanorama() {
  const { region, conditions } = useConditions();
  const { yaw, fov, set } = useLook();
  const skyFolded = useSettings((st) => st.skylineFolded);
  const W = 720;
  const H = 70;
  const prof = region.horizon.elevationDeg;
  const step = region.horizon.azStepDeg;
  const lo = Math.floor(Math.min(...prof, conditions ? Math.min(conditions.sun.elDeg, conditions.earth.elDeg) : 0) - 1);
  const hi = Math.ceil(Math.max(...prof, conditions ? Math.max(conditions.sun.elDeg, conditions.earth.elDeg) : 0) + 1.5);
  const x = (az: number) => (wrap360(az) / 360) * W;
  const y = (el: number) => 4 + (1 - (el - lo) / (hi - lo)) * (H - 8);
  const path = useMemo(() => {
    let d = `M0,${H}`;
    prof.forEach((e, i) => (d += `L${((i * step) / 360) * W},${y(e).toFixed(1)}`));
    return d + `L${W},${y(prof[0]).toFixed(1)}L${W},${H}Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prof, step, lo, hi]);
  const aspect = typeof window !== 'undefined' ? Math.max(0.5, window.innerWidth / Math.max(1, window.innerHeight)) : 1.6;
  const hfov = Math.min(170, (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect) * 180) / Math.PI);
  const x0 = x(yaw - hfov / 2);
  const x1 = x(yaw + hfov / 2);
  return (
    <div className={`pano-strip${skyFolded ? ' is-folded' : ''}`}>
      <div className="pano-strip__head">
        <span>Skyline 360° · LOLA</span>
        <span className="pano-strip__right">
          <Listen id="view-skyline" />
          {!skyFolded && (
            <span className="num">
              {lo}° … {hi}°
            </span>
          )}
          <FoldButton k="skylineFolded" what="skyline strip" />
        </span>
      </div>
      {!skyFolded && (
      <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="360 degree terrain skyline with Sun and Earth positions. Click to face an azimuth."
        onClick={(e) => {
          const b = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          set({ yaw: ((e.clientX - b.left) / b.width) * 360 });
        }}
      >
        {y(0) > 0 && y(0) < H && <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="pano-strip__zero" />}
        {x0 < x1 ? (
          <rect x={x0} y="0" width={x1 - x0} height={H} className="pano-strip__fov" />
        ) : (
          <>
            <rect x="0" y="0" width={x1} height={H} className="pano-strip__fov" />
            <rect x={x0} y="0" width={W - x0} height={H} className="pano-strip__fov" />
          </>
        )}
        <path d={path} className="pano-strip__terrain" vectorEffect="non-scaling-stroke" />
        {conditions && (
          <>
            <circle cx={x(conditions.sun.azDeg)} cy={y(conditions.sun.elDeg)} r="4" className={`pano-strip__sun${conditions.sun.state === 'visible' ? '' : ' is-hidden'}`} />
            <circle cx={x(conditions.earth.azDeg)} cy={y(conditions.earth.elDeg)} r="4" className={`pano-strip__earth${conditions.earth.state === 'visible' ? '' : ' is-hidden'}`} />
          </>
        )}
      </svg>
      <div className="pano-strip__axis num" aria-hidden="true">
        <span>N</span>
        <span>E</span>
        <span>S</span>
        <span>W</span>
        <span>N</span>
      </div>
      </>
      )}
    </div>
  );
}

/** What the Surface View shows: measured inputs vs display aids. */
export function SurfaceMethod() {
  const layers = useApp((s) => s.layers);
  const { conditions } = useConditions();
  return (
    <section className="method">
      <h3 className="mtable__head">This surface view</h3>
      <p>
        <strong>Measured:</strong> one continuous LOLA terrain mesh to 150 km (80 m within 11 km, 400 m to 55 km, 1 km beyond),
        the same range as the ray-traced skyline; surface albedo from the LROC WAC South Pole Summer Mosaic (100 m; its 2010
        shadows are replaced by the regional mean); Sun and Earth from JPL Horizons; stars from the Yale Bright Star Catalogue
        placed with the IAU Moon rotation model. Terrain casts its own shadows; direct sunlight is scaled to the visible solar disc
        {conditions ? ` (${(conditions.sun.discFraction * 100).toFixed(0)}% now)` : ''}.
      </p>
      <p>
        <strong>Display aids:</strong>{' '}
        {layers.enhancedLight
          ? 'lifted shadows add a soft light from the Sun’s true direction (raised to at least 7°), a sky fill and brighter Earthshine so relief stays readable; real shadowed terrain is much darker. '
          : 'physical lighting shows only sunlight and faint Earthshine. '}
        {layers.regolith ? 'Fine surface texture below LOLA resolution is illustrative, not measured. ' : ''}
        Sun and Earth are drawn at their true size and direction with a soft glow for visibility; Earth shows its correct phase but no surface detail. Range rings: 100 m, 250 m, 500 m, 1 km. Nearby ground looks
        smooth because 80 m is the finest measured relief used.
      </p>
    </section>
  );
}
