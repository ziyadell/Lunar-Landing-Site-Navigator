import { create } from 'zustand';
import narration from './narration.json';
import narrationAr from './narration.ar.json';
import { t as tr } from '../i18n';
import { useSettings } from '../state/settings';
import { assetUrl } from '../data/release';

/**
 * Narration engine: one narrator, the same audio on every device.
 *
 *  - Static narration (welcome, views, regions, terms, tour): pre-generated recordings in
 *    public/audio/narration/<id>.mp3, listed in manifest.json, all from one voice with one set
 *    of production settings (scripts/generate-narration.mjs).
 *  - Live calculated readings ("Conditions now"): shown as text, since they change with every
 *    voice ID, model and settings; provider key stays on the server; responses cached by
 *    text + voice configuration).
 *  - Browser/system speech synthesis is never used: when a recording or the server voice is
 *    unavailable, the text is shown as captions with an honest status and a retry.
 *
 * Robustness: one narration at a time; every async step carries a token, so a late
 * manifest, recording or server response can never play for a narration that has been
 * replaced (e.g. after a region change); a failure falls back exactly once; requests have
 * time limits; mute is remembered and never pauses the narration.
 */

export interface NarrationItem {
  id: string;
  title: string;
  text: string;
  /** Calculated from app state (server voice when available, never pre-recorded). */
  calculated?: boolean;
}

const ITEMS = new Map<string, NarrationItem>((narration.items as NarrationItem[]).map((i) => [i.id, i]));
const AR = new Map<string, { title: string; text: string }>((narrationAr.items as { id: string; title: string; text: string }[]).map((i) => [i.id, i]));
const isAr = () => useSettings.getState().lang === 'ar';
/** The item in the interface language: Arabic title and text over the same id and tour step. */
export const narrationItem = (id: string): NarrationItem | undefined => {
  const it = ITEMS.get(id);
  const ar = isAr() ? AR.get(id) : undefined;
  return it && ar ? { ...it, ...ar } : it;
};
export const narrationItems = () => [...ITEMS.keys()].map((id) => narrationItem(id)!);
/** Recordings live beside each other: English in audio/narration, Arabic in audio/narration/ar. */
const clipDir = () => (isAr() ? 'audio/narration/ar' : 'audio/narration');

export type Source = 'recorded' | 'captions';
interface PlayerState {
  item: NarrationItem | null;
  source: Source;
  playing: boolean;
  loading: boolean;
  progress: number; // 0..1
  muted: boolean;
  /** Honest status when the voice is unavailable (shown under the title). */
  note: string | null;
  /** Retry for an unavailable voice (refetches and replays). */
  canRetry: boolean;
  /** Called once when the current item finishes (used by the guided tour and welcome). */
  onEnd: (() => void) | null;
  /** True once sound (or, without a voice, the captions clock) has actually started. */
  started: boolean;
}

export const usePlayer = create<PlayerState>(() => ({
  item: null,
  source: 'captions',
  playing: false,
  loading: false,
  progress: 0,
  muted: !useSettings.getState().sound,
  note: null,
  canRetry: false,
  onEnd: null,
  started: false,
}));

/** Sentences split only at . ! ? followed by whitespace (decimals and trailing fragments kept). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ((c === '.' || c === '!' || c === '?') && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      let j = i + 1;
      while (j < text.length && /[.!?"'”’)]/.test(text[j])) j++;
      const s = text.slice(start, j).trim();
      if (s) out.push(s);
      start = j;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out.length ? out : [text];
}
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
/** Reading time for captions (ms) at ~155 words per minute, scaled by playback speed. */
const readMs = (t: string) => Math.max(1500, (words(t) / 2.6) * 1000) / useSettings.getState().rate;

// ------------------------------------------------------------------ recorded clips
const manifests = new Map<string, Promise<Set<string> | null>>();
/**
 * Ids of the recorded clips, from the manifest; null when the manifest could not be read
 * (network busy or offline). Fetched once at start-up, before the large Moon imagery starts
 * downloading, so it is ready when Start Mission plays the welcome.
 */
