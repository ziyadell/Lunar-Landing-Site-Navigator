#!/usr/bin/env node
/**
 * Generate the narrator clips once, at development time (never from the browser).
 *
 *   ELEVENLABS_API_KEY=...  ELEVENLABS_VOICE_ID=...  node scripts/generate-narration.mjs --check-voice
 *   ELEVENLABS_API_KEY=...  ELEVENLABS_VOICE_ID=...  node scripts/generate-narration.mjs
 *
 * - One narrator for every clip: the voice in ELEVENLABS_VOICE_ID.
 * - American English is required. Before generating anything the script reads the voice's
 *   labels from ElevenLabs and stops unless its accent is American (override only after
 *   listening yourself: --accept-voice).
 * - Only missing or changed clips are generated: each clip's hash covers its text, the
 *   voice, the model, the output format and the voice settings.
 * - Progress is saved after every successful clip (manifest written atomically), so an
 *   interrupted run resumes where it stopped.
 * - The key is read from the environment only; it is never written to disk or bundled.
 *
 * Options: --check-voice  --only id1,id2  --force  --dry-run  --accept-voice
 * Voice licensing: use a voice you are licensed to use (an ElevenLabs library voice or your
 * own under your plan's terms). Do not clone a real person's voice without consent, and do
 * not imitate a NASA announcer. See docs/NARRATION.md.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'audio', 'narration');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const onlyArg = args.find((a) => a.startsWith('--only='))?.slice(7) ?? (flag('--only') ? args[args.indexOf('--only') + 1] : '');
const only = (onlyArg ?? '').split(',').filter(Boolean);
const force = flag('--force');
const dry = flag('--dry-run');

const key = process.env.ELEVENLABS_API_KEY;
const voice = process.env.ELEVENLABS_VOICE_ID;
const model = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';
const FORMAT = 'mp3_44100_64';
const SETTINGS = { stability: 0.55, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true };

if (!dry && (!key || !voice)) {
  console.error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in the environment (never in code). Use --dry-run to preview.');
  process.exit(1);
}

const { items } = JSON.parse(readFileSync(join(root, 'src', 'audio', 'narration.json'), 'utf8'));
// Calculated readings are spoken live from app state; they are never pre-recorded.
const recordable = items.filter((it) => !it.calculated);

async function checkVoice() {
  const res = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voice)}`, { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new Error(`Voice lookup failed: HTTP ${res.status} ${await res.text()}`);
  const v = await res.json();
  const labels = v.labels ?? {};
  const accent = String(labels.accent ?? '').toLowerCase();
  const lang = String(labels.language ?? v.fine_tuning?.language ?? '').toLowerCase();
  console.log(`Voice: ${v.name} (${voice})  accent: ${labels.accent ?? 'unlabelled'}  language: ${lang || 'unlabelled'}  category: ${v.category}`);
  const american = /american|us\b|u\.s\./.test(accent);
  if (!american && !flag('--accept-voice')) {
    console.error('This voice is not labelled American English. Choose an American voice, or listen and re-run with --accept-voice.');
    process.exit(2);
  }
  return v;
}

const hashOf = (it) => createHash('sha256').update(JSON.stringify([voice, model, FORMAT, SETTINGS, it.text])).digest('hex').slice(0, 16);

mkdirSync(out, { recursive: true });
const manPath = join(out, 'manifest.json');
const manifest = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : { files: {} };
manifest.files ??= {};
const save = () => {
  manifest.voice = voice;
  manifest.model = model;
  manifest.format = FORMAT;
  manifest.updatedUtc = new Date().toISOString();
  const tmp = `${manPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 1));
  renameSync(tmp, manPath); // atomic: an interrupted run never leaves a half-written manifest
};

if (!dry) {
  const v = await checkVoice();
  manifest.voiceName = v.name;
  if (flag('--check-voice')) process.exit(0);
}

// Clips no longer in the script are dropped from the manifest (the app then ignores them).
for (const id of Object.keys(manifest.files)) if (!recordable.some((it) => it.id === id)) delete manifest.files[id];

let made = 0;
let chars = 0;
for (const it of recordable) {
  if (only.length && !only.includes(it.id)) continue;
  const hash = hashOf(it);
  const file = join(out, `${it.id}.mp3`);
  if (!force && manifest.files[it.id]?.hash === hash && existsSync(file)) continue;
  chars += it.text.length;
  if (dry) {
    console.log(`would generate ${it.id} (${it.text.length} chars)`);
    continue;
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: it.text, model_id: model, language_code: 'en', voice_settings: SETTINGS }),
  });
  if (!res.ok) {
    console.error(`${it.id}: HTTP ${res.status} ${await res.text()}`);
    console.error(`Stopped. ${made} clip(s) saved; re-run to resume.`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, file);
  manifest.files[it.id] = { hash, bytes: buf.length };
  save(); // progress survives an interruption
  made++;
  console.log(`${it.id}: ${Math.round(buf.length / 1024)} KB`);
}
if (!dry) save();
console.log(`${dry ? 'Would generate' : 'Generated'} ${dry ? '' : `${made} clips, `}${chars} characters.`);
