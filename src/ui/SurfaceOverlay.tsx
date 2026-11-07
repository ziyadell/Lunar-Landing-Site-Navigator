import { useMemo, useState } from 'react';
import { useConditions } from '../data/useConditions';
import { useApp, useLook } from '../state/store';
import { compass, fmtDeg } from '../utils/format';
import { wrap360 } from '../science/geometry';

/** Sun / Earth labels in the 3D sky (positioned by SkyLabelProjector). */
export function SkyLabels() {
  const { conditions } = useConditions();
  if (!conditions) return null;
  const tag = (body: 'sun' | 'earth') => {
    const b = conditions[body];
    return (
      <div id={`sky-label-${body}`} className={`sky-label sky-label--${body}`} style={{ visibility: 'hidden' }}>
        <span className="sky-label__name">{body === 'sun' ? 'Sun' : 'Earth'}</span>
        <span className="num">
          EL {fmtDeg(b.elDeg)} · AZ {b.azDeg.toFixed(1)}°
        </span>
        {b.state !== 'visible' && <span className="sky-label__state">behind terrain</span>}
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
    <div className="pano-strip">
      <div className="pano-strip__head">
        <span>Skyline 360° · LOLA</span>
        <span className="num">
          {lo}° … {hi}°
        </span>
      </div>
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
    </div>
  );
}

/** Collapsible method note for the Surface View. */
export function SurfaceInfo({ error }: { error: string | null }) {
  const [open, setOpen] = useState(false);
  const layers = useApp((s) => s.layers);
  const { conditions, region } = useConditions();
  const yaw = useLook((s) => s.yaw);
  if (error) return <div className="vp-note is-warn">Terrain tile failed to load: {error}</div>;
  return (
    <div className={`vp-info${open ? ' is-open' : ''}`}>
      <button type="button" className="vp-info__btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <path d="M6 5.2v3.4M6 3.4v.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        {region.name} · facing {compass(yaw)} · {layers.enhancedLight ? 'Enhanced visibility' : 'Physical lighting'}
      </button>
      {open && (
        <div className="vp-info__body">
          <p>
            <strong>Measured:</strong> terrain from LOLA (24 km at 80 m, 120 km at 400 m), skyline ray-traced to 150 km,
            Sun and Earth from JPL Horizons, stars from the Yale Bright Star Catalogue placed with the IAU Moon rotation
            model. Shadows are cast by the terrain in the scene; direct sunlight is scaled to the visible solar disc
            {conditions ? ` (${(conditions.sun.discFraction * 100).toFixed(0)}% now)` : ''}.
          </p>
          <p>
            <strong>Display aids:</strong>{' '}
            {layers.enhancedLight
              ? 'enhanced visibility adds a sky fill light and brighter Earthshine so terrain in shadow stays readable — real shadowed terrain is much darker. '
              : 'physical lighting shows only sunlight and faint Earthshine. '}
            {layers.regolith ? 'Fine surface texture below LOLA resolution is illustrative, not measured. ' : ''}
            Earth is drawn with its correct phase but no surface detail. Range rings: 1, 2, 5, 10 km.
          </p>
        </div>
      )}
    </div>
  );
}
