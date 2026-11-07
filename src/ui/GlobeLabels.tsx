import { useApp } from '../state/store';
import { useData } from '../data/DataContext';

/**
 * Region labels for the orbital globe. Positioned every frame by the 3D scene
 * (OrbitalScene → SiteMarkers) via element ids; clicking a label selects the region.
 */
export function GlobeLabels() {
  const { sites } = useData();
  const regionId = useApp((s) => s.regionId);
  const selectRegion = useApp((s) => s.selectRegion);
  return (
    <div className="globe-labels" aria-hidden="true">
      {sites.regions.map((r, i) => (
        <div
          key={r.id}
          id={`globe-label-${r.id}`}
          className={`globe-label${r.id === regionId ? ' is-selected' : ''}`}
          style={{ visibility: 'hidden' }}
          title={r.name}
          onClick={() => selectRegion(r.id)}
        >
          <span className="globe-label__idx">{String(i + 1).padStart(2, '0')}</span>
          {/* Regions sit tens of km apart, so only the selected one carries its full name. */}
          {r.id === regionId && r.name}
        </div>
      ))}
    </div>
  );
}
