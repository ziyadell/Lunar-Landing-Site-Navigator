import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { useApp } from '../state/store';
import { prefersReducedMotion } from '../utils/motion';

/**
 * Keeps the subject in the free part of the window when a drawer is open.
 *
 * Uses a lens shift (camera.setViewOffset): the camera does not move or turn, so
 * every projected position — globe geography, markers, Sun and Earth in Surface
 * View — stays exact; the picture is simply re-centred in the space the drawer
 * leaves (half the drawer's width sideways, or half a bottom sheet's height upward).
 */
export function DrawerFrame() {
  const { camera, size, invalidate } = useThree();
  const cur = useRef({ x: 0, y: 0 });
  const last = useRef(0);
  useEffect(() => useApp.subscribe((s, p) => s.drawer !== p.drawer && invalidate()), [invalidate]);
  useFrame(() => {
    // Own clock: with frameloop="demand" the frame delta can be 0.
    const now = performance.now();
    const dt = last.current ? (now - last.current) / 1000 : 1 / 60;
    last.current = now;
    const cam = camera as THREE.PerspectiveCamera;
    const st = useApp.getState();
    let tx = 0;
    let ty = 0;
    const el = st.drawer ? document.querySelector<HTMLElement>('.drawer') : null;
    const host = document.querySelector<HTMLElement>('.viewport');
    if (el && host) {
      const b = el.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      if (b.width >= h.width * 0.9) ty = Math.min(b.height, h.height * 0.6) / 2;
      else if (b.left + b.width / 2 < h.left + h.width / 2) tx = -(b.right - h.left) / 2;
      else tx = (h.right - b.left) / 2;
    } else if (st.drawer) invalidate(); // drawer not mounted yet: look again next frame
    const c = cur.current;
    // Time-based easing (~250 ms), so slow renderers converge as fast as quick ones.
    const k = prefersReducedMotion() ? 1 : 1 - Math.exp(-Math.min(Math.max(dt, 1 / 120), 0.25) * 9);
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    if (Math.abs(tx - c.x) < 0.4 && Math.abs(ty - c.y) < 0.4) {
      c.x = tx;
      c.y = ty;
    } else invalidate();
    if (c.x === 0 && c.y === 0) {
      if (cam.view?.enabled) cam.clearViewOffset();
    } else cam.setViewOffset(size.width, size.height, c.x, c.y, size.width, size.height);
  }, -1);
  return null;
}
