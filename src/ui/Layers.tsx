import { useApp, type Layers } from '../state/store';

const LAYER_LABELS: { k: keyof Layers; label: string; modes: ('orbital' | 'surface')[] }[] = [
  { k: 'labels', label: 'Region labels', modes: ['orbital'] },
  { k: 'sunVector', label: 'Sun vector', modes: ['orbital'] },
  { k: 'earthVector', label: 'Earth vector', modes: ['orbital'] },
  { k: 'enhancedLight', label: 'Enhanced visibility', modes: ['surface'] },
  { k: 'albedo', label: 'LROC albedo (100 m)', modes: ['surface'] },
  { k: 'horizonLine', label: 'LOLA skyline', modes: ['surface'] },
  { k: 'stars', label: 'Stars (BSC5)', modes: ['surface'] },
  { k: 'skyGrid', label: 'Az / El grid', modes: ['surface'] },
  { k: 'rings', label: 'Range rings', modes: ['surface'] },
  { k: 'regolith', label: 'Fine texture (illustrative)', modes: ['surface'] },
];

export function LayerToggles() {
  const mode = useApp((s) => s.mode);
  const layers = useApp((s) => s.layers);
  const toggle = useApp((s) => s.toggleLayer);
  return (
    <fieldset className={`layers layers--${mode}`}>
      <legend>Display</legend>
      {LAYER_LABELS.filter((l) => l.modes.includes(mode as 'orbital')).map((l) => (
        <label key={l.k} className="check">
          <input type="checkbox" checked={layers[l.k]} onChange={() => toggle(l.k)} />
          <span className="check__box" aria-hidden="true" />
          {l.label}
        </label>
      ))}
    </fieldset>
  );
}
