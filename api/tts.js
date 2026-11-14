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
  `^Calculated for [A-Za-z0-9 .'-]{3,40}, [A-Z][a-z]{2,8} \\d{1,2}, \\d{4}, \\d{2}:\\d{2} UTC(?:\\+3)?\\. ${SAY('The Sun')} ${SAY('The Earth')} Earth visibility is a geometric line of sight, not a guaranteed communication link\\.$`,
);

// shortcut: the Arabic reading is checked by its fixed opening and closing sentences, alphabet and length, not word by word; write a full template if this endpoint is ever abused.
const AR_TEMPLATE = /^هَذِهِ قِرَاءَةٌ مَحْسُوبَةٌ لِمِنْطَقَةِ [\u0621-\u0652\d .،]{120,700} وَرُؤْيَةُ الْأَرْضِ خَطُّ نَظَرٍ هَنْدَسِيٌّ، وَلَيْسَتْ ضَمَانًا لِلِاتِّصَالِ\.$/;

/** Only LunaNav's own pages may request live readings (blocks hot-linking of the paid voice). */
const ALLOWED_HOST = /^(www\.)?afuq\.website$|^lunar-landing-site-navigator[a-z0-9-]*\.vercel\.app$|^localhost$|^127\.0\.0\.1$/;
function fromOwnSite(req) {
  for (const h of [req.headers.origin, req.headers.referer]) {
    if (!h) continue;
    try {
      return ALLOWED_HOST.test(new URL(h).hostname);
    } catch {
      return false;
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });
  if (!fromOwnSite(req)) return res.status(403).json({ error: 'origin' });
  const text = String(req.query.text ?? '');
  if (req.query.v !== VOICE_VERSION) return res.status(400).json({ error: 'version' });
  const arabic = AR_TEMPLATE.test(text);
  if (!arabic && (text.length > 420 || !TEMPLATE.test(text))) return res.status(400).json({ error: 'text' });
  if (!process.env.ELEVENLABS_API_KEY) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'tts-unconfigured' });
  }
  try {
    const client = new ElevenLabsClient();
    const stream = await client.textToSpeech.convert(VOICE.voiceId, {
      text,
      modelId: VOICE.modelId,
      languageCode: arabic ? 'ar' : VOICE.languageCode,
      outputFormat: VOICE.outputFormat,
      voiceSettings: VOICE.voiceSettings,
    });
    // Stream the audio as it is generated, so the first bytes arrive in about a second
    // instead of after the whole reading has been synthesised.
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    res.status(200);
    for await (const c of stream) res.write(Buffer.from(c));
    return res.end();
  } catch (e) {
    if (res.headersSent) return res.end(); // provider failed mid-stream: end what was sent
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'provider', status: e?.statusCode ?? null });
  }
}
