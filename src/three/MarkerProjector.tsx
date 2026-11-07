import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useData } from '../data/DataContext';
import { useApp } from '../state/store';
import { lonLatToVec, meToThree } from '../science/geometry';
import { useCameraInfo } from './GlobeCamera';

/**
 * Multi-scale marker layout (drives the DOM in ui/GlobeLabels.tsx).
 *  • Overview: when the four regions would sit closer than CLUSTER_PX on screen,
 *    a single cluster pin replaces them (selected region named on the pin).
 *  • Regional: individual dots at the exact projected observation points; labels
 *    placed by greedy collision avoidance among 8 candidate offsets, kept inside
 *    the viewport, with leader lines when displaced.
 *  • Close (range < 400 km): the selected point is annotated as the observation point,
 *    and NASA's region outline (drawn in RegionOutlines) is labelled at its corner.
 */
const CLUSTER_PX = 24;
const DOT = 10;
const MARGIN = 6;

type Rect = { x: number; y: number; w: number; h: number };
const overlap = (a: Rect, b: Rect) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
const area = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const toWorld = (latDeg: number, lonDeg: number, elevM = 0) =>
  new THREE.Vector3(...meToThree(lonLatToVec(latDeg, lonDeg))).multiplyScalar(1 + elevM / 1_737_400);

function show(el: HTMLElement | null, on: boolean) {
  if (!el) return;
  el.style.visibility = on ? 'visible' : 'hidden';
}

