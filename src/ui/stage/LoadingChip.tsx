import { t } from '../../i18n';
import { useEffect, useState } from 'react';
import { useFailures, useLoading } from '../../state/loading';

/**
 * Discreet, truthful status for streaming imagery: what is loading (after 400 ms, so fast
 * loads never flicker) and, if something failed, what failed with a Retry. The scene stays
 * usable throughout; the lower-resolution imagery remains in place on failure.
 */
export function LoadingChip() {
  const items = useLoading((s) => s.items);
  const failures = useFailures((s) => s.items);
  const busy = items.length > 0;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!busy) return setShow(false);
    const t = window.setTimeout(() => setShow(true), 400);
    return () => window.clearTimeout(t);
  }, [busy]);
  if (failures.length && !busy) {
    const f = failures[0];
    return (
      <div className="loadchip loadchip--failed" role="status" aria-live="polite">
        <span className="loadchip__text">{f.label} {t('did not load')}</span>
        <button type="button" className="loadchip__retry" onClick={f.retry}>
          {t('Retry')}
        </button>
      </div>
    );
  }
  if (!show || !busy) return null;
  return (
    <div className="loadchip" role="status" aria-live="polite">
      <i className="loadchip__ring" aria-hidden="true" />
      <span className="loadchip__text">
        {t('Loading')} {items[0].label}
        {items.length > 1 && <span className="loadchip__more"> · {items.length - 1} {t('more')}</span>}
      </span>
    </div>
  );
}
