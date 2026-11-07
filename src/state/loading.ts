import { create } from 'zustand';

/** What is streaming right now, for the loading indicator. Labels are user-facing. */
interface Loading {
  items: { id: number; label: string }[];
  begin: (label: string) => number;
  end: (id: number) => void;
}
let n = 0;
export const useLoading = create<Loading>((set) => ({
  items: [],
  begin: (label) => {
    const id = ++n;
    set((s) => ({ items: [...s.items, { id, label }] }));
    return id;
  },
  end: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

/** Track a promise under a label. */
export function track<T>(label: string, p: Promise<T>): Promise<T> {
  const id = useLoading.getState().begin(label);
  const done = () => useLoading.getState().end(id);
  p.then(done, done);
  return p;
}
