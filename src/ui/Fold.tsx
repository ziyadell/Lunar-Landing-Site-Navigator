import { useSettings } from '../state/settings';

type Key = 'toolsFolded' | 'skylineFolded' | 'regionFolded' | 'readingsFolded';

/** Hide / show toggle used by every collapsible panel (remembered between visits). */
export function FoldButton({ k, what, className = '' }: { k: Key; what: string; className?: string }) {
  const folded = useSettings((s) => s[k]);
  const set = useSettings((s) => s.set);
  return (
    <button
      type="button"
      className={`fold-btn${folded ? ' is-folded' : ''} ${className}`}
      aria-expanded={!folded}
      aria-label={`${folded ? 'Show' : 'Hide'} ${what}`}
      title={`${folded ? 'Show' : 'Hide'} ${what}`}
      onClick={() => set({ [k]: !folded })}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d={folded ? 'M2.5 4.5 6 8l3.5-3.5' : 'M2.5 7.5 6 4l3.5 3.5'} stroke="currentColor" fill="none" strokeWidth="1.5" />
      </svg>
    </button>
  );
}

const ToolsIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="10.5" cy="4.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="5.5" cy="11.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

/** Collapsed tool rack: one button that brings the tools back. */
export function FoldedTools({ label }: { label: string }) {
  const set = useSettings((s) => s.set);
  return (
    <div className="tool-col tool-col--folded" role="group" aria-label={label} data-obstacle>
      <button type="button" className="icon-tool" aria-expanded={false} aria-label={`Show ${label.toLowerCase()}`} title={`Show ${label.toLowerCase()}`} onClick={() => set({ toolsFolded: false })}>
        {ToolsIcon}
      </button>
    </div>
  );
}
