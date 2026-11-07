import type { EphemerisFile, LandingRegion, SitesFile } from './types';

/**
 * Runtime checks for data that arrives over the network (TypeScript types do not check
 * responses). Required scientific fields must be present and well formed, or the data is
 * rejected; optional geometry that is missing or malformed is removed, so only the
 * overlay that needs it disappears. Nothing is invented or substituted.
 */
export class DataIncompatible extends Error {}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const pair = (v: unknown) => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]);
const latLon = (v: unknown) => pair(v) && Math.abs((v as number[])[0]) <= 90 && Math.abs((v as number[])[1]) <= 360;

/** A NASA outline usable for drawing: ≥ 3 finite lat/lon corners, finite centre and size. */
export function validNasaRegion(n: unknown): boolean {
  return (
    obj(n) &&
    Array.isArray(n.corners) &&
    n.corners.length >= 3 &&
    n.corners.every(latLon) &&
    num(n.centreLatDeg) &&
    num(n.centreLonDeg) &&
    pair(n.sizeKm)
  );
}

function requiredRegion(r: Record<string, unknown>): string | null {
  if (!str(r.id) || !str(r.name)) return 'id/name';
  const p = r.observationPoint;
  if (!obj(p) || !num(p.latDeg) || !num(p.lonDeg) || !num(p.elevationM) || !num(p.observerHeightM)) return 'observationPoint';
  const h = r.horizon;
  if (!obj(h) || !num(h.azStepDeg) || h.azStepDeg <= 0 || !Array.isArray(h.elevationDeg) || h.elevationDeg.length < 36 || !h.elevationDeg.every(num))
    return 'horizon';
  const t = r.terrain;
  if (!obj(t) || !str(t.file) || !num(t.n) || !num(t.spacingM)) return 'terrain';
  const f = r.referenceFeature;
  if (!obj(f) || !str(f.name) || !num(f.latDeg) || !num(f.lonDeg)) return 'referenceFeature';
  return null;
}

export interface SitesCheck {
  sites: SitesFile;
  /** Human-readable notes about optional data that was dropped (console only). */
  dropped: string[];
}

export function validateSites(raw: unknown): SitesCheck {
  if (!obj(raw) || !Array.isArray(raw.regions) || raw.regions.length === 0) throw new DataIncompatible('sites.json has no regions');
  const dropped: string[] = [];
  const regions: LandingRegion[] = [];
  for (const r of raw.regions as unknown[]) {
    if (!obj(r)) throw new DataIncompatible('sites.json: malformed region record');
    const bad = requiredRegion(r);
    // Required scientific data missing: reject the dataset rather than show partial results.
    if (bad) throw new DataIncompatible(`sites.json: region ${String(r.id ?? '?')} is missing ${bad}`);
    const out = { ...r } as unknown as LandingRegion & Record<string, unknown>;
    if (!validNasaRegion(r.nasaRegion)) {
      if (r.nasaRegion !== undefined) dropped.push(`${r.id}: malformed NASA outline (overlay omitted)`);
      delete out.nasaRegion;
    }
    const th = r.thumb;
    if (th !== undefined && !(obj(th) && str(th.file) && pair(th.centerKm) && num(th.halfExtentKm))) {
      dropped.push(`${r.id}: malformed thumbnail metadata`);
      delete out.thumb;
    }
    const d = r.detail;
    if (d !== undefined && !(obj(d) && str(d.imagery) && str(d.normals) && pair(d.centerKm) && num(d.halfExtentKm))) {
      dropped.push(`${r.id}: malformed detail imagery metadata`);
      delete out.detail;
    }
    if (!Array.isArray(out.notes)) out.notes = [];
    regions.push(out);
  }
  // This release always ships NASA outlines; a file with none at all is the earlier
  // four-region dataset (or another release) — do not mix it with this bundle.
  if (!regions.some((r) => r.nasaRegion)) throw new DataIncompatible('sites.json is from an earlier release (no NASA region outlines)');
  const sites = { ...(raw as unknown as SitesFile), regions };
  const loc = (raw as Record<string, unknown>).locator;
  if (loc !== undefined && !(obj(loc) && str(loc.file) && pair(loc.xKm) && pair(loc.yKm))) {
    dropped.push('locator: malformed (locator map omitted)');
    delete (sites as Partial<SitesFile>).locator;
  }
  return { sites, dropped };
}

export function validateEphemeris(raw: unknown): EphemerisFile {
  if (!obj(raw)) throw new DataIncompatible('ephemeris.json is malformed');
  const keys = ['subEarthLonDeg', 'subEarthLatDeg', 'subSolarLonDeg', 'subSolarLatDeg', 'earthRangeKm'] as const;
  if (!str(raw.startUtc) || !num(raw.stepSeconds) || !num(raw.count) || raw.count < 2) throw new DataIncompatible('ephemeris.json header is malformed');
  for (const k of keys) {
    const a = raw[k];
    if (!Array.isArray(a) || a.length !== raw.count || !a.every(num)) throw new DataIncompatible(`ephemeris.json: ${k} is malformed`);
  }
  return raw as unknown as EphemerisFile;
}