function recordedIds(): Promise<Set<string> | null> {
  const dir = clipDir();
  const known = manifests.get(dir);
  if (known) return known;
  const p = (async () => {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 12_000);
    try {
      const r = await fetch(assetUrl(`${dir}/manifest.json`), { cache: 'no-cache', signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const m = (await r.json()) as { files?: Record<string, unknown> };
      return new Set(Object.keys(m.files ?? {}));
    } catch {
      manifests.delete(dir); // try again next time
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  })();
  manifests.set(dir, p);
  return p;
}
if (typeof window !== 'undefined') void recordedIds();

/**
 * Clips needed the moment the interface appears are downloaded when the page opens, so they
 * are already in memory when Start Mission plays them (the large Moon imagery competes for the
 * network right after that tap). Others stream on demand.
 */
const early = new Map<string, Promise<string | null>>();
/**
 * Download a clip into memory now (once), so playing it later starts without the network.
 * Played from a blob: URL, as the welcome always was (works on iPhone Safari). Not "warm the
 * HTTP cache, then play the URL": that crashed the WebKit page in testing.
 */
export function preloadClip(id: string) {
  if (early.has(id)) return;
  early.set(
    id,
    fetch(assetUrl(`${clipDir()}/${id}.mp3`)) // the page's language (switching it reloads)
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('audio') ? r.blob() : null))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null),
  );
}
if (typeof window !== 'undefined') preloadClip('welcome');

// ------------------------------------------------------------------ playback core
let audio: HTMLAudioElement | null = null;
let token = 0;
let timer = 0;
let loadTimer = 0;
let fellBack = false;
/** Captions clock. */
let capTotal = 1;
let capElapsed = 0;
let capStartedAt = 0;

function silence() {
  window.clearInterval(timer);
  window.clearTimeout(loadTimer);
  if (audio) {
    audio.onended = audio.onerror = audio.ontimeupdate = audio.onplaying = null;
    audio.pause();
  }
}

export function stop() {
  token++;
  silence();
  usePlayer.setState({ item: null, playing: false, loading: false, progress: 0, onEnd: null, note: null, canRetry: false, started: false });
}

let endedToken = -1;
function finished(t: number) {
  if (t !== token || endedToken === t) return;
  endedToken = t;
  silence();
  const end = usePlayer.getState().onEnd;
  usePlayer.setState({ playing: false, progress: 1, onEnd: null });
  end?.();
}

function runCaptions(t: number) {
  window.clearInterval(timer);
  capStartedAt = performance.now();
  timer = window.setInterval(() => {
    if (t !== token) return window.clearInterval(timer);
    if (!usePlayer.getState().playing) return;
    const done = capElapsed + (performance.now() - capStartedAt);
    usePlayer.setState({ progress: Math.min(1, done / capTotal) });
    if (done >= capTotal) finished(t);
  }, 200);
}

/** Text only: captions timed to reading speed, with the reason the voice is unavailable. */
function toCaptions(item: NarrationItem, t: number, note: string | null, canRetry: boolean) {
  if (t !== token) return;
  capTotal = readMs(item.text);
  capElapsed = 0;
  usePlayer.setState({ source: 'captions', note, canRetry, playing: true, loading: false, started: true });
  runCaptions(t);
}

