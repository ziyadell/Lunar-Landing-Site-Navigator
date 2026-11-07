import { create } from 'zustand';
import narration from './narration.json';
import { useSettings } from '../state/settings';
import { assetUrl } from '../data/release';

/**
 * Narration engine. One narration at a time; nothing loads or plays until the user asks.
 *
 * Sources, in order of preference:
 *  1. recorded - pre-generated clips in public/audio/narration/<id>.mp3, listed in
 *                manifest.json (scripts/generate-narration.mjs, run once by a developer;
 *                no speech API is ever called from the browser);
 *  2. device   - the browser's own speech synthesis, American English (en-US) voices only:
 *                a British or other voice is never substituted silently;
 *  3. captions - text only, timed by reading speed, when no American voice is available.
 *
 * Calculated readings ("Conditions now") are spoken by the device voice from the live,
 * validated app state and are labelled as calculated.
 *
 * Robustness rules:
 *  - every asynchronous callback carries the token of the narration that created it, and
 *    is ignored once a newer narration (or stop) has replaced it;
 *  - a failing recording falls back exactly once, whichever error fires first;
 *  - device speech is driven one sentence at a time with a per-sentence watchdog, so a
 *    voice that never reports "end" cannot stall the guide; pause and mute cancel the
 *    current sentence and resume from it;
 *  - manifest and recordings have time limits, so the player never waits indefinitely.
 */

export interface NarrationItem {
  id: string;
  title: string;
  text: string;
  /** What is spoken, when it differs from the caption (pronunciation, e.g. "Afuq"). */
  speech?: string;
  /** Calculated from app state (spoken by the device voice, never pre-recorded). */
  calculated?: boolean;
}

const ITEMS = new Map<string, NarrationItem>((narration.items as NarrationItem[]).map((i) => [i.id, i]));
export const narrationItem = (id: string) => ITEMS.get(id);
export const narrationItems = () => [...ITEMS.values()];

export type Source = 'recorded' | 'device' | 'captions';
interface PlayerState {
  item: NarrationItem | null;
  source: Source;
  playing: boolean;
  loading: boolean;
  progress: number; // 0..1
  muted: boolean;
  /** Honest status when a preferred source was unavailable (shown under the title). */
  note: string | null;
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
  muted: false,
  note: null,
  onEnd: null,
  started: false,
}));

// ------------------------------------------------------------------ text helpers
/**
 * Sentences for speech: split only at . ! ? followed by whitespace, so decimals (58.3),
 * and a final fragment without punctuation are kept intact.
 */
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
const readMs = (t: string) => Math.max(1200, (words(t) / 2.6) * 1000) / useSettings.getState().rate;

// ------------------------------------------------------------------ manifest
let manifest: Promise<Set<string>> | null = null;
function recordedIds(): Promise<Set<string>> {
  manifest ??= (async () => {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(assetUrl('audio/narration/manifest.json'), { cache: 'no-cache', signal: ctl.signal });
      if (!r.ok) return new Set<string>();
      const m = (await r.json()) as { files?: Record<string, unknown> };
      return new Set(Object.keys(m.files ?? {}));
    } catch {
      manifest = null; // network trouble: try again next time
      return new Set<string>();
    } finally {
      window.clearTimeout(timer);
    }
  })();
  return manifest;
}

// ------------------------------------------------------------------ voices
const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

/**
 * American English voices only, preferring a female narrator (to match the recorded voice)
 * and natural/neural quality. Null when the device has no en-US voice.
 */
const FEMALE = /samantha|ava|allison|susan|zoe|nicky|joelle|aria|jenny|zira|michelle|emma|sara|female|google us english/i;
const MALE = /\b(david|mark|guy|alex|fred|tom|aaron|evan|nathan|ryan|eric|christopher|roger|steffan|male)\b/i;
export function americanVoice(): SpeechSynthesisVoice | null {
  if (!synth) return null;
  const vs = synth.getVoices().filter((v) => /^en[-_]US$/i.test(v.lang));
  const score = (v: SpeechSynthesisVoice) =>
    (FEMALE.test(v.name) ? 8 : MALE.test(v.name) ? -4 : 0) + (/natural|neural|online|premium|enhanced/i.test(v.name) ? 4 : 0) + (v.localService ? 1 : 0);
  return vs.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** WebKit (Safari, every iOS browser): speaks long text reliably in one utterance. */
const WEBKIT = typeof navigator !== 'undefined' && /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent) || (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent));

/**
 * Speech chunks: whole sentences grouped up to a length. Fewer, longer utterances avoid the
 * audible gap between sentences; Chromium still needs a limit (it can stop long utterances).
 */
