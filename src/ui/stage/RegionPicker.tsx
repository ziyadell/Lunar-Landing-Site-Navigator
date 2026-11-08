import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../state/store';
import { useData } from '../../data/DataContext';
import { fmtLat, fmtLon } from '../../utils/format';
import { useAllConditions } from './Regions';
import { Listen } from '../../audio/ui';

/**
 * "Landing Regions": the one control for browsing every candidate region. The first
 * activation opens the full list (from the canonical sites.json), with the current
 * selection marked. Popover on wide screens, bottom sheet on phones (CSS). Arrow keys,
 * Home/End, type-ahead, Enter/Space choose; Escape/Tab/outside close; focus returns to the
 * button. Choosing a region updates the selection, which drives the marker, the region
 * card, the camera and the URL.
 */
export function RegionPicker() {
  const { sites } = useData();
  const regionId = useApp((s) => s.regionId);
  const selectRegion = useApp((s) => s.selectRegion);
  const all = useAllConditions();
  const open = useApp((s) => s.pickerOpen);
  const anchor = useApp((s) => s.pickerAnchor);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ s: '', t: 0 });
  const listId = useId();
  const regions = sites.regions;
  const selIdx = Math.max(0, regions.findIndex((r) => r.id === regionId));

  const place = useCallback(() => {
    // Anchor: the control that opened the list (region card button or globe marker).
    const r = btn.current?.getBoundingClientRect();
    const b = anchor ? { left: anchor.x, top: anchor.y, bottom: anchor.y + anchor.h, width: anchor.w } : r;
    if (!b) return;
    const W = 320;
    // Open toward the side with more room and never exceed it (the list scrolls inside).
    const below = window.innerHeight - b.bottom - 12;
    const above = b.top - 12;
    const up = above > below;
    const maxH = Math.max(200, Math.min(520, (up ? above : below) - 6));
    setPos({ left: Math.min(Math.max(8, b.left), window.innerWidth - W - 8), top: up ? b.top - 6 : b.bottom + 6, up, maxH });
  }, [anchor]);
  const close = useCallback((restore: boolean) => {
    useApp.getState().closePicker();
    setPos(null);
    if (restore) btn.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    setActive(selIdx);
  }, [open, place, selIdx]);
  const placed = pos !== null;
  useEffect(() => {
    if (open && placed) list.current?.focus({ preventScroll: true });
  }, [open, placed]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.parentElement?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', place);
    };
  }, [open, close, place]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (i: number) => {
    const r = regions[i];
    if (r && r.id !== regionId) selectRegion(r.id);
    close(true);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const n = regions.length;
    const k = e.key;
    if (k === 'ArrowDown') setActive((a) => Math.min(n - 1, a + 1));
    else if (k === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (k === 'Home') setActive(0);
    else if (k === 'End') setActive(n - 1);
    else if (k === 'Enter' || k === ' ') choose(active);
    else if (k === 'Escape') {
      e.stopPropagation();
      close(true);
    } else if (k === 'Tab') return close(false);
    else if (k.length === 1 && /\S/.test(k)) {
      const now = performance.now();
      typed.current.s = (now - typed.current.t < 700 ? typed.current.s : '') + k.toLowerCase();
      typed.current.t = now;
      const i = regions.findIndex((r) => r.name.toLowerCase().startsWith(typed.current.s));
      if (i >= 0) setActive(i);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`rpick__btn${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={(e) => (open ? close(true) : useApp.getState().openPicker(e.currentTarget.getBoundingClientRect()))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            useApp.getState().openPicker(e.currentTarget.getBoundingClientRect());
          }
        }}
      >
        <span className="rpick__label">Landing Regions</span>
        <span className="rpick__count num" aria-hidden="true">
          {regions.length}
        </span>
        <svg className="rpick__chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" fill="none" strokeWidth="1.5" />
        </svg>
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="sheet-backdrop" aria-hidden="true" />
            <div className={`rpick__panel sheet${pos.up ? ' is-up' : ''}`} style={{ left: pos.left, top: pos.top, maxHeight: pos.maxH }} role="dialog" aria-label="Landing Regions">
              <div className="sheet__head">
                <span className="sheet__title">Landing Regions</span>
                <Listen id="view-regions" />
                <span className="rpick__sub">NASA Artemis III candidates · {regions.length}</span>
                <button type="button" className="sheet__close" aria-label="Close landing regions" onClick={() => close(true)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" /></svg>
                </button>
              </div>
              <ul
                ref={list}
                id={listId}
                className="rpick__list"
                role="listbox"
                tabIndex={-1}
                aria-label="Landing Regions"
                aria-activedescendant={`${listId}-${regions[active]?.id}`}
                onKeyDown={onKey}
              >
                {regions.map((r, i) => {
                  const c = all[r.id];
                  const sel = r.id === regionId;
                  return (
                    <li
                      key={r.id}
                      id={`${listId}-${r.id}`}
                      data-i={i}
                      role="option"
                      aria-selected={sel}
                      className={`rpick__opt${i === active ? ' is-active' : ''}${sel ? ' is-selected' : ''}`}
                      onPointerMove={() => setActive(i)}
                      onClick={() => choose(i)}
                    >
                      <span className="rpick__name">{r.name}</span>
                      <span className="rpick__meta num">
                        {fmtLat(r.observationPoint.latDeg, 2)} {fmtLon(r.observationPoint.lonDeg, 2)}
                      </span>
                      {c && (
                        <span className="rpick__lights" aria-label={`Sun ${c.sun.state === 'visible' ? 'visible' : 'hidden'}, Earth ${c.earth.state === 'visible' ? 'visible' : 'hidden'}`}>
                          <i className={`rpick__l rpick__l--sun${c.sun.state === 'visible' ? ' is-on' : ''}`} />
                          <i className={`rpick__l rpick__l--earth${c.earth.state === 'visible' ? ' is-on' : ''}`} />
                        </span>
                      )}
                      <svg className="rpick__check" width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M2.5 6.2 5 8.6l4.6-5" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
