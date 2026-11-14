import { t } from '../i18n';
import { LangToggle } from '../ui/stage/Masthead';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMedia } from '../utils/useMedia';
import { create } from 'zustand';
import { useSettings } from '../state/settings';
import { useApp } from '../state/store';
import { narrationItem, narrationItems, pause, play, playCue, replay, resume, retryVoice, setMuted, setRate, stop, unlockAudio, usePlayer, type NarrationItem } from './engine';
import { useReadiness } from '../state/loading';
import { exitTour, nextStep, prevStep, REGIONS_TOUR_LENGTH, replayStep, startTour, toggleTourPause, TOUR_LENGTH, useTour } from './tour';

const Headphones = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <rect x="2" y="9.5" width="3" height="4.5" rx="1.2" fill="currentColor" />
    <rect x="11" y="9.5" width="3" height="4.5" rx="1.2" fill="currentColor" />
  </svg>
);
const I = {
  play: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2v8l6.5-4z" fill="currentColor" /></svg>,
  pause: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2" width="2.5" height="8" rx=".5" fill="currentColor" /><rect x="7" y="2" width="2.5" height="8" rx=".5" fill="currentColor" /></svg>,
  stop: <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="currentColor" /></svg>,
  replay: <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  muted: <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.5L8.5 3v10L5 10H2.5zM11 6l4 4M15 6l-4 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>,
  sound: <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.5L8.5 3v10L5 10H2.5zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>,
  expand: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>,
  collapse: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>,
  close: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" /></svg>,
  chev: <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>,
};

/**
 * Small "listen" button beside a piece of information. Shown by default; it can be hidden
 * in Settings. Nothing plays until it is pressed.
 */
