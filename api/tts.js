/**
 * Server-side narrator voice for live calculated readings ("Conditions now").
 *
 * - Same narrator as the recorded clips: fixed voice ID, model and settings (keep in sync
 *   with scripts/generate-narration.mjs). The provider key is read from the server
 *   environment (ELEVENLABS_API_KEY) and never reaches the browser.
 * - Only the app's own reading template is spoken (validated below), so the endpoint cannot
 *   be used to synthesise arbitrary text.
 * - Responses are cached by the CDN per URL, i.e. per text + voice-configuration version (v).
 * - Without a key it answers 503; the app then shows the reading as captions (no device voice).
 */
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // same default as the clips
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.62, similarity_boost: 0.8, style: 0.05, use_speaker_boost: true, speed: 0.95 };
const CONFIG_VERSION = '1';

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
  if (req.query.v !== CONFIG_VERSION) return res.status(400).json({ error: 'version' });
  if (text.length > 420 || !TEMPLATE.test(text)) return res.status(400).json({ error: 'text' });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'tts-unconfigured' });
  }
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
    });
    if (!r.ok) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'provider', status: r.status });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    return res.status(200).send(buf);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'provider' });
  }
}
