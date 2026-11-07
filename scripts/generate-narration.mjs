#!/usr/bin/env node
/**
 * Generate the narrator clips once, at development time (never from the browser).
 *
 *   ELEVENLABS_API_KEY=...  ELEVENLABS_VOICE_ID=...  node scripts/generate-narration.mjs
 *
 * - Reads every item in src/audio/narration.json (one narrator for all clips).
 * - Calls the ElevenLabs text-to-speech API with the key from the environment only
 *   (it is never written to disk or bundled).
 * - Writes public/audio/narration/<id>.mp3 (mono, 64 kbps) and manifest.json.
 * - Skips clips whose text and voice are unchanged (hash in the manifest), so re-running
 *   costs nothing unless a script changed.
 *
 * Options: --only welcome,orbit-intro   --force   --dry-run
 * Voice licensing: use a voice you are licensed to use commercially (an ElevenLabs
 * library or custom voice under your plan's terms). Do not clone a real person's voice
 * without consent, and do not imitate a NASA announcer. See docs/NARRATION.md.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'audio', 'narration');
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only=')) ?? (args.includes('--only') ? args[args.indexOf('--only') + 1] : '');
const only = (onlyArg ?? '').replace('--only=', '').split(',').filter(Boolean);
const force = args.includes('--force');
const dry = args.includes('--dry-run');

const key = process.env.ELEVENLABS_API_KEY;
const voice = process.env.ELEVENLABS_VOICE_ID;
const model = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';
if (!dry && (!key || !voice)) {
  console.error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in the environment (not in code). Use --dry-run to preview.');
  process.exit(1);
}

const { items } = JSON.parse(readFileSync(join(root, 'src', 'audio', 'narration.json'), 'utf8'));
mkdirSync(out, { recursive: true });
const manPath = join(out, 'manifest.json');
const manifest = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : { files: {} };

let made = 0;
let chars = 0;
for (const it of items) {
  if (only.length && !only.includes(it.id)) continue;
  const hash = createHash('sha256').update(`${voice}|${model}|${it.text}`).digest('hex').slice(0, 16);
  const file = join(out, `${it.id}.mp3`);
  if (!force && manifest.files[it.id]?.hash === hash && existsSync(file)) continue;
  chars += it.text.length;
  if (dry) {
    console.log(`would generate ${it.id} (${it.text.length} chars)`);
    continue;
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_22050_32`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: it.text,
      model_id: model,
      // Calm, natural delivery: steady, close to the source voice, little stylisation.
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.12, use_speaker_boost: true },
    }),
  });
  if (!res.ok) {
    console.error(`${it.id}: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  manifest.files[it.id] = { hash, bytes: buf.length };
  made++;
  console.log(`${it.id}: ${Math.round(buf.length / 1024)} KB`);
}
if (!dry) {
  manifest.voice = voice;
  manifest.model = model;
  manifest.generatedUtc = new Date().toISOString();
  writeFileSync(manPath, JSON.stringify(manifest, null, 1));
}
console.log(`${dry ? 'Would generate' : 'Generated'} ${dry ? '' : made + ' clips, '}${chars} characters.`);
