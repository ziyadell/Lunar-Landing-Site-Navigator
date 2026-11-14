const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/**
 * Times are shown in UTC+3 (Arabia Standard Time, no daylight saving). All calculations,
 * the ephemeris, shared links and CSV exports stay in UTC; only what is displayed is shifted.
 */
export const TZ_OFFSET_MS = 3 * 3_600_000;
export const TZ_LABEL = 'UTC+3';
/** A Date whose getUTC* fields read as UTC+3 wall-clock time. */
export const zoned = (ms: number) => new Date(ms + TZ_OFFSET_MS);

/** "2027-03-06 12:22 UTC+3" */
export function fmtUtc(ms: number): string {
  return `${fmtDate(ms)} ${fmtTime(ms)} ${TZ_LABEL}`;
}

export function fmtDate(ms: number): string {
  const d = zoned(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function fmtTime(ms: number): string {
  const d = zoned(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function fmtLat(lat: number, digits = 3): string {
  return `${Math.abs(lat).toFixed(digits)}°${lat < 0 ? 'S' : 'N'}`;
}

export function fmtLon(lon: number, digits = 3): string {
  return `${Math.abs(lon).toFixed(digits)}°${lon < 0 ? 'W' : 'E'}`;
}

export function fmtDeg(v: number, digits = 2, signed = true): string {
  const s = v.toFixed(digits);
  return signed && v >= 0 ? `+${s}°` : `${s}°`;
}

export function fmtHours(h: number): string {
  if (h >= 48) return `${(h / 24).toFixed(1)} d`;
  return `${h.toFixed(1)} h`;
}

export function compass(az: number): string {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round(az / 22.5) % 16];
}

/** Parse YYYY-MM-DD + HH:MM, read as UTC+3 wall-clock time, to a UTC instant. */
export function parseUtc(date: string, time: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]) - TZ_OFFSET_MS;
}
