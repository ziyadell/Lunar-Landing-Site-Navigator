/**
 * Server-side narrator voice for live calculated readings ("Conditions now").
 *
 * - Same narrator as the recorded clips: voice-config.mjs (one voice ID, model and
 *   settings). The provider key is read from the server environment (ELEVENLABS_API_KEY)
 *   and never reaches the browser.
 * - Only the app's own reading template is spoken (validated below), so the endpoint cannot
 *   be used to synthesise arbitrary text.
 * - Responses are cached by the CDN per URL, i.e. per text + voice-configuration version (v).
 * - Without a key it answers 503; the app then shows the reading as captions (no device voice).
 */
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { VOICE, VOICE_VERSION } from '../voice-config.mjs';

const NUM = '\\d{1,3}(?:\\.\\d)?';
const EL = `${NUM} degrees (?:above|below) the horizontal`;
const SAY = (who) =>
  `${who} is (?:visible, ${EL}, clearing the skyline by ${NUM} degrees\\.|not visible: it is ${EL}\\.|hidden by terrain: it is ${EL}, ${NUM} degrees below the skyline\\.)`;
const TEMPLATE = new RegExp(
  `^Calculated for [A-Za-z0-9 .'-]{3,40}, [A-Z][a-z]{2,8} \\d{1,2}, \\d{4}, \\d{2}:\\d{2} UTC\\. ${SAY('The Sun')} ${SAY('The Earth')} Earth visibility is a geometric line of sight, not a guaranteed communication link\\.$`,
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });
  const text = String(req.query.text ?? '');
  if (req.query.v !== VOICE_VERSION) return res.status(400).json({ error: 'version' });
  if (text.length > 420 || !TEMPLATE.test(text)) return res.status(400).json({ error: 'text' });
  if (!process.env.ELEVENLABS_API_KEY) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'tts-unconfigured' });
  }
  try {
    const client = new ElevenLabsClient();
    const stream = await client.textToSpeech.convert(VOICE.voiceId, {
      text,
      modelId: VOICE.modelId,
      languageCode: VOICE.languageCode,
      outputFormat: VOICE.outputFormat,
      voiceSettings: VOICE.voiceSettings,
    });
    const chunks = [];
    for await (const c of stream) chunks.push(Buffer.from(c));
    const buf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    return res.status(200).send(buf);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'provider', status: e?.statusCode ?? null });
  }
}