export function Listen({ id, item, className = '' }: { id?: string; item?: NarrationItem; className?: string }) {
  const on = useSettings((s) => s.audioGuide);
  const current = usePlayer((s) => s.item?.id);
  const playing = usePlayer((s) => s.playing);
  const it = item ?? (id ? narrationItem(id) : undefined);
  if (!on || !it) return null;
  const active = current === it.id && playing;
  return (
    <button
      type="button"
      className={`listen${active ? ' is-active' : ''} ${className}`}
      aria-label={active ? `Pause narration: ${it.title}` : `Listen: ${it.title}`}
      title={active ? 'Pause' : `Listen: ${it.title}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault(); // inside <summary>: listen without toggling the section
        if (useTour.getState().step >= 0) exitTour();
        if (active) pause();
        else void play(it);
      }}
    >
      <Headphones size={13} />
    </button>
  );
}

const RATES = [1, 1.25, 1.5] as const;

/** Player view: full card, or hidden to a slim bar while the narration keeps playing. */
export const useGuideView = create<{
  minimized: boolean;
  set: (m: boolean) => void;
  /** Where the visitor moved the player, as an offset from its home corner (this visit). */
  offset: { x: number; y: number };
  setOffset: (o: { x: number; y: number }) => void;
}>((set) => ({ minimized: false, set: (minimized) => set({ minimized }), offset: { x: 0, y: 0 }, setOffset: (offset) => set({ offset }) }));

/* ------------------------------------------------ region narration, once per visit
   Choosing a region plays its narration (with captions) the first time in a visit. After
   that, or once it has been heard any other way (listen button, regions tour), it plays only
   from the headphone button. Rapid browsing does not count: a region must stay selected for
   a moment before its narration starts. */
const HEARD_KEY = 'lsn.heardRegions';
const heardRegions = new Set<string>(
  (() => {
    try {
      return JSON.parse(sessionStorage.getItem(HEARD_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  })(),
);
function markHeard(id: string) {
  if (heardRegions.has(id)) return;
  heardRegions.add(id);
  try {
    sessionStorage.setItem(HEARD_KEY, JSON.stringify([...heardRegions]));
  } catch {
    /* storage unavailable: remembered until the page is reloaded */
  }
}
usePlayer.subscribe((p, prev) => {
  if (p.item && p.item !== prev.item && p.item.id.startsWith('region-')) markHeard(p.item.id);
});
const SETTLE_MS = 700;
function useRegionAutoNarration() {
  useEffect(() => {
    let timer = 0;
    const unsub = useApp.subscribe((s, prev) => {
      if (s.regionId === prev.regionId) return;
      window.clearTimeout(timer);
      const id = `region-${s.regionId}`;
      timer = window.setTimeout(() => {
        const a = useApp.getState();
        const st = useSettings.getState();
        if (a.regionId !== s.regionId || a.mode === 'analysis' || a.intro) return;
        if (!st.welcomeSeen || !st.audioGuide || useTour.getState().step >= 0) return;
        if (heardRegions.has(id)) return;
        const it = narrationItem(id);
        if (it) void play(it);
      }, SETTLE_MS);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);
}

const EDGE = 8; // keep the player this far inside the window
type GripProps = { onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void; onDoubleClick: () => void };

/**
 * Lets the visitor move the floating player: drag its header or grip (mouse, pen or
 * touch), or focus the grip and use the arrow keys (Shift for larger steps); Home or a
 * double-click on the grip returns it to its corner. It never leaves the window, and is
 * kept inside after resizes or when the player changes size.
 */
function usePlayerDrag(host: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const offset = useGuideView((s) => s.offset);
  const setOffset = useGuideView((s) => s.setOffset);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ px: number; py: number; ox: number; oy: number; id: number } | null>(null);

  /** Limit an offset so the whole player stays on screen. */
  const clamp = useCallback(
    (x: number, y: number) => {
      const el = host.current;
      if (!el) return { x, y };
      const cur = useGuideView.getState().offset;
      const b = el.getBoundingClientRect();
      // Position of the player with no offset applied.
      const left = b.left - cur.x;
      const top = b.top - cur.y;
      const minX = EDGE - left;
      const maxX = window.innerWidth - EDGE - (left + b.width);
      const minY = EDGE - top;
      const maxY = window.innerHeight - EDGE - (top + b.height);
      return {
        x: Math.round(Math.min(Math.max(x, minX), Math.max(minX, maxX))),
        y: Math.round(Math.min(Math.max(y, minY), Math.max(minY, maxY))),
      };
    },
    [host],
  );

  // Stay inside the window when it is resized or the player grows (captions, tour buttons).
  useEffect(() => {
    if (!enabled) return;
    const el = host.current;
    const fit = () => {
      const o = useGuideView.getState().offset;
      if (!o.x && !o.y) return;
      const c = clamp(o.x, o.y);
      if (c.x !== o.x || c.y !== o.y) setOffset(c);
    };
    const ro = typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(fit) : null;
    if (ro && el) ro.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [enabled, host, clamp, setOffset]);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!enabled || e.button !== 0) return;
    const t = e.target as Element;
    // Buttons in the header keep working; only the grip and the empty header start a drag.
    if (t.closest('button') && !t.closest('.aplayer__grip')) return;
    const o = useGuideView.getState().offset;
    start.current = { px: e.clientX, py: e.clientY, ox: o.x, oy: o.y, id: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture unavailable: the drag still follows moves over the header */
    }
    setDragging(true);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const s0 = start.current;
    if (!s0 || s0.id !== e.pointerId) return;
    setOffset(clamp(s0.ox + e.clientX - s0.px, s0.oy + e.clientY - s0.py));
  };
  const end = (e: React.PointerEvent<HTMLElement>) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    start.current = null;
    setDragging(false);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const k = e.shiftKey ? 48 : 16;
    const o = useGuideView.getState().offset;
    if (e.key === 'ArrowLeft') setOffset(clamp(o.x - k, o.y));
    else if (e.key === 'ArrowRight') setOffset(clamp(o.x + k, o.y));
    else if (e.key === 'ArrowUp') setOffset(clamp(o.x, o.y - k));
    else if (e.key === 'ArrowDown') setOffset(clamp(o.x, o.y + k));
    else if (e.key === 'Home') setOffset({ x: 0, y: 0 });
    else return;
    e.preventDefault();
  };
  const grip: GripProps | null = enabled ? { onKeyDown, onDoubleClick: () => setOffset({ x: 0, y: 0 }) } : null;
  const moved = !!(offset.x || offset.y);
  return {
    style: enabled && moved ? { translate: `${offset.x}px ${offset.y}px` } : undefined,
    dragging,
    moved,
    handle: enabled ? { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end } : {},
    grip,
  };
}

/** The grip at the top of the movable player. */
function Grip({ grip, moved }: { grip: GripProps | null; moved: boolean }) {
  if (!grip) return null;
  return (
    <button
      type="button"
      className="aplayer__grip"
      aria-label={`Move the player. Arrow keys move it${moved ? '; Home returns it to its corner' : ''}.`}
      title={moved ? 'Drag to move · double-click to return' : 'Drag to move'}
      {...grip}
    >
      <span aria-hidden="true" />
    </button>
  );
}
const VIEW_ITEM = { orbital: 'orbit-intro', surface: 'surface-intro', analysis: 'analysis-intro' } as const;
const SOURCE_LABEL = { recorded: 'Recorded narrator', server: 'Narrator voice', captions: 'Captions' } as const;

function topicGroups() {
  const all = narrationItems();
  return [
    { name: 'Views', items: ['orbit-intro', 'surface-intro', 'view-regions', 'view-locator', 'view-camera', 'view-look', 'view-compass', 'view-skyline', 'view-time', 'view-display', 'view-measurements', 'view-atlas', 'view-sources', 'view-settings'].map((id) => narrationItem(id)!).filter(Boolean) },
    { name: 'Mission Analysis', items: all.filter((i) => i.id.startsWith('analysis-')) },
    { name: 'Regions', items: all.filter((i) => i.id.startsWith('region-')) },
    { name: 'Terms', items: all.filter((i) => i.id.startsWith('term-')) },
  ];
}

/** Guide menu: explain this view, full tour, browse topics. Escape and outside clicks close it. */
function GuideMenu({ onClose, anchor }: { onClose: (restore: boolean) => void; anchor: React.RefObject<HTMLButtonElement | null> }) {
  const mode = useApp((s) => s.mode);
  const [browse, setBrowse] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('.guide__item')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose(true);
      }
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) onClose(false);
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', down, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', down, true);
    };
  }, [onClose, anchor]);
  const pick = (it: NarrationItem) => {
    if (useTour.getState().step >= 0) exitTour();
    void play(it);
    onClose(true);
  };
  return (
    <>
    <div className="sheet-backdrop sheet-backdrop--guide" aria-hidden="true" />
    <div className="guide__menu sheet" ref={ref} role="dialog" aria-label={t('Mission guide')}>
      <div className="sheet__head">
        <span className="sheet__title">{t('Mission guide')}</span>
        <button type="button" className="sheet__close" aria-label="Close the guide menu" onClick={() => onClose(true)}>
          {I.close}
        </button>
      </div>
      <button type="button" className="guide__item" onClick={() => pick(narrationItem(VIEW_ITEM[mode])!)}>
        <span className="guide__item-t">Explain this view</span>
        <span className="guide__item-s">{narrationItem(VIEW_ITEM[mode])!.title}</span>
      </button>
      <button
        type="button"
        className="guide__item"
        onClick={() => {
          onClose(true);
          startTour();
        }}
      >
        <span className="guide__item-t">Full tour</span>
        <span className="guide__item-s">{TOUR_LENGTH} steps, about five minutes</span>
      </button>
      <button
        type="button"
        className="guide__item"
        onClick={() => {
          onClose(true);
          startTour('regions');
        }}
      >
        <span className="guide__item-t">Regions tour</span>
        <span className="guide__item-s">All {REGIONS_TOUR_LENGTH - 1} landing regions, about four minutes</span>
      </button>
      <button type="button" className="guide__item guide__item--browse" aria-expanded={browse} onClick={() => setBrowse((b) => !b)}>
        <span className="guide__item-t">Browse topics</span>
        <span className={`guide__chev${browse ? ' is-open' : ''}`}>{I.chev}</span>
      </button>
      {browse && (
        <div className="guide__topics">
          {topicGroups().map((g) => (
            <div key={g.name} className="guide__group" role="group" aria-label={g.name}>
              <div className="guide__group-h">{g.name}</div>
              {g.items.map((it) => (
                <button key={it.id} type="button" className="guide__topic" onClick={() => pick(it)}>
                  {it.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}

/**
 * Mission guide: a persistent launcher (explain this view, full tour, topics) and a compact
 * player — one narration at a time, with captions and an honest source label.
 */
export function MissionGuide({ placement = 'float' }: { placement?: 'float' | 'flow' }) {
  const { item: playerItem, playing, loading, progress, muted, source, note, canRetry } = usePlayer();
  // The welcome line has its own caption over the scene; the player is for everything else.
  const item = playerItem?.id === 'welcome' ? null : playerItem;
  const rate = useSettings((s) => s.rate);
  const transcript = useSettings((s) => s.transcript);
  const welcomeSeen = useSettings((s) => s.welcomeSeen);
  const setS = useSettings((s) => s.set);
  const intro = useApp((s) => s.intro);
  const mode = useApp((s) => s.mode);
  const tour = useTour();
  const minimized = useGuideView((s) => s.minimized);
  const setMin = useGuideView((s) => s.set);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLElement>(null);
  const wide = useMedia('(min-width: 760px)');
  useRegionAutoNarration();
  const close = useRef((restore: boolean) => {
    setOpen(false);
    if (restore) btn.current?.focus();
  }).current;

  // A region narration or a calculated reading no longer matches the screen once the region
  // or the time changes: stop it (the tour manages its own narration).
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        if (s.regionId === prev.regionId && s.timeMs === prev.timeMs) return;
        const it = usePlayer.getState().item;
        if (!it || useTour.getState().step >= 0) return;
        if (it.calculated || (s.regionId !== prev.regionId && it.id.startsWith('region-') && it.id !== `region-${s.regionId}`)) stop();
      }),
    [],
  );

  const inTour = tour.step >= 0;
  const active = !!(item || inTour);
  // Movable wherever the player floats over the page (not on phones, where it sits in the HUD column).
  const drag = usePlayerDrag(host, wide && active && (placement === 'float' || inTour));
  if (intro || (mode === 'orbital' && !welcomeSeen)) return null;
  const exit = () => {
    setMin(false); // the next narration opens in full
    if (inTour) exitTour();
    else stop();
  };
  const title = inTour ? narrationItem(tour.ids[tour.step])?.title : item?.title;
  const status = loading || tour.waiting ? (tour.waiting ? 'Preparing the view…' : 'Loading…') : item?.calculated ? `Calculated now · ${SOURCE_LABEL[source]}` : SOURCE_LABEL[source];
  const playPause = () => (inTour ? toggleTourPause() : playing ? pause() : resume());
  const isPlaying = inTour ? !tour.paused && (playing || tour.waiting) : playing;

  return (
    <section
      ref={host}
      className={`guide guide--${placement}${inTour ? ' is-tour' : ''}${active ? ' is-active' : ''}${active && minimized ? ' is-min' : ''}${drag.grip ? ' is-movable' : ''}${drag.dragging ? ' is-dragging' : ''}`}
      style={drag.style}
      aria-label={t('Mission guide')}
      data-obstacle
    >
      {active && minimized && (
        <div className="aplayer-mini" role="group" aria-label="Narration (hidden player)" {...drag.handle}>
          <Grip grip={drag.grip} moved={drag.moved} />
          <button type="button" className="aplayer__btn aplayer__btn--main" aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'} onClick={playPause}>
            {isPlaying ? I.pause : I.play}
          </button>
          <button type="button" className="aplayer-mini__title" onClick={() => setMin(false)} aria-label={`Show player: ${title ?? 'narration'}`}>
            <span className="aplayer-mini__name">
              {inTour && <span className="num">{tour.step + 1}/{tour.length} · </span>}
              {title}
            </span>
            <span className="aplayer-mini__bar" aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
          </button>
          <button type="button" className="aplayer__btn" aria-label="Show player" title="Show player" onClick={() => setMin(false)}>
            {I.expand}
          </button>
          <button type="button" className="aplayer__btn" aria-label={inTour ? 'Exit the tour' : 'Stop and close the narration'} title={inTour ? 'Exit tour' : 'Stop and close'} onClick={exit}>
            {I.close}
          </button>
        </div>
      )}
      {active && !minimized && (
        <div className="aplayer">
          <Grip grip={drag.grip} moved={drag.moved} />
          <div className="aplayer__head" {...drag.handle}>
            <span className="aplayer__icon" aria-hidden="true">
              <Headphones />
            </span>
            <div className="aplayer__titles">
              <span className="aplayer__title">
                {inTour && <span className="aplayer__step num">{tour.step + 1}/{tour.length} · </span>}
                {inTour ? narrationItem(tour.ids[tour.step])?.title : item?.title}
              </span>
              <span className="aplayer__src" aria-live="polite">
                {status}
                {note && !loading ? <span className="aplayer__note"> · {note}</span> : null}
                {canRetry && !loading ? (
                  <button type="button" className="aplayer__retry" onClick={retryVoice}>
                    Retry voice
                  </button>
                ) : null}
              </span>
            </div>
            <div className="aplayer__win">
              <button type="button" className="aplayer__btn" aria-label="Hide player (keep playing)" title="Hide player · keeps playing" onClick={() => setMin(true)}>
                {I.collapse}
              </button>
              <button type="button" className="aplayer__btn" aria-label={inTour ? 'Exit the tour' : 'Stop and close the narration'} title={inTour ? 'Exit tour' : 'Stop and close'} onClick={exit}>
                {I.close}
              </button>
            </div>
          </div>
          <div className="aplayer__bar" role="progressbar" aria-label="Narration progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="aplayer__ctrl">
            <button type="button" className="aplayer__btn aplayer__btn--main" aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'} onClick={playPause}>
              {isPlaying ? I.pause : I.play}
            </button>
            <button type="button" className="aplayer__btn" aria-label="Replay" title="Replay" onClick={() => (inTour ? replayStep() : replay())}>
              {I.replay}
            </button>
            <button type="button" className="aplayer__btn aplayer__btn--rate num" aria-label={`Playback speed ${rate} times. Change speed.`} title={t('Playback speed')} onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}>
              {rate}×
            </button>
            <button type="button" className={`aplayer__btn${muted ? ' is-on' : ''}`} aria-pressed={muted} aria-label="Mute" title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}>
              {muted ? I.muted : I.sound}
            </button>
            <button type="button" className={`aplayer__btn aplayer__btn--cc${transcript ? ' is-on' : ''}`} aria-pressed={transcript} aria-label="Captions" title="Captions" onClick={() => setS({ transcript: !transcript })}>
              CC
            </button>
            {inTour && (
              <span className="aplayer__tour">
                <button type="button" className="aplayer__next" onClick={prevStep} disabled={tour.step === 0} aria-label="Previous step">
                  Back
                </button>
                <button type="button" className="aplayer__next aplayer__next--primary" onClick={nextStep}>
                  {tour.step + 1 < tour.length ? 'Next' : 'Finish'}
                </button>
              </span>
            )}
          </div>
          {transcript && item && <p className="aplayer__text">{item.text}</p>}
        </div>
      )}
      <div className={`guide__launch${active && minimized ? ' is-hidden' : ''}`}>
        <button ref={btn} type="button" className={`guide__btn${open ? ' is-on' : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
          <Headphones size={14} />
          Mission guide
        </button>
        {open && <GuideMenu onClose={close} anchor={btn} />}
      </div>
    </section>
  );
}



/**
 * Enter mission: an optional, user-started opening. Nothing plays before a click; the Moon
 * renders underneath from the start. A short, quiet chime fades out fully, then the welcome
 * narration plays with captions. Skip, any interaction, or a hard time limit ends it.
 */

/**
 * Start Mission. One tap (repeat taps ignored): immediate feedback, audio unlocked inside the
 * gesture, the entry cue; then, once the Moon is genuinely ready (full-resolution maps
 * loaded, or failed with the usable fallback in place; at most 12 s), the interface fades in
 * once with the whole Moon in view (no automatic zoom). The welcome line
 * follows the cue (recording, or captions when no recording exists).
 */
export function Welcome() {
  const seen = useSettings((s) => s.welcomeSeen);
  const setS = useSettings((s) => s.set);
  const mode = useApp((s) => s.mode);
  const intro = useApp((s) => s.intro);
  const muted = usePlayer((s) => s.muted);
  const globe = useReadiness((s) => s.globe);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'preparing'>('idle');
  const startedRef = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    if (!intro) {
      startedRef.current = false;
      setPhase('idle');
    }
  }, [intro]);

  if (mode !== 'orbital' || (seen && !intro)) return null;

  const start = () => {
    if (startedRef.current) return; // no duplicate starts
    startedRef.current = true;
    unlockAudio();
    if (useTour.getState().step >= 0) exitTour();
    else stop();
    setPhase('starting');
    useApp.getState().setIntro(true);
    const t0 = performance.now();
    let cueDone = false;
    const reveal = () => {
      useApp.setState({ intro: false, reveal: true });
      setS({ welcomeSeen: true });
      timers.current.push(window.setTimeout(() => useApp.setState({ reveal: false }), 900));
      // Frame the whole Moon (the standard "Whole Moon" view); zooming in to a region is the
      // user's choice, never automatic. Issued once the layout has settled: on phones the
      // scene changes from full screen to its own box here, and the framing depends on its shape.
      timers.current.push(window.setTimeout(() => useApp.getState().resetCamera(), 350));
      timers.current.push(window.setTimeout(() => void play(narrationItem('welcome')!), 150));
    };
    const check = () => {
      const r = useReadiness.getState();
      const ready = r.globe !== 'pending' || performance.now() - t0 > 12_000;
      if (cueDone && ready) return reveal();
      if (cueDone) setPhase('preparing'); // only shown when loading is genuinely still running
      timers.current.push(window.setTimeout(check, 120));
    };
    playCue(() => {
      cueDone = true;
      check();
    });
  };

  return (
    <div className={`welcome welcome--start${phase !== 'idle' ? ' is-starting' : ''}`} role="region" aria-label="Start">
      {globe === 'pending' && phase === 'idle' && (
        <div className="welcome__loading" role="status">
          <i className="loadchip__ring" aria-hidden="true" />
          <p>{t('Loading Moon imagery, terrain and Sun/Earth positions…')}</p>
          <p className="welcome__about">{t('LunaNav compares nine candidate landing sites near the lunar south pole: when each one sees the Sun and the Earth.')}</p>
        </div>
      )}
      <button
        type="button"
        className="welcome__enter welcome__enter--start"
        onClick={start}
        aria-disabled={phase !== 'idle'}
        aria-describedby={phase === 'preparing' ? 'welcome-status' : undefined}
      >
        {t(phase === 'idle' ? 'Start Mission' : phase === 'preparing' ? 'Preparing the Moon…' : 'Starting…')}
      </button>
      <div className="welcome__under">
        <button type="button" className="welcome__sound" aria-pressed={!muted} onClick={() => setMuted(!muted)}>
          {muted ? I.muted : I.sound}
          <span>{t(muted ? 'Sound off' : 'Sound on')}</span>
        </button>
        <LangToggle />
        <span id="welcome-status" className="welcome__status" role="status" aria-live="polite">
          {phase === 'preparing' ? t('Loading full-resolution imagery') : ''}
        </span>
      </div>
    </div>
  );
}