function playAudio(item: NarrationItem, t: number, src: string, kind: 'recorded') {
  const fallback = (why: string) => {
    if (t !== token || fellBack) return;
    fellBack = true; // "error" and a rejected play() can both fire: fall back once
    silence();
    toCaptions(item, t, why, true);
  };
  audio ??= new Audio();
  audio.preload = 'auto';
  audio.src = src;
  audio.playbackRate = useSettings.getState().rate;
  audio.muted = usePlayer.getState().muted;
  audio.ontimeupdate = () => t === token && audio && usePlayer.setState({ progress: audio.duration ? audio.currentTime / audio.duration : 0 });
  audio.onended = () => finished(t);
  audio.onerror = () => fallback('Recording could not play · captions');
  audio.onplaying = () => {
    window.clearTimeout(loadTimer);
    if (t === token) usePlayer.setState({ started: true });
  };
  usePlayer.setState({ source: kind, note: null, canRetry: false });
  // Starting play() on a clip that has no data yet lets the output begin mid-word: the first
  // syllable is lost while the decoder catches up. Wait for the opening to be buffered, then
  // play from the first sample. Not "canplaythrough": that waits for the whole clip, which on
  // a slow line takes longer than the patience below and would drop us to captions in silence.
  const el = audio;
  let begun = false;
  const start = () => {
    el.removeEventListener('canplay', start);
    if (begun || t !== token || fellBack || audio !== el) return;
    begun = true;
    el.currentTime = 0;
    // Patience starts when playback does, so waiting for the buffer never counts against it.
    loadTimer = window.setTimeout(() => fallback('Recording too slow to load · captions'), 8000);
    el.play()
      .then(() => {
        if (t === token && !fellBack) usePlayer.setState({ playing: true, loading: false });
      })
      .catch((e: Error) => fallback(e?.name === 'NotAllowedError' ? 'Sound blocked by the browser · captions' : 'Recording could not play · captions'));
  };
  el.addEventListener('canplay', start);
  el.load();
  // iPhones do not buffer before play() is called, so the event may never come: start anyway.
  window.setTimeout(start, 1500);
}

/** Play a narration (stops anything playing). */
export async function play(item: NarrationItem, opts: { onEnd?: () => void } = {}) {
  token++;
  silence();
  const t = token;
  fellBack = false;
  usePlayer.setState({ item, playing: false, loading: true, progress: 0, note: null, canRetry: false, onEnd: opts.onEnd ?? null, started: false });
  if (useSettings.getState().voice === 'captions') return toCaptions(item, t, null, false);
  if (item.calculated) return toCaptions(item, t, null, false);
  const ids = await recordedIds();
  if (t !== token) return;
  // A known list without this clip means there is no recording. An unreadable list (busy
  // network) is not proof of that: try the recording itself, which falls back to captions
  // if it does not load.
  if (ids && !ids.has(item.id)) return toCaptions(item, t, tr('Recorded narration not available · captions'), true);
  const pre = early.get(item.id);
  // Normally already downloaded; if not, wait a little, then stream it instead.
  const local = pre ? await Promise.race([pre, new Promise<null>((r) => window.setTimeout(() => r(null), 6000))]) : null;
  if (t !== token) return;
  playAudio(item, t, local ?? assetUrl(`${clipDir()}/${item.id}.mp3`), 'recorded');
}

export function playId(id: string, opts?: { onEnd?: () => void }) {
  const it = narrationItem(id);
  if (it) return play(it, opts);
}

/** Retry an unavailable voice: refetch the manifest and play the item again. */
export function retryVoice() {
  const st = usePlayer.getState();
  if (!st.item) return;
  manifests.delete(clipDir());
  void play(st.item, { onEnd: st.onEnd ?? undefined });
}

export function pause() {
  const st = usePlayer.getState();
  if (!st.playing) return;
  usePlayer.setState({ playing: false });
  if (st.source === 'captions') capElapsed += performance.now() - capStartedAt;
  else audio?.pause();
}

export function resume() {
  const st = usePlayer.getState();
  if (!st.item || st.playing || st.loading) return;
  if (st.progress >= 1) return void play(st.item, { onEnd: st.onEnd ?? undefined });
  usePlayer.setState({ playing: true });
  if (st.source === 'captions') runCaptions(token);
  else audio?.play().catch(() => undefined);
}

