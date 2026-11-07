import { create } from 'zustand';
import narration from './narration.json';
import { useSettings } from '../state/settings';

/**
 * Narration engine. One narration at a time; nothing loads or plays until the user asks.
 *
 * Sources, in order of preference:
 *  1. recorded  - pre-generated clips in public/audio/narration/<id>.mp3, listed in
 *                 manifest.json (scripts/generate-narration.mjs, run once by a developer;
 *                 no API is called from the browser);
 *  2. browser   - the browser's own speech synthesis (no download, no key), used when a
 *                 clip is missing or the user prefers it;
 *  3. text      - transcript only (no voice available, or audio failed).
 *
 * Calculated readings ("Conditions now") are always spoken by the browser voice from the
 * live, validated app state and are labelled as calculated.
 */

export interface NarrationItem {
  id: string;
  title: string;
  text: string;
  /** Calculated from app state (spoken by the browser voice, never pre-recorded). */
  calculated?: boolean;
}

const ITEMS = new Map<string, NarrationItem>((narration.items as NarrationItem[]).map((i) => [i.id, i]));
export const narrationItem = (id: string) => ITEMS.get(id);

type Source = 'recorded' | 'browser' | 'text';
interface PlayerState {
  item: NarrationItem | null;
  source: Source;
  playing: boolean;
  loading: boolean;
  progress: number; // 0..1
  muted: boolean;
  error: string | null;
  /** Called once when the current item finishes (used by the guided tour). */
  onEnd: (() => void) | null;
}

export const usePlayer = create<PlayerState>(() => ({
  item: null,
  source: 'text',
  playing: false,
  loading: false,
  progress: 0,
  muted: false,
  error: null,
  onEnd: null,
}));

// -------------------------------------------------------------------- manifest
let manifest: Promise<Set<string>> | null = null;
function recordedIds(): Promise<Set<string>> {
  manifest ??= fetch(`${import.meta.env.BASE_URL}audio/narration/manifest.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { files: {} }))
    .then((m: { files?: Record<string, unknown> }) => new Set(Object.keys(m.files ?? {})))
    .catch(() => new Set<string>());
  return manifest;
}

// -------------------------------------------------------------------- outputs
let audio: HTMLAudioElement | null = null;
let raf = 0;
let token = 0;
const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!synth) return null;
  const vs = synth.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
  // Prefer natural/neural voices; avoid novelty voices.
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online/i.test(v.name) ? 4 : 0) + (/en-GB|en-US/i.test(v.lang) ? 1 : 0) + (/guy|ryan|daniel|george|male/i.test(v.name) ? 1 : 0);
  return vs.sort((a, b) => score(b) - score(a))[0] ?? null;
}

function stopOutputs() {
  token++;
  cancelAnimationFrame(raf);
  if (audio) {
    audio.onended = audio.onerror = audio.ontimeupdate = null;
    audio.pause();
  }
  synth?.cancel();
}

export function stop() {
  stopOutputs();
  usePlayer.setState({ item: null, playing: false, loading: false, progress: 0, onEnd: null, error: null });
}

function finished(t: number) {
  if (t !== token) return;
  const end = usePlayer.getState().onEnd;
  usePlayer.setState({ playing: false, progress: 1, onEnd: null });
  end?.();
}

function speak(item: NarrationItem, t: number) {
  if (!synth) {
    usePlayer.setState({ source: 'text', playing: false, loading: false });
    return;
  }
  const u = new SpeechSynthesisUtterance(item.text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = v?.lang ?? 'en-GB';
  u.rate = useSettings.getState().rate * 0.95;
  u.pitch = 0.95;
  u.volume = usePlayer.getState().muted ? 0 : 1;
  u.onboundary = (e) => t === token && usePlayer.setState({ progress: Math.min(1, e.charIndex / item.text.length) });
  u.onend = () => finished(t);
  u.onerror = () => t === token && usePlayer.setState({ playing: false, error: 'Speech unavailable' });
  usePlayer.setState({ source: 'browser', playing: true, loading: false });
  synth.speak(u);
}

/** Play a narration (stops anything playing). */
export async function play(item: NarrationItem, opts: { onEnd?: () => void } = {}) {
  stopOutputs();
  const t = token;
  usePlayer.setState({ item, playing: false, loading: true, progress: 0, error: null, onEnd: opts.onEnd ?? null });
  const s = useSettings.getState();
  const useRecorded = !item.calculated && s.voice === 'recorded' && (await recordedIds()).has(item.id);
  if (t !== token) return;
  if (!useRecorded) return speak(item, t);
  audio ??= new Audio();
  audio.preload = 'auto';
  audio.src = `${import.meta.env.BASE_URL}audio/narration/${item.id}.mp3`;
  audio.playbackRate = s.rate;
  audio.muted = usePlayer.getState().muted;
  audio.ontimeupdate = () => t === token && audio && usePlayer.setState({ progress: audio.duration ? audio.currentTime / audio.duration : 0 });
  audio.onended = () => finished(t);
  audio.onerror = () => t === token && speak(item, t); // clip failed: fall back to the browser voice
  try {
    await audio.play();
    if (t === token) usePlayer.setState({ source: 'recorded', playing: true, loading: false });
  } catch {
    if (t === token) speak(item, t);
  }
}

export function playId(id: string, opts?: { onEnd?: () => void }) {
  const it = ITEMS.get(id);
  if (it) return play(it, opts);
}

export function pause() {
  const st = usePlayer.getState();
  if (!st.playing) return;
  if (st.source === 'recorded') audio?.pause();
  else synth?.pause();
  usePlayer.setState({ playing: false });
}

export function resume() {
  const st = usePlayer.getState();
  if (!st.item || st.playing) return;
  if (st.progress >= 1) return void play(st.item, { onEnd: st.onEnd ?? undefined });
  if (st.source === 'recorded') audio?.play().catch(() => undefined);
  else if (synth?.paused) synth.resume();
  else return void play(st.item, { onEnd: st.onEnd ?? undefined });
  usePlayer.setState({ playing: true });
}

export function replay() {
  const st = usePlayer.getState();
  if (st.item) void play(st.item, { onEnd: st.onEnd ?? undefined });
}

export function setMuted(muted: boolean) {
  usePlayer.setState({ muted });
  if (audio) audio.muted = muted;
  // Speech synthesis cannot change volume mid-utterance: pause instead of playing silently.
  if (muted && usePlayer.getState().source === 'browser') pause();
}

export function setRate(rate: 1 | 1.25 | 1.5) {
  useSettings.getState().set({ rate });
  if (audio) audio.playbackRate = rate;
}
