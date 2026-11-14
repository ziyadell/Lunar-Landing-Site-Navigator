import { t } from '../../i18n';
import { useConditions, useNextCrossings } from '../../data/useConditions';
import { useApp } from '../../state/store';
import { useData } from '../../data/DataContext';
import { compass, fmtDate, fmtDeg, fmtLat, fmtLon, fmtUtc, TZ_LABEL, zoned } from '../../utils/format';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
import { EarthGlyph, Readout, SunGlyph } from '../primitives';
import { HorizonsCheck } from './HorizonsCheck';
import type { TopocentricBody } from '../../data/types';
import { CROSSING_WINDOW_DAYS, STATE_LABEL, type Crossing } from '../../science/visibility';
import { Listen } from '../../audio/ui';
import { useSettings } from '../../state/settings';
import type { NarrationItem } from '../../audio/engine';

/**
 * The essential answer, always on screen: can you see the Sun and Earth from
 * the observation point right now, and by how much do they clear the measured
 * skyline? Everything else is one tap away in the Details drawer.
 */

function plain(b: TopocentricBody) {
  const s = b.state === 'visible' ? 'Clears the terrain horizon' : b.state === 'below-horizontal' ? 'Below the local horizontal' : 'Hidden by terrain';
  return (
    <>
      <span>{t(s)}</span>
      <span>
        {t('elevation')} <bdi dir="ltr" className="num">{fmtDeg(b.elDeg, 2)}</bdi>
      </span>
    </>
  );
}

/** "3 d 4 h", "9 h 20 min", "42 min": time remaining, coarser the further away it is. */
export function fmtRemaining(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'under 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const hr = Math.round(min / 60);
  return hr % 24 ? `${Math.floor(hr / 24)} d ${hr % 24} h` : `${hr / 24} d`;
}

/** Sunset, Sunrise, Earthset or Earthrise: the next skyline crossing of that body. */
function eventName(which: 'sun' | 'earth', c: Crossing) {
  return `${which === 'sun' ? 'Sun' : 'Earth'}${c.kind}`;
}

function remaining(which: 'sun' | 'earth', c: Crossing, timeMs: number) {
  const name = eventName(which, c);
  if (c.timeMs !== null) return { label: `${name} in`, value: fmtRemaining(c.timeMs - timeMs), title: `${name} at ${fmtUtc(c.timeMs)}, when the centre of the disc crosses the measured skyline` };
  if (c.none === 'coverage') return { label: `No ${name.toLowerCase()}`, value: 'before the data ends', title: 'The ephemeris ends before the next crossing' };
  return { label: `No ${name.toLowerCase()} for`, value: `${CROSSING_WINDOW_DAYS}+ d`, title: `No crossing in the next ${CROSSING_WINDOW_DAYS} days` };
}

function Body({ which, b, next, timeMs }: { which: 'sun' | 'earth'; b: TopocentricBody; next: Crossing | null; timeMs: number }) {
  const r = next ? remaining(which, next, timeMs) : null;
  const up = b.state === 'visible';
  return (
    <div className={`cond__body cond__body--${which}${up ? ' is-up' : ' is-down'}`}>
      <div className="cond__name">
        {which === 'sun' ? <SunGlyph size={13} /> : <EarthGlyph size={13} />}
        {t(which === 'sun' ? 'Sun' : 'Earth')}
        <span className="cond__state">{t(up ? 'Visible' : 'Not visible')}</span>
      </div>
      <div className="cond__value num">
        {Math.abs(b.marginDeg).toFixed(1)}°<span className="cond__unit">{t(b.marginDeg > 0 ? 'above horizon' : 'below horizon')}</span>
      </div>
      <div className="cond__plain">{plain(b)}</div>
      {r && (
        <div className="cond__next" title={r.title}>
          <span className="cond__next-label">{r.label}</span> <span className="cond__next-value num">{r.value}</span>
        </div>
      )}
    </div>
  );
}