export function speechChunks(text: string, max = WEBKIT ? 1200 : 240): string[] {
  const out: string[] = [];
  let cur = '';
  for (const sentence of splitSentences(text)) {
    if (cur && cur.length + 1 + sentence.length > max) {
      out.push(cur);
      cur = sentence;
    } else cur = cur ? `${cur} ${sentence}` : sentence;
  }
  if (cur) out.push(cur);
  return out.length ? out : [text];
}

// Chrome fills the voice list asynchronously: wait briefly once before deciding there is none.
let voicesReady: Promise<void> | null = null;
const waitVoices = () =>
  (voicesReady ??= new Promise<void>((res) => {
    if (!synth || synth.getVoices().length) return res();
    synth.addEventListener('voiceschanged', () => res(), { once: true });
    window.setTimeout(res, 700);
  }));

// ------------------------------------------------------------------ playback core
let audio: HTMLAudioElement | null = null;
let token = 0; // one per narration
let seq = 0; // one per spoken sentence / timer (pause and mute cancel the current one)
let timer = 0;
let watchdog = 0;
let loadTimer = 0;

/** Current narration's sentence cursor (device voice and captions). */
let sentences: string[] = [];
let idx = 0;
let charsBefore = 0;
let total = 1;
/** Captions: elapsed time within the current sentence when paused. */
let sentenceElapsed = 0;
let sentenceStartedAt = 0;
let voice: SpeechSynthesisVoice | null = null;
/**
 * The utterance being spoken. Holding a reference matters: iOS Safari can garbage-collect an
 * utterance mid-speech, which silently drops the rest and never fires "end".
 */
let current: SpeechSynthesisUtterance | null = null;
let lastCancel = 0;
function cancelSpeech() {
  if (synth && (synth.speaking || synth.pending)) {
    synth.cancel();
    lastCancel = performance.now();
  }
  if (current) current.onboundary = null;
  current = null;
}
let fellBack = false;

function clearTimers() {
  window.clearTimeout(timer);
  window.clearTimeout(watchdog);
  window.clearTimeout(loadTimer);
}

function silenceOutputs() {
  seq++;
  clearTimers();
  if (audio) {
    audio.onended = audio.onerror = audio.ontimeupdate = audio.onplaying = null;
    audio.pause();
    audio.removeAttribute('src');
    try {
      audio.load();
    } catch {
      /* ignore */
    }
  }
  cancelSpeech();
}

export function stop() {
  token++;
  silenceOutputs();
  usePlayer.setState({ item: null, playing: false, loading: false, progress: 0, onEnd: null, note: null, started: false });
}

const SILENT_WAV = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
/**
 * Call from a click or tap. iOS Safari (and some other browsers) only allow speech and audio
 * that begin inside a user gesture; narration that starts a few seconds later (after the
 * opening chime) is otherwise held back or delayed. A silent utterance and a silent audio
 * play inside the gesture unlock both for the rest of the visit.
 */
let unlocked = false;
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  try {
    if (synth) {
      void waitVoices();
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    }
  } catch {
    /* speech unavailable */
  }
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

let endedToken = -1;
function finished(t: number) {
  if (t !== token || endedToken === t) return;
  endedToken = t;
  clearTimers();
  const end = usePlayer.getState().onEnd;
  usePlayer.setState({ playing: false, progress: 1, onEnd: null });
  end?.();
}

function setProgress(within = 0) {
  usePlayer.setState({ progress: Math.min(1, (charsBefore + within) / total) });
}

function advance(t: number) {
  if (t !== token) return;
  charsBefore += sentences[idx].length + 1;
  idx++;
  sentenceElapsed = 0;
  setProgress();
  if (idx >= sentences.length) return finished(t);
  runSentence(t);
}

