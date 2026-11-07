import { useEffect, useRef, useState, type ReactNode } from 'react';
import { activePreset, SURFACE_PRESETS, useApp, useLook, type SurfacePreset } from '../../state/store';
import { useConditions } from '../../data/useConditions';
import { fmtDeg } from '../../utils/format';
import { EarthGlyph, SunGlyph } from '../primitives';
import { LayerToggles } from '../Layers';
import { DataSources } from '../DataSources';
import { SurfaceMethod } from '../SurfaceOverlay';
import { RegionAtlas } from './Regions';
import { DetailsDrawer } from './Conditions';
import { SettingsPanel } from './Settings';
import { Listen } from '../../audio/ui';

const DRAWER_ITEM = { atlas: 'view-atlas', details: 'view-measurements', about: 'view-sources', settings: null } as const;

/* ------------------------------------------------------------------ drawers */

const TITLES = { atlas: 'All candidate regions', details: 'Measurements', about: 'Data & method', settings: 'Settings' } as const;

/** One contextual drawer at a time; the scene stays visible and interactive beside it. */
export function Drawer() {
  const drawer = useApp((s) => s.drawer);
  const close = useApp((s) => s.openDrawer);
  const mode = useApp((s) => s.mode);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!drawer) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close(null);
    window.addEventListener('keydown', key);
    ref.current?.querySelector<HTMLElement>('.drawer__close')?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', key);
  }, [drawer, close]);
  if (!drawer) return null;
  return (
    <aside ref={ref} className={`drawer drawer--${drawer === 'atlas' ? 'left' : 'right'}`} aria-label={TITLES[drawer]} data-obstacle>
      <header className="drawer__head">
        <h2 className="drawer__title">
          {TITLES[drawer]} {DRAWER_ITEM[drawer] && <Listen id={DRAWER_ITEM[drawer]!} />}
        </h2>
        <button type="button" className="drawer__close" aria-label="Close" onClick={() => close(null)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </header>
      <div className="drawer__body">
        {drawer === 'atlas' && <RegionAtlas />}
        {drawer === 'details' && <DetailsDrawer />}
        {drawer === 'settings' && <SettingsPanel />}
        {drawer === 'about' && (
          <>
            {mode === 'surface' && <SurfaceMethod />}
            <DataSources open />
          </>
        )}
      </div>
    </aside>
  );
}

/* --------------------------------------------------------------- view menu */

function Popover({ label, icon, children, className = '' }: { label: string; icon: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const down = (e: PointerEvent) => host.current && !host.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', down);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', down);
    };
  }, [open]);
  return (
    <div className={`pop ${className}`} ref={host}>
      <button type="button" className={`icon-tool${open ? ' is-on' : ''}`} aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
      </button>
      {open && (
        <div className="pop__panel" role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

function Presets() {
  const layers = useApp((s) => s.layers);
  const apply = useApp((s) => s.applyPreset);
  const active = activePreset(layers);
  return (
    <div className="seg" role="radiogroup" aria-label="Display preset">
      {(Object.keys(SURFACE_PRESETS) as SurfacePreset[]).map((k) => (
        <button key={k} type="button" role="radio" aria-checked={active === k} className={`seg__btn${active === k ? ' is-active' : ''}`} title={SURFACE_PRESETS[k].hint} onClick={() => apply(k)}>
          {SURFACE_PRESETS[k].label}
        </button>
      ))}
    </div>
  );
}

const LayersIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2 1.8 5.2 8 8.4l6.2-3.2z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M1.8 8.2 8 11.4l6.2-3.2M1.8 11 8 14.2l6.2-3.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity=".6" />
  </svg>
);

export function ViewMenu() {
  const mode = useApp((s) => s.mode);
  const layers = useApp((s) => s.layers);
  const active = activePreset(layers);
  return (
    <Popover label="Display options" icon={LayersIcon} className="pop--view">
      <div className="pop__listen">
        <span className="pop__label">Display options</span>
        <Listen id="view-display" />
      </div>
      {mode === 'surface' && (
        <div className="pop__section">
          <div className="pop__label">Preset</div>
          <Presets />
          <p className="pop__hint">{active ? SURFACE_PRESETS[active].hint : 'Custom combination of layers.'}</p>
        </div>
      )}
      <div className="pop__section">
        <LayerToggles />
      </div>
    </Popover>
  );
}

/* ------------------------------------------------------------ surface look */

/** Look controls for Surface View: turn to a body, to north, or change field of view. */
export function LookTools() {
  const unavailable = useApp((s) => s.sceneUnavailable);
  const { conditions } = useConditions();
  const look = useLook();
  // Body in the upper third: the terrain fills the lower half of the frame.
  const aim = (az: number, el: number) => look.set({ yaw: az, pitch: el - look.fov * 0.26 });
  const regionId = useApp((s) => s.regionId);
  const has = !!conditions;
  // Default view (on entry, on region change, and "Reset view"): the Sun if it is up, otherwise Earth.
  const home = () => {
    if (!conditions) return look.set({ yaw: 0, pitch: 4, fov: 55 });
    const b = conditions.sun.state === 'visible' ? conditions.sun : conditions.earth;
    look.set({ yaw: b.azDeg, pitch: b.elDeg - 55 * 0.26, fov: 55 });
  };
  useEffect(() => {
    home();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId, has]);
  if (unavailable) return null;
  return (
    <div className="tool-col" role="toolbar" aria-label="Look" data-obstacle>
      <button type="button" className="icon-tool" aria-label="Reset view" title="Reset view" onClick={home}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <span className="tool-col__sep" aria-hidden="true" />
      <button type="button" className="icon-tool icon-tool--sun" aria-label="Face the Sun" title="Face the Sun" disabled={!conditions} onClick={() => conditions && aim(conditions.sun.azDeg, conditions.sun.elDeg)}>
        <SunGlyph size={16} />
      </button>
      <button type="button" className="icon-tool icon-tool--earth" aria-label="Face Earth" title="Face Earth" disabled={!conditions} onClick={() => conditions && aim(conditions.earth.azDeg, conditions.earth.elDeg)}>
        <EarthGlyph size={16} />
      </button>
      <button type="button" className="icon-tool" aria-label="Face north" title="Face north" onClick={() => look.set({ yaw: 0, pitch: 4 })}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 11.2 13 8 10.8 4.8 13z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
      </button>
      <span className="tool-col__sep" aria-hidden="true" />
      <button type="button" className="icon-tool" aria-label="Narrow field of view" title="Zoom in" onClick={() => look.set({ fov: look.fov / 1.4 })}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <span className="tool-col__read num" aria-label={`Field of view ${look.fov.toFixed(0)} degrees`}>{look.fov.toFixed(0)}°</span>
      <button type="button" className="icon-tool" aria-label="Widen field of view" title="Zoom out" onClick={() => look.set({ fov: look.fov * 1.4 })}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h10" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <span className="tool-col__sep" aria-hidden="true" />
      <ViewMenu />
    </div>
  );
}

export function HeadingReadout() {
  const { yaw, pitch } = useLook();
  return (
    <div className="heading num" aria-live="off">
      Heading {yaw.toFixed(0).padStart(3, '0')}° · looking {fmtDeg(pitch, 0)}
    </div>
  );
}
