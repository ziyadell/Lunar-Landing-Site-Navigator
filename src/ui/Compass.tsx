import { useLook } from '../state/store';
import { useConditions } from '../data/useConditions';
import { wrap360 } from '../science/geometry';

const CARDINAL: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

/**
 * Heading tape for Surface View. Spans the current horizontal field of view.
 * Sun / Earth azimuths are marked when they fall inside the tape.
 */
export function Compass() {
  const { yaw, fov } = useLook();
  const { conditions } = useConditions();
  const aspect = typeof window !== 'undefined' ? Math.max(1, window.innerWidth / Math.max(1, window.innerHeight)) : 1.6;
  const hfov = Math.min(170, (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect) * 180) / Math.PI);
  const half = hfov / 2;
  const rel = (az: number) => ((wrap360(az - yaw) + 180) % 360) - 180;
  const pos = (az: number) => 50 + (rel(az) / hfov) * 100;
  const step = hfov > 90 ? 15 : hfov > 40 ? 5 : 1;
  const ticks: number[] = [];
  for (let a = Math.ceil((yaw - half) / step) * step; a <= yaw + half; a += step) ticks.push(wrap360(a));

  const inView = (az: number) => Math.abs(rel(az)) <= half;
  const marker = (az: number, cls: string, label: string) =>
    inView(az) ? (
      <span className={`compass__body ${cls}`} style={{ left: `${pos(az)}%` }} aria-hidden="true">
        {label}
      </span>
    ) : null;
  // Off-screen bodies are listed beside the tape (outside its fade mask) so they never clip.
  const off = (az: number, cls: string, label: string) =>
    inView(az) ? null : (
      <span className={`compass__off ${cls}`} aria-hidden="true">
        {rel(az) < 0 ? '◂ ' : ''}
        {label} {Math.round(wrap360(az))}°{rel(az) >= 0 ? ' ▸' : ''}
      </span>
    );

  return (
    <div className="compass" role="img" aria-label={`Heading ${Math.round(yaw)} degrees from local north`}>
      <div className="compass__tape">
        {ticks.map((a) => {
          const major = a % (step * 3) === 0 || CARDINAL[a] !== undefined;
          return (
            <span key={a} className={`compass__tick${major ? ' is-major' : ''}`} style={{ left: `${pos(a)}%` }}>
              {major && <span className="compass__lbl">{CARDINAL[a] ?? a}</span>}
            </span>
          );
        })}
        {conditions && marker(conditions.sun.azDeg, 'is-sun', 'SUN')}
        {conditions && marker(conditions.earth.azDeg, 'is-earth', 'EARTH')}
        <span className="compass__caret" aria-hidden="true" />
      </div>
      {conditions && (
        <div className="compass__offs">
          <div className="compass__offs-l">
            {rel(conditions.sun.azDeg) < 0 && off(conditions.sun.azDeg, 'is-sun', 'SUN')}
            {rel(conditions.earth.azDeg) < 0 && off(conditions.earth.azDeg, 'is-earth', 'EARTH')}
          </div>
          <div className="compass__offs-r">
            {rel(conditions.sun.azDeg) >= 0 && off(conditions.sun.azDeg, 'is-sun', 'SUN')}
            {rel(conditions.earth.azDeg) >= 0 && off(conditions.earth.azDeg, 'is-earth', 'EARTH')}
          </div>
        </div>
      )}
    </div>
  );
}
