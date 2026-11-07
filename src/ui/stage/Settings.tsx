import { renderSettings, useSettings, type Quality } from '../../state/settings';
import { useApp } from '../../state/store';
import { startTour } from '../../audio/tour';

const QUALITY: { k: Quality; label: string; hint: string }[] = [
  { k: 'auto', label: 'Auto', hint: 'Chosen from this device' },
  { k: 'performance', label: 'Performance', hint: 'Smoother on modest hardware' },
  { k: 'high', label: 'High quality', hint: 'Sharpest shadows and terrain' },
];

/** Settings drawer: display quality and the optional Audio Guide. */
export function SettingsPanel() {
  const s = useSettings();
  const rs = renderSettings(s.quality);
  const close = useApp((st) => st.openDrawer);
  const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
  return (
    <div className="settings">
      <section className="settings__group">
        <h3 className="settings__h">Display quality</h3>
        <div className="seg seg--wide" role="radiogroup" aria-label="Display quality">
          {QUALITY.map((q) => (
            <button key={q.k} type="button" role="radio" aria-checked={s.quality === q.k} className={`seg__btn${s.quality === q.k ? ' is-active' : ''}`} title={q.hint} onClick={() => s.set({ quality: q.k })}>
              {q.label}
            </button>
          ))}
        </div>
        <p className="settings__note">
          {s.quality === 'auto' ? `${rs.reason}: ` : ''}
          pixel density up to {rs.dpr.toFixed(2).replace(/\.?0+$/, '')}×, shadows {rs.shadowMap} px, terrain {rs.terrainSegments} segments. Moon imagery is always
          full resolution.
        </p>
      </section>

      <section className="settings__group">
        <h3 className="settings__h">Audio Guide</h3>
        <label className="check">
          <input type="checkbox" checked={s.audioGuide} onChange={() => s.set({ audioGuide: !s.audioGuide })} />
          <span className="check__box" aria-hidden="true" />
          Show listen buttons beside explanations
        </label>
        <label className="check">
          <input type="checkbox" checked={s.transcript} onChange={() => s.set({ transcript: !s.transcript })} />
          <span className="check__box" aria-hidden="true" />
          Show transcripts
        </label>
        <div className="settings__row">
          <span className="settings__label" id="voice-l">
            Voice
          </span>
          <div className="seg" role="radiogroup" aria-labelledby="voice-l">
            {(['recorded', 'browser'] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={s.voice === v} className={`seg__btn${s.voice === v ? ' is-active' : ''}`} onClick={() => s.set({ voice: v })}>
                {v === 'recorded' ? 'Narrator' : 'Browser voice'}
              </button>
            ))}
          </div>
        </div>
        <div className="settings__row">
          <span className="settings__label" id="rate-l">
            Speed
          </span>
          <div className="seg" role="radiogroup" aria-labelledby="rate-l">
            {([1, 1.25, 1.5] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={s.rate === r} className={`seg__btn${s.rate === r ? ' is-active' : ''}`} onClick={() => s.set({ rate: r })}>
                {r}×
              </button>
            ))}
          </div>
        </div>
        <p className="settings__note">
          Narrator clips play when they have been generated for this build; otherwise the browser&rsquo;s own voice reads the same
          text{hasSpeech ? '' : ' (not available in this browser: transcripts only)'}. Nothing plays until you press a listen button.
        </p>
      </section>

      <section className="settings__group">
        <h3 className="settings__h">Guided exploration</h3>
        <p className="settings__note">A five-step narrated tour: the Moon, the south pole, a region, the surface, and the analysis. Pause or exit at any time.</p>
        <div className="settings__actions">
          <button
            type="button"
            className="cta"
            onClick={() => {
              close(null);
              startTour();
            }}
          >
            Start the tour
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              s.set({ welcomeSeen: false });
              const a = useApp.getState();
              a.openDrawer(null);
              if (a.mode !== 'orbital') a.setMode('orbital');
            }}
          >
            Replay welcome
          </button>
        </div>
      </section>
    </div>
  );
}
