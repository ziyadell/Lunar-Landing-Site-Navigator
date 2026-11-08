import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useSettings } from '../state/settings';
import { useApp } from '../state/store';
import { narrationItem, narrationItems, pause, play, playCue, replay, resume, retryVoice, setMuted, setRate, stop, unlockAudio, usePlayer, type NarrationItem } from './engine';
import { useReadiness } from '../state/loading';
import { exitTour, nextStep, prevStep, replayStep, startTour, toggleTourPause, TOUR_LENGTH, useTour } from './tour';

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
export const useGuideView = create<{ minimized: boolean; set: (m: boolean) => void }>((set) => ({ minimized: false, set: (minimized) => set({ minimized }) }));
const VIEW_ITEM = { orbital: 'orbit-intro', surface: 'surface-intro', analysis: 'analysis-intro' } as const;
const SOURCE_LABEL = { recorded: 'Recorded narrator', server: 'Narrator voice', captions: 'Captions' } as const;

function topicGroups() {
  const all = narrationItems();
  return [
    { name: 'Views', items: ['orbit-intro', 'surface-intro', 'view-time', 'view-display', 'view-measurements', 'view-atlas', 'view-sources'].map((id) => narrationItem(id)!).filter(Boolean) },
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
    <div className="guide__menu sheet" ref={ref} role="dialog" aria-label="Mission guide">
      <div className="sheet__head">
        <span className="sheet__title">Mission guide</span>
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

  if (intro || (mode === 'orbital' && !welcomeSeen)) return null;
  const inTour = tour.step >= 0;
  const active = !!(item || inTour);
  const exit = () => {
    setMin(false); // the next narration opens in full
    if (inTour) exitTour();
    else stop();
  };
  const title = inTour ? narrationItem(STEP_IDS[tour.step])?.title : item?.title;
  const status = loading || tour.waiting ? (tour.waiting ? 'Preparing the view…' : 'Loading…') : item?.calculated ? `Calculated now · ${SOURCE_LABEL[source]}` : SOURCE_LABEL[source];
  const playPause = () => (inTour ? toggleTourPause() : playing ? pause() : resume());
  const isPlaying = inTour ? !tour.paused && (playing || tour.waiting) : playing;

  return (
    <section className={`guide guide--${placement}${inTour ? ' is-tour' : ''}${active ? ' is-active' : ''}${active && minimized ? ' is-min' : ''}`} aria-label="Mission guide" data-obstacle>
      {active && minimized && (
        <div className="aplayer-mini" role="group" aria-label="Narration (hidden player)">
          <button type="button" className="aplayer__btn aplayer__btn--main" aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'} onClick={playPause}>
            {isPlaying ? I.pause : I.play}
          </button>
          <button type="button" className="aplayer-mini__title" onClick={() => setMin(false)} aria-label={`Show player: ${title ?? 'narration'}`}>
            <span className="aplayer-mini__name">
              {inTour && <span className="num">{tour.step + 1}/{TOUR_LENGTH} · </span>}
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
          <div className="aplayer__head">
            <span className="aplayer__icon" aria-hidden="true">
              <Headphones />
            </span>
            <div className="aplayer__titles">
              <span className="aplayer__title">
                {inTour && <span className="aplayer__step num">{tour.step + 1}/{TOUR_LENGTH} · </span>}
                {inTour ? narrationItem(STEP_IDS[tour.step])?.title : item?.title}
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
            <button type="button" className="aplayer__btn aplayer__btn--rate num" aria-label={`Playback speed ${rate} times. Change speed.`} title="Playback speed" onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}>
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
                  {tour.step + 1 < TOUR_LENGTH ? 'Next' : 'Finish'}
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
const STEP_IDS = narrationItems()
  .filter((i) => i.id.startsWith('tour-'))
  .map((i) => i.id);


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
      <button
        type="button"
        className="welcome__enter welcome__enter--start"
        onClick={start}
        aria-disabled={phase !== 'idle'}
        aria-describedby={phase === 'preparing' ? 'welcome-status' : undefined}
      >
        {phase === 'idle' ? 'Start Mission' : phase === 'preparing' ? 'Preparing the Moon…' : 'Starting…'}
      </button>
      <div className="welcome__under">
        <button type="button" className="welcome__sound" aria-pressed={!muted} onClick={() => setMuted(!muted)}>
          {muted ? I.muted : I.sound}
          <span>{muted ? 'Sound off' : 'Sound on'}</span>
        </button>
        <span id="welcome-status" className="welcome__status" role="status" aria-live="polite">
          {phase === 'preparing' ? 'Loading full-resolution imagery' : ''}
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
  if (item?.id !== 'welcome' || !started) return null;
  return (
    <div className="welcome-caption" role="status" aria-live="polite">
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