/** Spoken summary of the current readings (calculated from app state, never invented). */
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function nowItem(regionName: string, timeMs: number, c: NonNullable<ReturnType<typeof useConditions>['conditions']>): NarrationItem {
  if (useSettings.getState().lang === 'ar') {
    // Arabic reading (captions): same calculated values, Arabic wording.
    const d = new Date(timeMs + 3 * 3_600_000);
    const when = `${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}، الساعة ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} بتوقيت UTC+3`;
    const say = (name: string, b: TopocentricBody) => {
      const el = `${Math.abs(b.elDeg).toFixed(1)} درجة ${b.elDeg >= 0 ? 'فوق' : 'تحت'} المستوى الأفقي`;
      if (b.state === 'visible') return `${name} مرئية، على ${el}، وتعلو أفق التضاريس بمقدار ${b.marginDeg.toFixed(1)} درجة.`;
      if (b.state === 'below-horizontal') return `${name} غير مرئية: فهي على ${el}.`;
      return `${name} محجوبة بالتضاريس: فهي على ${el}، وتحت أفق التضاريس بمقدار ${Math.abs(b.marginDeg).toFixed(1)} درجة.`;
    };
    const sayV = (name: string, b: TopocentricBody) => {
      const el = `${Math.abs(b.elDeg).toFixed(1)} دَرَجَةٍ ${b.elDeg >= 0 ? 'فَوْقَ' : 'تَحْتَ'} الْمُسْتَوَى الْأُفُقِيِّ`;
      if (b.state === 'visible') return `${name} مَرْئِيَّةٌ، عَلَى ${el}، وَتَعْلُو أُفُقَ التَّضَارِيسِ بِمِقْدَارِ ${b.marginDeg.toFixed(1)} دَرَجَةٍ.`;
      if (b.state === 'below-horizontal') return `${name} غَيْرُ مَرْئِيَّةٍ، فَهِيَ عَلَى ${el}.`;
      return `${name} مَحْجُوبَةٌ بِالتَّضَارِيسِ، فَهِيَ عَلَى ${el}، وَتَحْتَ أُفُقِ التَّضَارِيسِ بِمِقْدَارِ ${Math.abs(b.marginDeg).toFixed(1)} دَرَجَةٍ.`;
    };
    return {
      id: `now-ar-${timeMs}`,
      title: 'الأحوال الآن',
      calculated: true,
      text: `محسوب لمنطقة ${t(regionName)}، ${when}. ${say('الشمس', c.sun)} ${say('الأرض', c.earth)} ورؤية الأرض خط نظر هندسي، وليست ضمانًا للاتصال.`,
      say: `هَذِهِ قِرَاءَةٌ مَحْسُوبَةٌ لِلْمَوْقِعِ وَالْوَقْتِ الْمُخْتَارَيْنِ. ${sayV('الشَّمْسُ', c.sun)} ${sayV('الْأَرْضُ', c.earth)} وَرُؤْيَةُ الْأَرْضِ خَطُّ نَظَرٍ هَنْدَسِيٌّ، وَلَيْسَتْ ضَمَانًا لِلِاتِّصَالِ.`,
    };
  }
  const d = zoned(timeMs);
  const when = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC+3`;
  const say = (name: string, b: TopocentricBody) => {
    const el = `${Math.abs(b.elDeg).toFixed(1)} degrees ${b.elDeg >= 0 ? 'above' : 'below'} the horizontal`;
    if (b.state === 'visible') return `${name} is visible, ${el}, clearing the skyline by ${b.marginDeg.toFixed(1)} degrees.`;
    if (b.state === 'below-horizontal') return `${name} is not visible: it is ${el}.`;
    return `${name} is hidden by terrain: it is ${el}, ${Math.abs(b.marginDeg).toFixed(1)} degrees below the skyline.`;
  };
  return {
    id: `now-${timeMs}`,
    title: 'Conditions now',
    calculated: true,
    text: `Calculated for ${regionName}, ${when}. ${say('The Sun', c.sun)} ${say('The Earth', c.earth)} Earth visibility is a geometric line of sight, not a guaranteed communication link.`,
  };
}

/** Surface view in darkness: say why it is dark and what to do about it. */
export function SunDownNote() {
  const { conditions } = useConditions();
  if (!conditions || conditions.sun.state === 'visible') return null;
  return (
    <div className="loadchip sundown" role="status">
      <SunGlyph size={12} />
      <span>{t(conditions.sun.state === 'below-horizontal' ? 'Sun is below the horizon — advance time.' : 'Sun is hidden behind terrain — advance time.')}</span>
    </div>
  );
}

export function ConditionsCard() {
  const { conditions, region } = useConditions();
  const timeMs = useApp((s) => s.timeMs);
  const { ephemeris } = useData();
  const drawer = useApp((s) => s.drawer);
  const openDrawer = useApp((s) => s.openDrawer);
  const folded = useSettings((s) => s.readingsFolded);
  const setS = useSettings((s) => s.set);
  const next = useNextCrossings();
  if (folded)
    return (
      <section className="cond cond--folded" aria-label={t('Conditions at the observation point')} data-obstacle>
        {conditions ? (
          <div className="cond__mini">
            {(['sun', 'earth'] as const).map((w) => {
              const b = conditions[w];
              const up = b.state === 'visible';
              return (
                <span key={w} className={`cond__mini-body cond__mini-body--${w}${up ? ' is-up' : ''}`}>
                  {w === 'sun' ? <SunGlyph size={12} /> : <EarthGlyph size={12} />}
                  <span className="num">{fmtDeg(b.marginDeg, 1)}</span>
                  <span className="cond__mini-state">{t(up ? 'Visible' : 'Hidden')}</span>
                </span>
              );
            })}
          </div>
        ) : (
          <span className="cond__mini">{t('No ephemeris for this time')}</span>
        )}
        <button type="button" className="cond__fold" aria-expanded={false} aria-label={t('Show Sun and Earth readings')} title={t('Show readings')} onClick={() => setS({ readingsFolded: false })}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
        </button>
      </section>
    );
  return (
    <section className="cond" aria-label={t('Conditions at the observation point')} aria-live="polite" data-obstacle>
      {conditions ? (
        <div className="cond__pair">
          <Body which="sun" b={conditions.sun} next={next.sun} timeMs={timeMs} />
          <Body which="earth" b={conditions.earth} next={next.earth} timeMs={timeMs} />
        </div>
      ) : (
        <p className="cond__none">
          No ephemeris for this time. Coverage {fmtDate(ephemeris.startMs)} – {fmtDate(ephemeris.endMs)} ({TZ_LABEL}).
        </p>
      )}
      <div className="cond__foot">
        <button type="button" className="cond__more" aria-expanded={drawer === 'details'} onClick={() => openDrawer('details')}>
          {t(drawer === 'details' ? 'Hide measurements' : 'All measurements')}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2 6.5 5l-3 3" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        {conditions && <Listen item={nowItem(region.name, timeMs, conditions)} />}
        <button type="button" className="cond__fold" aria-expanded={true} aria-label={t('Hide Sun and Earth readings')} title={t('Hide readings')} onClick={() => setS({ readingsFolded: true })}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
        </button>
      </div>
    </section>
  );
}

function BodyTable({ which, b, range, next, timeMs }: { which: 'sun' | 'earth'; b: TopocentricBody; range?: number; next: Crossing | null; timeMs: number }) {
  const r = next ? remaining(which, next, timeMs) : null;
  return (
    <section className={`mtable mtable--${which}`}>
      <h3 className="mtable__head">
        {which === 'sun' ? <SunGlyph size={13} /> : <EarthGlyph size={13} />}
        {which === 'sun' ? 'Sun' : 'Earth'}
        <span className="mtable__state">{t(STATE_LABEL[b.state])}</span>
      </h3>
      <dl className="readouts">
        <Readout label="Elevation" value={fmtDeg(b.elDeg)} hint="Above the local horizontal plane" />
        <Readout label="Azimuth" value={`${b.azDeg.toFixed(2)}°`} unit={compass(b.azDeg)} hint="Clockwise from local north" />
        <Readout label="Terrain skyline" value={fmtDeg(b.horizonDeg)} hint="LOLA skyline elevation at this azimuth" />
        <Readout label="Clearance" value={fmtDeg(b.marginDeg)} hint="Elevation minus skyline" />
        <Readout label="Disc above skyline" value={(b.discFraction * 100).toFixed(0)} unit="%" hint="Flat-skyline approximation" />
        {range !== undefined && <Readout label="Range" value={Math.round(range).toLocaleString('en-US')} unit="km" />}
        {next && r && (
          <Readout
            label={next.timeMs !== null ? `Time to ${eventName(which, next).toLowerCase()}` : `Next ${eventName(which, next).toLowerCase()}`}
            value={next.timeMs !== null ? r.value : next.none === 'coverage' ? 'After the data ends' : `More than ${CROSSING_WINDOW_DAYS} d away`}
            hint={r.title}
            emphasis
          />
        )}
        {next && next.timeMs !== null && <Readout label={`${eventName(which, next)} at`} value={fmtUtc(next.timeMs)} hint="Centre of the disc crosses the measured skyline; found in 10-minute steps, refined to about a minute" />}
      </dl>
    </section>
  );
}

/** Drawer: the full measurement set and how the point was chosen. */
export function DetailsDrawer() {
  const { region, conditions, sample, timeMs } = useConditions();
  const next = useNextCrossings();
  const p = region.observationPoint;
  const f = region.referenceFeature;
  return (
    <div className="details">
      <p className="drawer__lede">
        Topocentric positions at the observation point, {p.observerHeightM.toFixed(0)} m above the surface, against the skyline ray-traced
        through LOLA terrain to 150 km.
      </p>
      {conditions && sample && (
        <div className="details__bodies">
          <BodyTable which="sun" b={conditions.sun} next={next.sun} timeMs={timeMs} />
          <BodyTable which="earth" b={conditions.earth} range={sample.earth.distanceKm} next={next.earth} timeMs={timeMs} />
        </div>
      )}
      {conditions && <HorizonsCheck p={p} timeMs={timeMs} sun={conditions.sun} earth={conditions.earth} />}
      <p className="details__terms">
        <span>{t('Listen:')}</span>
        <Listen id="term-elevation" /> Elevation <Listen id="term-azimuth" /> Azimuth <Listen id="term-skyline" /> Skyline{' '}
        <Listen id="term-clearance" /> Clearance <Listen id="term-coordinates" /> Coordinates
      </p>
      <section className="mtable">
        <h3 className="mtable__head">{t('Observation point')}</h3>
        <dl className="readouts">
          <Readout label={t('Position')} value={`${fmtLat(p.latDeg)} ${fmtLon(p.lonDeg)}`} />
          <Readout label={t('Elevation')} value={p.elevationM.toFixed(0)} unit="m" hint="Relative to the 1737.4 km reference sphere (LOLA)" />
          {p.sunVisibleFraction2027 !== undefined && <Readout label={t('Sun in 2027')} value={(p.sunVisibleFraction2027 * 100).toFixed(1)} unit="% of hours" />}
        </dl>
        <p className="details__ref">
          {region.nasaRegion && (
            <>
              NASA region outline about {region.nasaRegion.sizeKm[0].toFixed(0)} × {region.nasaRegion.sizeKm[1].toFixed(0)} km, centred{' '}
              {fmtLat(region.nasaRegion.centreLatDeg, 2)} {fmtLon(region.nasaRegion.centreLonDeg, 2)}.{' '}
            </>
          )}
          Named after{' '}
          {f.url ? (
            <a href={f.url} target="_blank" rel="noreferrer">
              {f.name}
            </a>
          ) : (
            f.name
          )}{' '}
          ({f.type.toLowerCase()}).
        </p>
      </section>
      <details className="disclose">
        <summary>{t('How this point was chosen')}</summary>
        <p className="disclose__text">
          NASA has published its candidate regions only as outlines on a map. The outline here was digitised from that map by
          registering it to the LROC mosaic (about 0.5 km accuracy). Readings use one representative point inside it, not a
          NASA-designated landing site.
        </p>
        <p className="disclose__text disclose__text--strong">{p.selectionRule}</p>
      </details>
    </div>
  );
}