export function replay() {
  const st = usePlayer.getState();
  if (st.item) void play(st.item, { onEnd: st.onEnd ?? undefined });
}

/** Mute is remembered, applies to every sound, and never pauses the narration. */
export function setMuted(muted: boolean) {
  usePlayer.setState({ muted });
  useSettings.getState().set({ sound: !muted });
  if (audio) audio.muted = muted;
  if (cueGain && cueCtx) cueGain.gain.setTargetAtTime(muted ? 0 : 1, cueCtx.currentTime, 0.03);
}

export function setRate(rate: 1 | 1.25 | 1.5) {
  useSettings.getState().set({ rate });
  if (audio) audio.playbackRate = rate;
}

const SILENT_WAV =
  'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
/**
 * Call from the Start Mission tap: iOS only lets audio that begins inside a user gesture play
 * later (the welcome recording starts after the entry cue). A silent play unlocks it.
 */
let unlocked = false;
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  try {
    audio ??= new Audio();
    audio.muted = true;
    audio.src = SILENT_WAV;
    void audio
      .play()
      .then(() => audio?.pause())
      .catch(() => undefined)
      .finally(() => {
        if (audio) audio.muted = usePlayer.getState().muted;
      });
  } catch {
    /* audio unavailable */
  }
}

// ------------------------------------------------------------------ entry cue
let cueCtx: AudioContext | null = null;
let cueGain: GainNode | null = null;
let cueTimer = 0;
/** Length of the mission-entry cue (s). */
export const CUE_SECONDS = 0.9;
/**
 * Mission-entry cue: an original, synthesised "comms ready" confirmation (two short clean
 * tones over a soft, quickly fading chord), about 0.9 s at a low level. Played once, from
 * the Start Mission tap only; silent when sound is off. `onDone` fires after it has fully
 * faded, so narration never overlaps it.
 */
export function playCue(onDone: () => void) {
  stopCue();
  const muted = usePlayer.getState().muted;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AC && !muted) {
    try {
      cueCtx = new AC();
      const ctx = cueCtx;
      const now = ctx.currentTime + 0.02;
      const out = ctx.createGain();
      cueGain = out;
      out.gain.value = 1;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      lp.connect(out);
      out.connect(ctx.destination);
      // Soft chord (A3, E4, A4): quick swell, clean fade by 0.85 s.
      const pad = ctx.createGain();
      pad.gain.setValueAtTime(0.0001, now);
      pad.gain.exponentialRampToValueAtTime(0.06, now + 0.12);
      pad.gain.exponentialRampToValueAtTime(0.0001, now + CUE_SECONDS - 0.05);
      pad.connect(lp);
      for (const f of [220, 329.63, 440]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.connect(pad);
        o.start(now);
        o.stop(now + CUE_SECONDS);
      }
      // Two short confirmation tones (rising fifth).
      for (const [at, f] of [
        [0.06, 1174.66],
        [0.26, 1760],
      ] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now + at);
        g.gain.exponentialRampToValueAtTime(0.045, now + at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.16);
        o.connect(g).connect(out);
        o.start(now + at);
        o.stop(now + at + 0.18);
      }
      void ctx.resume().catch(() => undefined);
    } catch {
      stopCue();
    }
  }
  cueTimer = window.setTimeout(() => {
    stopCue();
    onDone();
  }, (CUE_SECONDS + 0.12) * 1000);
}
export function stopCue() {
  window.clearTimeout(cueTimer);
  cueGain = null;
  if (cueCtx) {
    const c = cueCtx;
    cueCtx = null;
    void c.close().catch(() => undefined);
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __engine: { splitSentences, play, pause, resume, stop, setMuted, playId, retryVoice } });

// A narration started in one language never keeps playing (or stays captioned) in the other.
let langWas = useSettings.getState().lang;
useSettings.subscribe((s) => {
  if (s.lang !== langWas) {
    langWas = s.lang;
    stop();
  }
});
