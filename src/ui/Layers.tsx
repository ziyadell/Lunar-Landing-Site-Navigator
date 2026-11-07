import { useApp, type Layers } from '../state/store';

type Kind = 'data' | 'aid';
const LAYER_LABELS: { k: keyof Layers; label: string; kind: Kind; modes: ('orbital' | 'surface')[] }[] = [
  { k: 'labels', label: 'Region labels', kind: 'aid', modes: ['orbital'] },
  { k: 'sunVector', label: 'Direction to the Sun', kind: 'data', modes: ['orbital'] },
  { k: 'earthVector', label: 'Direction to Earth', kind: 'data', modes: ['orbital'] },
  { k: 'albedo', label: 'LROC surface brightness (100 m)', kind: 'data', modes: ['surface'] },
  { k: 'horizonLine', label: 'Measured LOLA skyline', kind: 'data', modes: ['surface'] },
  { k: 'stars', label: 'Stars (Yale catalogue)', kind: 'data', modes: ['surface'] },
  { k: 'enhancedLight', label: 'Lift shadows for readability', kind: 'aid', modes: ['surface'] },
  { k: 'regolith', label: 'Fine ground texture', kind: 'aid', modes: ['surface'] },
  { k: 'skyGrid', label: 'Azimuth / elevation grid', kind: 'aid', modes: ['surface'] },
  { k: 'rings', label: 'Range rings', kind: 'aid', modes: ['surface'] },
];

/**
 * Layers, grouped by what they are: measured data, or display aids that help reading
 * the scene but are not measurements (illustrative texture, lifted shadows, guides).
 */
export function LayerToggles() {
  const mode = useApp((s) => s.mode);
  const layers = useApp((s) => s.layers);
  const toggle = useApp((s) => s.toggleLayer);
  const items = LAYER_LABELS.filter((l) => l.modes.includes(mode as 'orbital'));
  const group = (kind: Kind, title: string) => {
    const g = items.filter((l) => l.kind === kind);
    if (!g.length) return null;
    return (
      <fieldset className={`layers layers--${kind}`}>
        <legend>{title}</legend>
        {g.map((l) => (
          <label key={l.k} className="check">
            <input type="checkbox" checked={layers[l.k]} onChange={() => toggle(l.k)} />
            <span className="check__box" aria-hidden="true" />
            {l.label}
          </label>
        ))}
      </fieldset>
    );
  };
  return (
    <>
      {group('data', 'Measured')}
      {group('aid', 'Display aids · not measurements')}
    </>
  );
}