/** The welcome line as a caption over the scene while it plays (recording or captions). */
export function WelcomeCaption() {
  const item = usePlayer((s) => s.item);
  const started = usePlayer((s) => s.started);
  const note = usePlayer((s) => s.note);
  // The voice (or, without sound, the timed caption) has reached its end.
  const ended = usePlayer((s) => s.item?.id === 'welcome' && s.started && !s.playing && !s.loading && s.progress >= 1);
  // Once it ends, the caption fades and clears itself. Dismiss still closes it at any moment.
  useEffect(() => {
    if (!ended) return;
    const id = window.setTimeout(() => {
      const st = usePlayer.getState();
      if (st.item?.id === 'welcome' && !st.playing) stop();
    }, 1400);
    return () => window.clearTimeout(id);
  }, [ended]);
  if (item?.id !== 'welcome' || !started) return null;
  return (
    <div className={`welcome-caption${ended ? ' is-leaving' : ''}`} role="status" aria-live="polite">
      <p className="welcome-caption__text">{item.text}</p>
      <div className="welcome-caption__ctrl">
        {note && <span className="welcome-caption__note">{note}</span>}
        <button type="button" className="welcome__link" onClick={stop}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** Kept for existing imports: the guide replaces the old floating player. */
export const AudioPlayer = MissionGuide;
