#!/usr/bin/env node
/**
 * Generate LunaNav's narrator clips (at development time, never from the browser).
 *
 *   node --env-file=.env.local scripts/generate-narration.mjs --only welcome
 *   node --env-file=.env.local scripts/generate-narration.mjs            (all changed clips)
 *
 * - Scripts: src/audio/narration.json (the same text the app shows as captions, so audio and
 *   captions cannot drift apart). Calculated live readings are never pre-recorded.
 * - Voice: voice-config.mjs (one voice, model and settings, shared with api/tts.js).
 * - Output: public/audio/narration/<id>.mp3 and manifest.json in the schema the player reads:
 *     { "files": { "<id>": { "hash", "bytes", "chars" } }, "voice": {...}, "version", "updatedUtc" }
 *   (the player only plays ids listed under "files").
 * - Repeatable: each clip's hash covers its text and the voice configuration; unchanged clips
 *   are skipped. Progress is saved after every clip (atomic writes), so an interrupted run
 *   resumes. Failed clips are listed at the end and the exit code is non-zero.
 * - Budget: checks the account's remaining characters first and stops before going over.
 * - The key comes from ELEVENLABS_API_KEY only (never written, logged or bundled).
 *
 * Options: --only id1,id2   --force   --dry-run
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { VOICE, VOICE_VERSION } from '../voice-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
// --lang=ar records the Arabic script (narration.ar.json) with the same voice into narration/ar.
const lang = args.find((a) => a.startsWith('--lang='))?.slice(7) ?? 'en';
const out = lang === 'en' ? join(root, 'public', 'audio', 'narration') : join(root, 'public', 'audio', 'narration', lang);
const flag = (f) => args.includes(f);
const onlyArg = args.find((a) => a.startsWith('--only='))?.slice(7) ?? (flag('--only') ? args[args.indexOf('--only') + 1] : '');
const only = (onlyArg ?? '').split(',').filter(Boolean);
const force = flag('--force');
const dry = flag('--dry-run');

const { items } = JSON.parse(readFileSync(join(root, 'src', 'audio', lang === 'en' ? 'narration.json' : `narration.${lang}.json`), 'utf8'));
// Arabic is spoken from a fully vowelled copy (scripts/narration.ar.say.json), so every word is
// pronounced as written; the captions keep the plain text.
const sayPath = join(root, 'scripts', `narration.${lang}.say.json`);
const say = existsSync(sayPath) ? JSON.parse(readFileSync(sayPath, 'utf8')) : {};
for (const it of items) if (say[it.id]) it.say = say[it.id];
const missing = lang === 'en' ? [] : items.filter((it) => !it.calculated && !it.say).map((it) => it.id);
if (missing.length) console.warn(`No vowelled text for: ${missing.join(', ')}`);
const recordable = items.filter((it) => !it.calculated);
const unknown = only.filter((id) => !recordable.some((it) => it.id === id));
if (unknown.length) {
  console.error(`Unknown clip id(s): ${unknown.join(', ')}`);
  process.exit(2);
}

const hashOf = (it) => createHash('sha256').update(JSON.stringify(lang === 'en' ? [VOICE_VERSION, VOICE, it.text] : [VOICE_VERSION, VOICE, it.say ?? it.text, lang])).digest('hex').slice(0, 16);

mkdirSync(out, { recursive: true });
const manPath = join(out, 'manifest.json');
const manifest = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : { files: {} };
manifest.files ??= {};
const save = () => {
  manifest.voice = { voiceId: VOICE.voiceId, voiceName: VOICE.voiceName, modelId: VOICE.modelId, outputFormat: VOICE.outputFormat, voiceSettings: VOICE.voiceSettings };
  manifest.version = VOICE_VERSION;
  manifest.updatedUtc = new Date().toISOString();
  const tmp = `${manPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 1));
  renameSync(tmp, manPath);
};

// Clips that need (re)recording.
const todo = recordable.filter((it) => {
  if (only.length && !only.includes(it.id)) return false;
  const file = join(out, `${it.id}.mp3`);
  return force || manifest.files[it.id]?.hash !== hashOf(it) || !existsSync(file);
});
const chars = todo.reduce((n, it) => n + (it.say ?? it.text).length, 0);
console.log(`Voice: ${VOICE.voiceName} (${VOICE.voiceId}), model ${VOICE.modelId}, ${VOICE.outputFormat}, config ${VOICE_VERSION}`);
console.log(`${todo.length} clip(s) to record, ${chars} characters; ${recordable.length - todo.length} up to date or not selected.`);
if (dry) {
  for (const it of todo) console.log(`  would record ${it.id} (${it.text.length} chars)`);
  process.exit(0);
}
if (!todo.length) process.exit(0);
if (!process.env.ELEVENLABS_API_KEY) {
  console.error('ELEVENLABS_API_KEY is not set. Run with: node --env-file=.env.local scripts/generate-narration.mjs');
  process.exit(1);
}

const client = new ElevenLabsClient();
// Stop before going over the account's character allowance.
try {
  const sub = await client.user.subscription.get();
  const left = sub.characterLimit - sub.characterCount;
  console.log(`Account: ${sub.tier} plan, ${left} characters left this period.`);
  if (chars > left) {
    console.error(`Not enough characters: ${chars} needed, ${left} left. Nothing was recorded.`);
    process.exit(3);
  }
} catch (e) {
  console.warn(`Could not read the character allowance (${e?.statusCode ?? e?.message ?? e}); continuing.`);
}

const failed = [];
let made = 0;
for (const it of todo) {
  const file = join(out, `${it.id}.mp3`);
  try {
    const stream = await client.textToSpeech.convert(VOICE.voiceId, {
      text: it.say ?? it.text,
      modelId: VOICE.modelId,
      languageCode: lang === 'en' ? VOICE.languageCode : lang,
      outputFormat: VOICE.outputFormat,
      voiceSettings: VOICE.voiceSettings,
    });
    const chunks = [];
    for await (const c of Readable.fromWeb(stream)) chunks.push(Buffer.from(c));
    const buf = Buffer.concat(chunks);
    // A real MP3 starts with an ID3 tag or an MPEG frame sync; anything else is an error body.
    const isMp3 = buf.length > 1000 && (buf.subarray(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
    if (!isMp3) throw new Error(`response is not MP3 audio (${buf.length} bytes)`);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, buf);
    renameSync(tmp, file);
    manifest.files[it.id] = { hash: hashOf(it), bytes: buf.length, chars: it.text.length };
    save();
    made++;
    console.log(`  recorded ${it.id}.mp3 (${Math.round(buf.length / 1024)} KB)`);
  } catch (e) {
    const why = e?.statusCode ? `HTTP ${e.statusCode} ${JSON.stringify(e.body ?? '')}` : String(e?.message ?? e);
    failed.push({ id: it.id, why });
    console.error(`  FAILED ${it.id}: ${why}`);
  }
}
save();
console.log(`Recorded ${made} clip(s).`);
if (failed.length) {
  console.error(`${failed.length} clip(s) failed:`);
  for (const f of failed) console.error(`  - ${f.id}: ${f.why}`);
  process.exit(1);
}