export function MarkerProjector() {
  const { sites } = useData();
  const { camera, size } = useThree();
  const pts = useMemo(
    () =>
      sites.regions.map((r) => ({
        id: r.id,
        world: toWorld(r.observationPoint.latDeg, r.observationPoint.lonDeg, r.observationPoint.elevationM),
        // Label anchor: the outline's first corner; without a valid outline, the point itself.
        ref: r.nasaRegion
          ? toWorld(r.nasaRegion.corners[0][0], r.nasaRegion.corners[0][1])
          : toWorld(r.observationPoint.latDeg, r.observationPoint.lonDeg, r.observationPoint.elevationM),
      })),
    [sites],
  );

  useFrame(() => {
    const st = useApp.getState();
    const showLabels = st.layers.labels;
    const sel = st.regionId;
    const cam = camera.position;
    const W = size.width;
    const H = size.height;
    // On-screen controls are obstacles for labels and the cluster pin.
    const host = document.querySelector('.viewport') as HTMLElement | null;
    const hb = host?.getBoundingClientRect();
    const obstacles: Rect[] = [];
    if (hb)
      for (const el of document.querySelectorAll<HTMLElement>('[data-obstacle]')) {
        const b = el.getBoundingClientRect();
        obstacles.push({ x: b.left - hb.left - 4, y: b.top - hb.top - 4, w: b.width + 8, h: b.height + 8 });
      }
    const project = (v: THREE.Vector3) => {
      const p = v.clone().project(camera);
      return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, inFront: p.z < 1 };
    };
    const faces = (v: THREE.Vector3) => v.clone().normalize().dot(cam.clone().sub(v).normalize()) > 0.02;

    const items = pts.map((p) => {
      const s = project(p.world);
      const vis = faces(p.world) && s.inFront && s.x > -40 && s.x < W + 40 && s.y > -40 && s.y < H + 40;
      return { ...p, s, vis };
    });
    const visible = items.filter((i) => i.vis);
    let minD = Infinity;
    for (let a = 0; a < visible.length; a++)
      for (let b = a + 1; b < visible.length; b++)
        minD = Math.min(minD, Math.hypot(visible[a].s.x - visible[b].s.x, visible[a].s.y - visible[b].s.y));
    const cluster = visible.length > 1 && minD < CLUSTER_PX;

    // Cluster pin
    const cEl = document.getElementById('gm-cluster');
    if (cEl) {
      show(cEl, cluster);
      if (cluster) {
        const cx = visible.reduce((a, i) => a + i.s.x, 0) / visible.length;
        const cy = visible.reduce((a, i) => a + i.s.y, 0) / visible.length;
        const w = cEl.offsetWidth;
        const h = cEl.offsetHeight;
        // Stays attached to the cluster as the globe turns: the chip starts at the pole point
        // (its dot sits on it) and only flips to the left near the right edge. It never jumps
        // away from controls; it fades behind them instead.
        const right = cx - 9 + w <= W - MARGIN;
        const x = right ? cx - 9 : cx + 9 - w;
        const y = THREE.MathUtils.clamp(cy - h / 2, MARGIN, H - h - MARGIN);
        cEl.classList.toggle('is-flipped', !right);
        const covered = obstacles.some((o) => overlap({ x, y, w, h }, o));
        cEl.classList.toggle('is-covered', covered);
        cEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
    }

    // Dots and labels
    const placed: Rect[] = [];
    const dots: Rect[] = visible.map((i) => ({ x: i.s.x - DOT / 2, y: i.s.y - DOT / 2, w: DOT, h: DOT }));
    const order = [...items].sort((a, b) => (a.id === sel ? -1 : b.id === sel ? 1 : 0));
    for (const it of order) {
      const dot = document.getElementById(`gm-dot-${it.id}`);
      const lbl = document.getElementById(`gm-lbl-${it.id}`);
      const lead = document.getElementById(`gm-lead-${it.id}`) as SVGLineElement | null;
      const on = it.vis && !cluster;
      show(dot, on);
      if (dot && on) dot.style.transform = `translate(${(it.s.x - DOT / 2).toFixed(1)}px, ${(it.s.y - DOT / 2).toFixed(1)}px)`;
      if (!lbl) continue;
      if (!on || !showLabels) {
        show(lbl, false);
        lead?.setAttribute('visibility', 'hidden');
        continue;
      }
      const w = lbl.offsetWidth;
      const h = lbl.offsetHeight;
      const { x, y } = it.s;
      const cands: [number, number][] = [
        [x + 10, y - h / 2], [x - 10 - w, y - h / 2], [x + 12, y - h - 10], [x + 12, y + 10],
        [x - 12 - w, y - h - 10], [x - 12 - w, y + 10], [x - w / 2, y - h - 18], [x - w / 2, y + 18],
        [x + 26, y - h - 26], [x + 26, y + 26], [x - 26 - w, y - h - 26], [x - 26 - w, y + 26],
      ];
      let best: Rect | null = null;
      let bestCost = Infinity;
      for (const [cx, cy] of cands) {
        const r: Rect = { x: cx, y: cy, w, h };
        const outside = r.x < MARGIN || r.y < MARGIN || r.x + w > W - MARGIN || r.y + h > H - MARGIN;
        let cost = (outside ? 1e6 : 0) + Math.hypot(cx + w / 2 - x, cy + h / 2 - y) * 0.01;
        for (const q of placed) cost += area(r, q) * 10;
        for (const d of dots) if (overlap(r, d)) cost += area(r, d) * 10;
        for (const o of obstacles) if (overlap(r, o)) cost += 1e5 + area(r, o);
        if (cost < bestCost) {
          bestCost = cost;
          best = r;
        }
        if (cost < 1) break;
      }
      if (!best) continue;
      best.x = THREE.MathUtils.clamp(best.x, MARGIN, W - w - MARGIN);
      best.y = THREE.MathUtils.clamp(best.y, MARGIN, H - h - MARGIN);
      placed.push(best);
      show(lbl, true);
      lbl.style.transform = `translate(${best.x.toFixed(1)}px, ${best.y.toFixed(1)}px)`;
      // Leader line from the dot to the nearest label edge when displaced.
      const ax = THREE.MathUtils.clamp(x, best.x, best.x + w);
      const ay = THREE.MathUtils.clamp(y, best.y, best.y + h);
      const dist = Math.hypot(ax - x, ay - y);
      if (lead) {
        lead.setAttribute('visibility', dist > 14 ? 'visible' : 'hidden');
        lead.setAttribute('x1', x.toFixed(1));
        lead.setAttribute('y1', y.toFixed(1));
        lead.setAttribute('x2', ax.toFixed(1));
        lead.setAttribute('y2', ay.toFixed(1));
        lead.setAttribute('class', it.id === sel ? 'is-selected' : '');
      }
    }

    // Close-range annotations for the selected region.
    const info = useCameraInfo.getState();
    const s = items.find((i) => i.id === sel);
    const close = !!s && s.vis && !cluster && info.mode === 'site' && info.rangeKm < 400;
    const note = document.getElementById('gm-obs');
    show(note, close && showLabels);
    if (note && close && s) {
      const lr = placed[0];
      const nx = THREE.MathUtils.clamp(lr ? lr.x : s.s.x + 10, MARGIN, W - note.offsetWidth - MARGIN);
      const ny = THREE.MathUtils.clamp(lr ? lr.y + lr.h + 2 : s.s.y + 12, MARGIN, H - note.offsetHeight - MARGIN);
      note.style.transform = `translate(${nx.toFixed(1)}px, ${ny.toFixed(1)}px)`;
    }
    const refEl = document.getElementById('gm-ref');
    if (refEl && s) {
      const rp = project(s.ref);
      const on = close && faces(s.ref) && rp.inFront && rp.x > 0 && rp.x < W && rp.y > 0 && rp.y < H && showLabels;
      show(refEl, on);
      if (on) refEl.style.transform = `translate(${(rp.x + 2).toFixed(1)}px, ${(rp.y - refEl.offsetHeight - 3).toFixed(1)}px)`;
    }
  });
  return null;
}
