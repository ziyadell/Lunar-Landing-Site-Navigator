import { useEffect, useState } from 'react';
import { useLoading } from '../../state/loading';

/**
 * Quiet, honest loading feedback: names what is streaming (the scene stays usable the
 * whole time). Appears only after 400 ms, so fast loads never flicker a message.
 */
export function LoadingChip() {
  const items = useLoading((s) => s.items);
  const [show, setShow] = useState(false);
  const busy = items.length > 0;
  useEffect(() => {
    if (!busy) return setShow(false);
    const t = window.setTimeout(() => setShow(true), 400);
    return () => window.clearTimeout(t);
  }, [busy]);
  if (!show || !busy) return null;
  return (
    <div className="loadchip" role="status" aria-live="polite">
      <i className="loadchip__ring" aria-hidden="true" />
      <span>
        Loading {items[0].label}
        {items.length > 1 && <span className="loadchip__more"> · {items.length - 1} more</span>}
      </span>
    </div>
  );
}
