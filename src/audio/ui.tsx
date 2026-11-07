import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../state/settings';
import { useApp } from '../state/store';
import { narrationItem, pause, play, replay, resume, setMuted, setRate, stop, usePlayer, type NarrationItem } from './engine';
import { exitTour, nextStep, toggleTourPause, TOUR_LENGTH, useTour } from './tour';

const Headphones = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <rect x="2" y="9.5" width="3" height="4.5" rx="1.2" fill="currentColor" />
    <rect x="11" y="9.5" width="3" height="4.5" rx="1.2" fill="currentColor" />
  </svg>
);

/**
 * Small "listen" button beside a piece of information. Hidden unless the Audio Guide is
 * enabled in Settings, so it adds nothing to the interface by default.
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
        if (active) pause();
        else void play(it);
      }}
    >
      <Headphones size={13} />
    </button>
  );
}

const RATES = [1, 1.25, 1.5] as const;

/** Compact floating player: one narration at a time, with transcript and tour controls. */
export function AudioPlayer() {
  const { item, playing, loading, progress, muted, source, error } = usePlayer();
  const rate = useSettings((s) => s.rate);
  const transcript = useSettings((s) => s.transcript);
  const setS = useSettings((s) => s.set);
  const tour = useTour();
  const regionId = useApp((s) => s.regionId);
  // A region narration no longer matches the screen once another region is chosen.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const it = usePlayer.getState().item;
    if (it?.id.startsWith('region-') && it.id !== `region-${regionId}` && useTour.getState().step < 0) stop();
  }, [regionId]);
  if (!item) return null;
  const inTour = tour.step >= 0;
  const close = () => (inTour ? exitTour() : stop());
  return (
    <section className="aplayer" aria-label="Narration" data-obstacle>
      <div className="aplayer__head">
        <span className="aplayer__icon" aria-hidden="true">
          <Headphones />
        </span>
        <div className="aplayer__titles">
          <span className="aplayer__title">{item.title}</span>
          <span className="aplayer__src">
            {item.calculated ? 'Calculated now · ' : ''}
            {loading ? 'Loading…' : source === 'recorded' ? 'Narrator' : source === 'browser' ? 'Browser voice' : error ? 'No voice here · captions' : 'Captions'}
          </span>
        </div>
        <button type="button" className="aplayer__x" aria-label="Close narration" onClick={close}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>
      <div className="aplayer__bar" role="progressbar" aria-label="Narration progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="aplayer__ctrl">
        <button type="button" className="aplayer__btn aplayer__btn--main" aria-label={playing ? 'Pause' : 'Play'} onClick={() => (inTour ? toggleTourPause() : playing ? pause() : resume())}>
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2" width="2.5" height="8" rx=".5" fill="currentColor" /><rect x="7" y="2" width="2.5" height="8" rx=".5" fill="currentColor" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2v8l6.5-4z" fill="currentColor" /></svg>
          )}
        </button>
        <button type="button" className="aplayer__btn" aria-label="Replay" title="Replay" onClick={replay}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        </button>
        <button type="button" className="aplayer__btn aplayer__btn--rate num" aria-label={`Playback speed ${rate} times. Change speed.`} onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}>
          {rate}×
        </button>
        <button type="button" className={`aplayer__btn${muted ? ' is-on' : ''}`} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}>
          {muted ? (
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.5L8.5 3v10L5 10H2.5zM11 6l4 4M15 6l-4 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.5L8.5 3v10L5 10H2.5zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
          )}
        </button>
        <button type="button" className={`aplayer__btn aplayer__btn--cc${transcript ? ' is-on' : ''}`} aria-pressed={transcript} aria-label="Transcript" title="Transcript" onClick={() => setS({ transcript: !transcript })}>
          CC
        </button>
        {inTour && (
          <span className="aplayer__tour">
            <span className="num">
              {tour.step + 1}/{TOUR_LENGTH}
            </span>
            <button type="button" className="aplayer__next" onClick={nextStep}>
              {tour.step + 1 < TOUR_LENGTH ? 'Next' : 'Finish'}
            </button>
          </span>
        )}
      </div>
      {transcript && <p className="aplayer__text">{item.text}</p>}
    </section>
  );
}

/**
 * Enter mission: an optional, user-started welcome. Nothing plays before a click; the
 * Moon renders underneath from the start. Skip, mute, or any interaction ends it.
 */
export function Welcome() {
  const seen = useSettings((s) => s.welcomeSeen);
  const setS = useSettings((s) => s.set);
  const mode = useApp((s) => s.mode);
  const intro = useApp((s) => s.intro);
  const [caption, setCaption] = useState(false);
  const muted = usePlayer((s) => s.muted);
  const finish = () => {
    useApp.getState().setIntro(false);
    setCaption(false);
    setS({ welcomeSeen: true });
  };
  useEffect(() => {
    if (!intro) return;
    const t = window.setTimeout(finish, 7000); // never longer than this
    const end = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.welcome')) return;
      stop();
      finish();
    };
    window.addEventListener('pointerdown', end);
    window.addEventListener('keydown', end);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', end);
      window.removeEventListener('keydown', end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro]);

  if (mode !== 'orbital' || (seen && !intro)) return null;

  const enter = (sound: boolean) => {
    if (!sound) return setS({ welcomeSeen: true });
    useApp.getState().setIntro(true);
    useApp.getState().introCamera();
    setCaption(true);
    const it = narrationItem('welcome')!;
    void play(it, { onEnd: () => window.setTimeout(finish, 700) });
  };

  if (intro)
    return (
      <div className="welcome welcome--playing">
        {caption && <p className="welcome__caption">Welcome aboard. Your lunar journey begins now.</p>}
        <div className="welcome__ctrl">
          <button type="button" className="welcome__link" onClick={() => setMuted(!muted)}>
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button
            type="button"
            className="welcome__link"
            onClick={() => {
              stop();
              finish();
            }}
          >
            Skip
          </button>
        </div>
      </div>
    );

  return (
    <div className="welcome" role="dialog" aria-label="Welcome">
      <div className="welcome__card">
        <span className="welcome__eyebrow">Artemis III candidate regions</span>
        <button type="button" className="welcome__enter" onClick={() => enter(true)}>
          <Headphones size={15} />
          Enter mission
        </button>
        <button type="button" className="welcome__link" onClick={() => enter(false)}>
          Explore without sound
        </button>
      </div>
    </div>
  );
}
