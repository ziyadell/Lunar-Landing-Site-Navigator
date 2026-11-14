/**
 * Live check against NASA/JPL Horizons: the Sun's and the Earth's azimuth and elevation for one
 * point on the Moon at one minute. Horizons sends no CORS headers, so the browser asks here.
 *
 * Only numbers in fixed ranges are forwarded (no free text reaches Horizons), and only LunaNav's
 * own pages may call it. Answers never change for a given point and time, so the CDN keeps them.
 */
const ALLOWED_HOST = /^(www\.)?afuq\.website$|^lunar-landing-site-navigator[a-z0-9-]*\.vercel\.app$|^localhost$|^127\.0\.0\.1$/;
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const MIN_MS = Date.UTC(2026, 6, 1);
const MAX_MS = Date.UTC(2029, 0, 1);

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

/** Azimuth and elevation (deg) from the first row of a QUANTITIES=4 observer table. */
export function parseAzEl(text) {
  const m = /\$\$SOE\s*\n([^\n]+)/.exec(text);
  if (!m) return null;
  const nums = m[1].match(/-?\d+\.\d+/g);
  if (!nums || nums.length < 2) return null;
  const [az, el] = nums.slice(-2).map(Number);
  return az >= 0 && az < 360 && el >= -90 && el <= 90 ? { azDeg: az, elDeg: el } : null;
}

const stamp = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

async function ask(body, lat, lon, altKm, ms) {
  const q = new URLSearchParams({
    format: 'text',
    COMMAND: `'${body}'`,
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${lon},${lat},${altKm}'`,
    START_TIME: `'${stamp(ms)}'`,
    STOP_TIME: `'${stamp(ms + 60_000)}'`,
    STEP_SIZE: "'1 m'",
    QUANTITIES: "'4'",
    APPARENT: "'AIRLESS'",
  });
  const r = await fetch(`${API}?${q}`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`horizons ${r.status}`);
  const out = parseAzEl(await r.text());
  if (!out) throw new Error('horizons format');
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });
  if (!fromOwnSite(req)) return res.status(403).json({ error: 'origin' });
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const altKm = Number(req.query.alt);
  const ms = Date.parse(String(req.query.t ?? ''));
  const ok =
    /^-?\d{1,2}(\.\d{1,4})?$/.test(String(req.query.lat)) &&
    /^-?\d{1,3}(\.\d{1,4})?$/.test(String(req.query.lon)) &&
    /^-?\d(\.\d{1,4})?$/.test(String(req.query.alt)) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(String(req.query.t)) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && ms >= MIN_MS && ms < MAX_MS;
  if (!ok) return res.status(400).json({ error: 'query' });
  try {
    const [sun, earth] = await Promise.all([ask('10', lat, lon, altKm, ms), ask('399', lat, lon, altKm, ms)]);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=2592000');
    return res.status(200).json({ source: 'NASA/JPL Horizons API', utc: stamp(ms), sun, earth });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'horizons' });
  }
}
