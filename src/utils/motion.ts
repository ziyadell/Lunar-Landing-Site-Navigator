export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    // three.js r163+ renders with WebGL 2 only; a WebGL 1-only browser cannot draw the scenes.
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}
