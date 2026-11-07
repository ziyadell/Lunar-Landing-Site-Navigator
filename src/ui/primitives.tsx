import type { ReactNode } from 'react';
import type { VisibilityState } from '../data/types';
import { STATE_LABEL } from '../science/visibility';

export function SectionHead({ children, aside, tone }: { children: ReactNode; aside?: ReactNode; tone?: 'sun' | 'earth' }) {
  return (
    <div className={`section-head${tone ? ` section-head--${tone}` : ''}`}>
      <h3 className="section-head__label">{children}</h3>
      {aside && <span className="section-head__aside">{aside}</span>}
    </div>
  );
}

export function Readout({ label, value, unit, hint, emphasis }: { label: string; value: ReactNode; unit?: string; hint?: string; emphasis?: boolean }) {
  return (
    <div className={`readout${emphasis ? ' readout--em' : ''}`} title={hint}>
      <dt className="readout__label">{label}</dt>
      <dd className="readout__value">
        <span className="num">{value}</span>
        {unit && <span className="readout__unit">{unit}</span>}
      </dd>
    </div>
  );
}

/** Visibility status: shape + text, never colour alone. */
export function StateTag({ state, body }: { state: VisibilityState; body: 'sun' | 'earth' }) {
  const ok = state === 'visible';
  return (
    <span className={`state-tag state-tag--${ok ? body : 'blocked'}`}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        {ok ? <circle cx="5" cy="5" r="4" fill="currentColor" /> : <path d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5" stroke="currentColor" strokeWidth="1.6" />}
      </svg>
      {STATE_LABEL[state]}
    </span>
  );
}

export function SunGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="glyph glyph--sun">
      <circle cx="6" cy="6" r="2.6" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="6" y1="0.8" x2="6" y2="2" stroke="currentColor" strokeWidth="1" transform={`rotate(${a} 6 6)`} />
      ))}
    </svg>
  );
}

export function EarthGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="glyph glyph--earth">
      <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6 1.4a4.6 4.6 0 0 1 0 9.2z" fill="currentColor" />
    </svg>
  );
}

export function IconButton({ label, onClick, children, pressed, disabled, className = '' }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      className={`icon-btn ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
