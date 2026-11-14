import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useApp } from '../../state/store';
import { useSettings } from '../../state/settings';
import { computeSeries, scenarioMetrics } from '../../science/visibility';
import type { ScenarioMetrics } from '../../data/types';
import { t } from '../../i18n';

const START = Date.UTC(2027, 0, 1);
const END = Date.UTC(2028, 0, 1);
const STEP_MIN = 60;

type Key = 'sun' | 'earth' | 'dark';
const TABS: { key: Key; label: string; note: string; get: (m: ScenarioMetrics) => number; pct: boolean }[] = [
  { key: 'sun', label: 'Sun', note: 'Share of 2027 with the Sun above the terrain horizon', get: (m) => m.sunVisiblePct, pct: true },
  { key: 'earth', label: 'Earth', note: 'Share of 2027 with Earth above the terrain horizon', get: (m) => m.earthVisiblePct, pct: true },
  { key: 'dark', label: 'Darkness', note: 'Longest stretch without Sun in 2027 · shorter ranks first', get: (m) => m.longestNoSunHours, pct: false },
];

/**
 * The answer first: all candidate sites ranked over 2027 (hourly samples, same
 * visibility rule as Analysis). Computed once after first paint; a row selects the site.
 */
export function SiteRanking() {
  const { sites, ephemeris } = useData();
  const regionId = useApp((s) => s.regionId);
  const selectRegion = useApp((s) => s.selectRegion);
  const folded = useSettings((s) => s.rankFolded);
  const setS = useSettings((s) => s.set);
  const [tab, setTab] = useState<Key>('sun');
  const [rows, setRows] = useState<{ id: string; name: string; m: ScenarioMetrics }[] | null>(null);
  useEffect(() => {
    // After first paint, so the 79k samples never delay the scene appearing.
    const id = window.setTimeout(() => {
      const out = [];
      for (const r of sites.regions) {
        const m = scenarioMetrics(computeSeries(r, ephemeris, START, END - STEP_MIN * 60_000, STEP_MIN), STEP_MIN);
        if (m) out.push({ id: r.id, name: r.name, m });
      }
      setRows(out);
    }, 50);
    return () => window.clearTimeout(id);
  }, [sites, ephemeris]);

  const cur = TABS.find((x) => x.key === tab)!;
  const sorted = rows ? [...rows].sort((a, b) => (cur.pct ? cur.get(b.m) - cur.get(a.m) : cur.get(a.m) - cur.get(b.m))) : [];
  const max = cur.pct ? 100 : Math.max(1, ...sorted.map((r) => cur.get(r.m)));
  const fmt = (v: number) => (cur.pct ? `${v.toFixed(1)}%` : `${(v / 24).toFixed(1)} ${t('d')}`);
  return (
    <section className={`rank rank--${tab}${folded ? ' is-folded' : ''}`} aria-label={t('Site ranking')} data-obstacle>
      <header className="rank__head">
        <button type="button" className="rank__title" aria-expanded={!folded} onClick={() => setS({ rankFolded: !folded })}>
          {t('Site ranking')} <span className="rank__period">2027</span>
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d={folded ? 'M2.5 4.5 6 8l3.5-3.5' : 'M2.5 7.5 6 4l3.5 3.5'} stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
        </button>
        {!folded && (
          <div className="rank__tabs" role="tablist">
            {TABS.map((x) => (
              <button key={x.key} type="button" role="tab" aria-selected={x.key === tab} className={`rank__tab${x.key === tab ? ' is-on' : ''}`} onClick={() => setTab(x.key)}>
                {t(x.label)}
              </button>
            ))}
          </div>
        )}
      </header>
      {!folded && (
        <>
          {rows ? (
            <ol className="rank__list">
              {sorted.map((r, i) => (
                <li key={r.id}>
                  <button type="button" className={`rank__row${r.id === regionId ? ' is-selected' : ''}`} aria-pressed={r.id === regionId} onClick={() => selectRegion(r.id)}>
                    <span className="rank__n num">{i + 1}</span>
                    <span className="rank__name">{r.name}</span>
                    <span className="rank__bar" aria-hidden="true"><i style={{ width: `${(100 * cur.get(r.m)) / max}%` }} /></span>
                    <span className="rank__val num">{fmt(cur.get(r.m))}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rank__wait" role="status"><i className="loadchip__ring" aria-hidden="true" /> {t('Calculating a year of Sun and Earth positions…')}</p>
          )}
          <p className="rank__note">{t(cur.note)}</p>
        </>
      )}
    </section>
  );
}
