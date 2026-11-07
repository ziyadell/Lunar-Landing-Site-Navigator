import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMedia } from '../utils/useMedia';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Theme-consistent select.
 *  - Fine pointers (desktop): a listbox popover. Arrow keys, Home/End, type-ahead, Enter or
 *    Space to choose, Escape or Tab to close, outside click to dismiss; focus returns to the
 *    button. The popover is placed in the viewport (flips above, clamps to the edges) so
 *    it is never clipped by a scrolling card.
 *  - Touch devices: the native select, styled the same, so the system picker is used.
 */
export function Select<T extends string | number>({
  id,
  value,
  options,
  onChange,
  labelledBy,
  className = '',
  display,
}: {
  id: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  labelledBy: string;
  className?: string;
  /** Button content (defaults to the selected option's label). */
  display?: ReactNode;
}) {
  const coarse = useMedia('(pointer: coarse)');
  const selected = options.find((o) => o.value === value);
  const chevron = (
    <svg className="sel__chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" fill="none" strokeWidth="1.5" />
    </svg>
  );
  if (coarse) {
    return (
      <span className={`sel sel--native ${className}`}>
        <select
          id={id}
          className="sel__btn"
          aria-labelledby={labelledBy}
          value={String(value)}
          onChange={(e) => {
            const o = options.find((x) => String(x.value) === e.target.value);
            if (o) onChange(o.value);
          }}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        {chevron}
      </span>
    );
  }
  return <ListboxSelect id={id} value={value} options={options} onChange={onChange} labelledBy={labelledBy} className={className} display={display ?? selected?.label} chevron={chevron} />;
}

function ListboxSelect<T extends string | number>({
  id,
  value,
  options,
  onChange,
  labelledBy,
  className,
  display,
  chevron,
}: {
  id: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  labelledBy: string;
  className: string;
  display: ReactNode;
  chevron: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ s: '', t: 0 });
  const listId = useId();
  const selIdx = Math.max(0, options.findIndex((o) => o.value === value));

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const want = Math.min(320, options.length * 40 + 12);
    const below = vh - b.bottom - 12;
    const above = b.top - 12;
    const up = below < Math.min(want, 200) && above > below;
    const maxH = Math.max(120, Math.min(want, up ? above : below));
    const width = Math.max(b.width, 180);
    const left = Math.min(Math.max(8, b.left), vw - width - 8);
    setPos({ left, top: up ? b.top - 6 : b.bottom + 6, width, maxH, up });
  }, [options.length]);

  const close = useCallback((restore: boolean) => {
    setOpen(false);
    if (restore) btn.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    setActive(selIdx);
  }, [open, place, selIdx]);

  // Move focus into the list once it exists (it mounts after its position is measured).
  const placed = pos !== null;
  useEffect(() => {
    if (open && placed) list.current?.focus({ preventScroll: true });
  }, [open, placed]);
  useEffect(() => {
    if (!open) setPos(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const reflow = () => place();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open, close, place]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    close(true);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const n = options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((a) => Math.min(n - 1, a + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(n - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const now = performance.now();
          typed.current.s = (now - typed.current.t < 700 ? typed.current.s : '') + e.key.toLowerCase();
          typed.current.t = now;
          const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.s));
          if (i >= 0) setActive(i);
        }
    }
  };

  return (
    <span className={`sel ${className}`}>
      <button
        ref={btn}
        id={id}
        type="button"
        className={`sel__btn${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelledBy} ${id}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="sel__val">{display}</span>
        {chevron}
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            className={`sel__list${pos.up ? ' is-up' : ''}`}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={labelledBy}
            aria-activedescendant={`${listId}-${active}`}
            onKeyDown={onListKey}
            style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH }}
          >
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                id={`${listId}-${i}`}
                data-i={i}
                role="option"
                aria-selected={i === selIdx}
                className={`sel__opt${i === active ? ' is-active' : ''}${i === selIdx ? ' is-selected' : ''}`}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span className="sel__opt-label">{o.label}</span>
                {o.hint && <span className="sel__opt-hint">{o.hint}</span>}
                <svg className="sel__check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2.5 6.2 5 8.6l4.6-5" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </span>
  );
}