/** Speak (or, muted / captions, time) the current sentence. */
function runSentence(t: number) {
  if (t !== token) return;
  const st = usePlayer.getState();
  if (!st.playing) return;
  const my = ++seq;
  clearTimers();
  const text = sentences[idx];
  const speakIt = st.source === 'device' && !st.muted && synth && voice;
  if (!speakIt) {
    if (!st.started) usePlayer.setState({ started: true });
    // Captions (or muted device voice): advance on a timer so guides keep their pace.
    const ms = Math.max(200, readMs(text) - sentenceElapsed);
    sentenceStartedAt = performance.now();
    const step = () => {
      if (my !== seq || t !== token) return;
      const done = sentenceElapsed + (performance.now() - sentenceStartedAt);
      const frac = Math.min(1, done / readMs(text));
      setProgress(frac * text.length);
      if (frac >= 1) return advance(t);
      timer = window.setTimeout(step, 200);
    };
    timer = window.setTimeout(step, Math.min(200, ms));
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  current = u;
  u.voice = voice;
  u.lang = voice!.lang;
  u.rate = useSettings.getState().rate;
  u.pitch = 1;
  let started = false;
  u.onstart = () => {
    started = true;
    if (t === token && !usePlayer.getState().started) usePlayer.setState({ started: true });
  };
  u.onboundary = (e) => my === seq && t === token && setProgress(e.charIndex);
  u.onend = () => {
    if (my !== seq || t !== token) return;
    window.clearTimeout(watchdog);
    current = null;
    advance(t);
  };
  u.onerror = (e) => {
    if (my !== seq || t !== token) return;
    // 'interrupted' / 'canceled' come from our own pause, mute or stop.
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    window.clearTimeout(watchdog);
    if (!started && idx === 0) return toCaptions(t, 'Device voice failed');
    advance(t);
  };
  // Watchdog: some engines never fire "end". Generous (2.5x reading time + 4 s), and it
  // only moves on while the engine has really gone quiet, so slow voices are not cut.
  const hardLimit = performance.now() + readMs(text) * 4 + 8000;
  const guard = () => {
    if (my !== seq || t !== token) return;
    if (synth!.speaking && started && performance.now() < hardLimit) {
      watchdog = window.setTimeout(guard, 1500);
      return;
    }
    seq++;
    cancelSpeech();
    if (!started && idx === 0) return toCaptions(t, 'Device voice did not start');
    advance(t);
  };
  watchdog = window.setTimeout(guard, readMs(text) * 2.5 + 4000);
  // iOS drops an utterance queued immediately after cancel(): give the engine a moment.
  const wait = Math.max(0, 140 - (performance.now() - lastCancel));
  if (wait > 0)
    window.setTimeout(() => {
      if (my === seq && t === token) synth!.speak(u);
    }, wait);
  else synth!.speak(u);
}

function toCaptions(t: number, note: string) {
  if (t !== token) return;
  seq++;
  cancelSpeech();
  usePlayer.setState({ source: 'captions', note, playing: true, loading: false });
  runSentence(t);
}

/** Start the device voice, or captions when no American English voice exists. */
async function startSpoken(item: NarrationItem, t: number, noteIfRecordedMissing: string | null) {
  await waitVoices();
  if (t !== token) return;
  voice = americanVoice();
  sentences = speechChunks(item.speech ?? item.text);
  idx = 0;
  charsBefore = 0;
  sentenceElapsed = 0;
  total = Math.max(1, sentences.reduce((n, s) => n + s.length + 1, 0));
  const prefCaptions = useSettings.getState().voice === 'captions';
  if (prefCaptions || !synth || !voice) {
    const note = prefCaptions ? null : !synth ? 'Speech is not available in this browser' : 'No American English voice on this device';
    usePlayer.setState({ source: 'captions', note: note ?? noteIfRecordedMissing, playing: true, loading: false });
  } else {
    usePlayer.setState({ source: 'device', note: noteIfRecordedMissing, playing: true, loading: false });
  }
  runSentence(t);
}

/** Play a narration (stops anything playing). */
export async function play(item: NarrationItem, opts: { onEnd?: () => void } = {}) {
  token++;
  silenceOutputs();
  const t = token;
  fellBack = false;
  usePlayer.setState({ item, playing: false, loading: true, progress: 0, note: null, onEnd: opts.onEnd ?? null, started: false });
  const pref = useSettings.getState().voice;
  const wantRecorded = !item.calculated && pref === 'recorded';
  const have = wantRecorded ? (await recordedIds()).has(item.id) : false;
  if (t !== token) return;
  if (!have) return startSpoken(item, t, wantRecorded ? 'Recorded narration not installed' : null);

  const fallback = (why: string) => {
    if (t !== token || fellBack) return;
    fellBack = true; // audio "error" and a rejected play() can both fire: fall back once
    window.clearTimeout(loadTimer);
    if (audio) {
      audio.onended = audio.onerror = audio.ontimeupdate = audio.onplaying = null;
      audio.pause();
    }
    void startSpoken(item, t, why);
  };
  audio ??= new Audio();
  audio.preload = 'auto';
  audio.src = assetUrl(`audio/narration/${item.id}.mp3`);
  audio.playbackRate = useSettings.getState().rate;
  audio.muted = usePlayer.getState().muted;
  audio.ontimeupdate = () => t === token && audio && usePlayer.setState({ progress: audio.duration ? audio.currentTime / audio.duration : 0 });
  audio.onended = () => finished(t);
  audio.onerror = () => fallback('Recording unavailable');
  audio.onplaying = () => {
    window.clearTimeout(loadTimer);
    if (t === token) usePlayer.setState({ started: true });
  };
  loadTimer = window.setTimeout(() => fallback('Recording too slow to load'), 8000);
  usePlayer.setState({ source: 'recorded' });
  try {
    await audio.play();
    if (t === token && !fellBack) usePlayer.setState({ playing: true, loading: false });
  } catch (e) {
    // NotAllowedError: the browser blocked sound (no user gesture). Others: decoding/network.
    fallback((e as Error)?.name === 'NotAllowedError' ? 'Recording blocked by the browser' : 'Recording unavailable');
  }
}

export function playId(id: string, opts?: { onEnd?: () => void }) {
  const it = ITEMS.get(id);
  if (it) return play(it, opts);
}

export function pause() {
  const st = usePlayer.getState();
  if (!st.playing) return;
  usePlayer.setState({ playing: false });
  if (st.source === 'recorded') return void audio?.pause();
  // Device voice / captions: cancel the current sentence and keep the cursor.
  if (st.source === 'captions' || st.muted) sentenceElapsed += performance.now() - sentenceStartedAt;
  else sentenceElapsed = 0; // speech restarts the sentence
  seq++;
  clearTimers();
  cancelSpeech();
}

export function resume() {
  const st = usePlayer.getState();
  if (!st.item || st.playing || st.loading) return;
  if (st.progress >= 1) return void play(st.item, { onEnd: st.onEnd ?? undefined });
  usePlayer.setState({ playing: true });
  if (st.source === 'recorded') return void audio?.play().catch(() => undefined);
  runSentence(token);
}

export function replay() {
  const st = usePlayer.getState();
  if (st.item) void play(st.item, { onEnd: st.onEnd ?? undefined });
}

/**
 * Mute never pauses: recordings keep playing silently; the device voice continues as timed
 * captions and picks up speaking at the current sentence when unmuted.
 */
export function setMuted(muted: boolean) {
  const st = usePlayer.getState();
  if (st.muted === muted) return;
  if (audio) audio.muted = muted;
  if (st.source === 'device' && st.playing) {
    if (muted) {
      sentenceElapsed = 0;
      usePlayer.setState({ muted });
      seq++;
      cancelSpeech();
      runSentence(token);
      return;
    }
    usePlayer.setState({ muted });
    seq++;
    window.clearTimeout(timer);
    sentenceElapsed = 0;
    runSentence(token);
    return;
  }
  usePlayer.setState({ muted });
}

export function setRate(rate: 1 | 1.25 | 1.5) {
  useSettings.getState().set({ rate });
  if (audio) audio.playbackRate = rate;
}

// ------------------------------------------------------------------ opening chime
let chimeCtx: AudioContext | null = null;
let chimeGain: GainNode | null = null;
let chimeTimer = 0;
/**
 * A short, quiet opening sound synthesised in the browser (no file, no licence needed): a low
 * atmospheric chord that swells and fades, with two soft communication tones. About 2.6 s,
 * fully faded before `onDone` fires. Plays only from a user gesture.
 */
export function playChime(onDone: () => void): number {
  stopChime();
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const DURATION = 2.6;
  if (!AC) {
    chimeTimer = window.setTimeout(onDone, 300);
    return 0.3;
  }
  try {
    chimeCtx = new AC();
    const ctx = chimeCtx;
    const now = ctx.currentTime + 0.03;
    const out = ctx.createGain();
    chimeGain = out;
    out.gain.value = usePlayer.getState().muted ? 0 : 1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(out);
    out.connect(ctx.destination);
    // Low chord (A2, E3, A3, C#4): slow swell, long fade.
    const pad = ctx.createGain();
    pad.gain.setValueAtTime(0.0001, now);
    pad.gain.exponentialRampToValueAtTime(0.11, now + 0.7);
    pad.gain.setValueAtTime(0.11, now + 1.2);
    pad.gain.exponentialRampToValueAtTime(0.0001, now + DURATION);
    pad.connect(lp);
    for (const [f, detune] of [
      [110, -4],
      [164.81, 3],
      [220, -2],
      [277.18, 5],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(pad);
      o.start(now);
      o.stop(now + DURATION + 0.05);
    }
    // Two soft communication tones.
    for (const [at, f] of [
      [0.55, 1318.5],
      [0.82, 1760],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(0.035, now + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.32);
      o.connect(g).connect(out);
      o.start(now + at);
      o.stop(now + at + 0.36);
    }
    void ctx.resume().catch(() => undefined);
  } catch {
    stopChime();
  }
  // The voice starts only after the chime has fully faded (plus a short breath).
  chimeTimer = window.setTimeout(() => {
    stopChime();
    onDone();
  }, (DURATION + 0.25) * 1000);
  return DURATION;
}
export function setChimeMuted(muted: boolean) {
  if (chimeGain && chimeCtx) chimeGain.gain.setTargetAtTime(muted ? 0 : 1, chimeCtx.currentTime, 0.04);
}
export function stopChime() {
  window.clearTimeout(chimeTimer);
  chimeGain = null;
  if (chimeCtx) {
    const c = chimeCtx;
    chimeCtx = null;
    void c.close().catch(() => undefined);
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __engine: { splitSentences, americanVoice, play, pause, resume, stop, setMuted, playId } });
