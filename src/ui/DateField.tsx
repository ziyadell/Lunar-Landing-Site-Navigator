import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Date field in the app's own style (replaces the browser's date picker, which ignores the
 * theme). All dates are UTC days written YYYY-MM-DD:
 *  - type a date directly (applied on Enter or when leaving the field; invalid or
 *    out-of-range text is reverted, with the reason announced);
 *  - or open the calendar: arrow keys move by day/week, Page Up/Down by month, Home/End to
 *    the week's ends, Enter chooses, Escape closes; outside clicks dismiss; focus returns to
 *    the calendar button. Days outside [min, max] are disabled.
 */
const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const toStr = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const parse = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const v = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return toStr(v) === s.trim() ? v : null; // rejects 2027-02-31 etc.
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DateField({
  id,
  value,
  min,
  max,
  onChange,
  label,
}: {
  id: string;
  /** YYYY-MM-DD (UTC) */
  value: string;
  min: string;
  max: string;
  onChange: (v: string) => void;
  /** Accessible name of the calendar button's dialog. */
  label: string;
}) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const errId = useId();
  useEffect(() => setText(value), [value]);
  const lo = parse(min)!;
  const hi = parse(max)!;

  const commit = () => {
    if (text === value) return setError(null);
    const v = parse(text);
    if (v === null) {
      setError('Use the format YYYY-MM-DD.');
      setText(value);
      return;
    }
    if (v < lo || v > hi) {
      setError(`Choose a date from ${min} to ${max}.`);
      setText(value);
      return;
    }
    setError(null);
    onChange(toStr(v));
  };

  return (
    <span className={`datef${open ? ' is-open' : ''}`}>
      <input
        id={id}
        className="datef__input num"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder="YYYY-MM-DD"
        maxLength={10}
        value={text}
        aria-invalid={!!error}
        aria-describedby={error ? errId : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'ArrowDown' && e.altKey) setOpen(true);
        }}
      />
      <button
        ref={btn}
        type="button"
        className="datef__btn"
        aria-label={`Choose ${label.toLowerCase()} from a calendar`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2 6.5h12M5.5 1.8v2.6M10.5 1.8v2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      {error && (
        <span id={errId} className="datef__err" role="alert">
          {error}
        </span>
      )}
      {open && (
        <Calendar
          anchor={btn}
          label={label}
          value={parse(value) ?? lo}
          lo={lo}
          hi={hi}
          onPick={(v) => {
            setError(null);
            onChange(toStr(v));
          }}
          onClose={(restore) => {
            setOpen(false);
            if (restore) btn.current?.focus();
          }}
        />
      )}
    </span>
  );
}

function Calendar({
  anchor,
  label,
  value,
  lo,
  hi,
  onPick,
  onClose,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  label: string;
  value: number;
  lo: number;
  hi: number;
  onPick: (v: number) => void;
  onClose: (restore: boolean) => void;
}) {
  const [focus, setFocus] = useState(value);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const gridId = useId();
  const fd = new Date(focus);
  const y = fd.getUTCFullYear();
  const m = fd.getUTCMonth();
  const first = Date.UTC(y, m, 1);
  const startDow = new Date(first).getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  const place = useCallback(() => {
    const b = anchor.current?.getBoundingClientRect();
    if (!b) return;
    const W = 288;
    const H = 330;
    const up = window.innerHeight - b.bottom < H + 12 && b.top > window.innerHeight - b.bottom;
    const left = Math.min(Math.max(8, b.right - W), window.innerWidth - W - 8);
    setPos({ left, top: up ? b.top - 6 : b.bottom + 6, up });
  }, [anchor]);
  useLayoutEffect(place, [place]);
  const placed = pos !== null;
  useEffect(() => {
    if (placed) ref.current?.querySelector<HTMLButtonElement>('[data-focus="1"]')?.focus({ preventScroll: true });
  }, [placed, focus]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) onClose(false);
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, onClose, place]);

  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
  const addMonths = (v: number, k: number) => {
    const d = new Date(v);
    const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1);
    const dim = new Date(Date.UTC(new Date(target).getUTCFullYear(), new Date(target).getUTCMonth() + 1, 0)).getUTCDate();
    return clamp(Date.UTC(new Date(target).getUTCFullYear(), new Date(target).getUTCMonth(), Math.min(d.getUTCDate(), dim)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const dow = new Date(focus).getUTCDay();
    const moves: Record<string, () => number> = {
      ArrowLeft: () => focus - DAY,
      ArrowRight: () => focus + DAY,
      ArrowUp: () => focus - 7 * DAY,
      ArrowDown: () => focus + 7 * DAY,
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
      Home: () => focus - dow * DAY,
      End: () => focus + (6 - dow) * DAY,
    };
    if (moves[e.key]) {
      e.preventDefault();
      setFocus(clamp(moves[e.key]()));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
    } else if (e.key === 'Tab') {
      // Keep keyboard focus inside the dialog: header buttons ↔ day grid.
      const f = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)[tabindex="0"], .cal__nav:not(:disabled)') ?? [])];
      const i = f.indexOf(document.activeElement as HTMLButtonElement);
      if (f.length) {
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    }
  };
  const prevOk = Date.UTC(y, m, 0) >= lo;
  const nextOk = Date.UTC(y, m + 1, 1) <= hi;
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: days }, (_, i) => Date.UTC(y, m, i + 1))];

  if (!pos) return null;
  return createPortal(
    <div
      ref={ref}
      className={`cal${pos.up ? ' is-up' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKey}
    >
      <div className="cal__head">
        <button type="button" className="cal__nav" aria-label="Previous month" disabled={!prevOk} onClick={() => setFocus(addMonths(focus, -1))}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
        </button>
        <span className="cal__title" id={gridId} aria-live="polite">
          {MONTHS[m]} {y}
        </span>
        <button type="button" className="cal__nav" aria-label="Next month" disabled={!nextOk} onClick={() => setFocus(addMonths(focus, 1))}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
        </button>
      </div>
      <div className="cal__grid" role="grid" aria-labelledby={gridId}>
        <div className="cal__row" role="row">
          {WD.map((w) => (
            <span key={w} className="cal__wd" role="columnheader" aria-label={w}>
              {w}
            </span>
          ))}
        </div>
        {Array.from({ length: Math.ceil(cells.length / 7) }, (_, r) => (
          <div key={r} className="cal__row" role="row">
            {cells.slice(r * 7, r * 7 + 7).map((v, i) =>
              v === null ? (
                <span key={`e${i}`} className="cal__empty" role="gridcell" />
              ) : (
                <span key={v} role="gridcell" aria-selected={v === value}>
                  <button
                    type="button"
                    className={`cal__day num${v === value ? ' is-selected' : ''}${v === focus ? ' is-focus' : ''}`}
                    tabIndex={v === focus ? 0 : -1}
                    data-focus={v === focus ? '1' : undefined}
                    disabled={v < lo || v > hi}
                    aria-label={`${new Date(v).getUTCDate()} ${MONTHS[m]} ${y}`}
                    onClick={() => {
                      onPick(v);
                      onClose(true);
                    }}
                  >
                    {new Date(v).getUTCDate()}
                  </button>
                </span>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="cal__foot">Available {toStr(lo)} – {toStr(hi)}</div>
    </div>,
    document.body,
  );
}
