import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { create } from 'zustand';
import { useApp } from '../state/store';
import { useData } from '../data/DataContext';
import { lonLatToVec, meToThree, vecToLonLat } from '../science/geometry';
import { prefersReducedMotion } from '../utils/motion';

/**
 * Globe camera controller (replaces Moon-centred OrbitControls).
 *
 * Two modes share one parameterisation — a target point T, a local frame
 * (U up, N, E) at T, and (heading h, tilt t, range r):
 *   camera = T + r·(cos t·U − sin t·F),  F = cos h·N + sin h·E   (F = look bearing)
 *   up     = sin t·U + cos t·F            (always ⟂ view direction; no flips)
 *
 *  • global: T = Moon centre, U = lunar north. Drag orbits the globe.
 *  • site:   T = a surface point, U = its normal. Drag turns/tilts around the
 *            point, right-drag / two-finger drag pans across the surface,
 *            zoom approaches the point itself.
 *
 * Zooming past the global limit hands over to site mode on the point under the
 * screen centre; zooming out of site mode hands back. Every hand-over converts the
 * current camera position exactly, and the look-at point and up vector are
 * damped, so there are no jumps. Zoom limits follow the data resolution:
 * ~100 m/px imagery and 80 m LOLA relief poleward of 80°S, 0.67 km/px elsewhere.
 */

const MOON_KM = 1737.4;
const GLOBAL_MIN = 1.3;
const GLOBAL_MAX = 8;
const SITE_MAX = 1.6;
const TILT_MAX_SITE = (72 * Math.PI) / 180;
const POLAR_LIMIT_LAT = -80;

export const siteMinRange = (latDeg: number) => (latDeg <= POLAR_LIMIT_LAT ? 0.06 : 0.33);

interface Pose {
  mode: 'global' | 'site';
  target: THREE.Vector3;
  heading: number;
  tilt: number;
  logRange: number;
}

/** Live camera telemetry for the UI (scale bar, resolution note). Updated only on change. */
export const useCameraInfo = create<{
  mode: 'global' | 'site';
  latDeg: number;
  lonDeg: number;
  rangeKm: number;
  metersPerPixel: number;
}>(() => ({ mode: 'global', latDeg: -90, lonDeg: 0, rangeKm: 0, metersPerPixel: 0 }));

/** Surface coordinate under the pointer (null when off the globe). */
export const useCursorLL = create<{ ll: { latDeg: number; lonDeg: number } | null }>(() => ({ ll: null }));

function frame(mode: Pose['mode'], target: THREE.Vector3) {
  if (mode === 'global') {
    return { U: new THREE.Vector3(0, 1, 0), N: new THREE.Vector3(1, 0, 0), E: new THREE.Vector3(0, 0, -1) };
  }
  const U = target.clone().normalize();
  let E = new THREE.Vector3(0, 1, 0).cross(U);
  if (E.lengthSq() < 1e-8) E = new THREE.Vector3(0, 0, -1);
  E.normalize();
  const N = U.clone().cross(E).normalize();
  return { U, N, E };
}

function bearingVec(f: ReturnType<typeof frame>, h: number) {
  return f.N.clone().multiplyScalar(Math.cos(h)).add(f.E.clone().multiplyScalar(Math.sin(h)));
}

function poseCamera(p: Pose) {
  const f = frame(p.mode, p.target);
  const r = Math.exp(p.logRange);
  const F = bearingVec(f, p.heading);
  const pos = p.target
    .clone()
    .add(f.U.clone().multiplyScalar(r * Math.cos(p.tilt)))
    .sub(F.clone().multiplyScalar(r * Math.sin(p.tilt)));
  const up = f.U.clone().multiplyScalar(Math.sin(p.tilt)).add(F.clone().multiplyScalar(Math.cos(p.tilt))).normalize();
  return { pos, up };
}

/** Express a camera position in a given mode/target frame (exact, no jump). */
function poseFrom(mode: Pose['mode'], target: THREE.Vector3, camPos: THREE.Vector3, fallbackHeading: number): Pose {
  const f = frame(mode, target);
  const off = camPos.clone().sub(target);
  const r = Math.max(off.length(), 1e-4);
  const d = off.divideScalar(r);
  const tilt = Math.acos(THREE.MathUtils.clamp(d.dot(f.U), -1, 1));
  const horiz = d.clone().sub(f.U.clone().multiplyScalar(d.dot(f.U)));
  let heading = fallbackHeading;
  if (horiz.lengthSq() > 1e-8) {
    const F = horiz.normalize().negate();
    heading = Math.atan2(F.dot(f.E), F.dot(f.N));
  }
  return { mode, target: target.clone(), heading, tilt, logRange: Math.log(r) };
}

const surfacePoint = (latDeg: number, lonDeg: number, elevM = 0) => {
  const v = meToThree(lonLatToVec(latDeg, lonDeg));
  return new THREE.Vector3(...v).multiplyScalar(1 + elevM / (MOON_KM * 1000));
};

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function clampPose(p: Pose, aspect: number) {
  const portrait = aspect < 1 ? 1 / Math.max(0.5, aspect) : 1;
  if (p.mode === 'global') {
    p.tilt = THREE.MathUtils.clamp(p.tilt, 0.03, Math.PI - 0.03);
    p.logRange = THREE.MathUtils.clamp(p.logRange, Math.log(GLOBAL_MIN), Math.log(GLOBAL_MAX * portrait));
  } else {
    const lat = vecToLonLat([p.target.x, -p.target.z, p.target.y]).latDeg;
    p.tilt = THREE.MathUtils.clamp(p.tilt, 0, TILT_MAX_SITE);
    p.logRange = THREE.MathUtils.clamp(p.logRange, Math.log(siteMinRange(lat)), Math.log(SITE_MAX * portrait));
  }
}

export function GlobeCamera() {
  const { camera, gl, size, invalidate } = useThree();
  const { region, ephemeris } = useData();
  const cmd = useApp((s) => s.cameraCommand);
  const cur = useRef<Pose | null>(null);
  const goal = useRef<Pose | null>(null);
  const look = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3(0, 1, 0));
  const rate = useRef(7);
  const dive = useRef<{ until: number } | null>(null);
  const zoomRef = useRef<(f: number) => void>(() => undefined);
  const zoomCmd = useApp((s) => s.zoomCommand);
  useEffect(() => {
    if (zoomCmd.seq > 0) zoomRef.current(zoomCmd.factor);
  }, [zoomCmd]);

  const aspect = () => (camera as THREE.PerspectiveCamera).aspect || 1;

  const sunBearing = (f: ReturnType<typeof frame>) => {
    const s = ephemeris.sample(useApp.getState().timeMs);
    if (!s) return 0;
    const sun = new THREE.Vector3(...meToThree(s.sun.dir));
    // Look away from the Sun so sunlit slopes face the camera.
    const away = sun.sub(f.U.clone().multiplyScalar(sun.dot(f.U))).negate();
    return away.lengthSq() < 1e-8 ? 0 : Math.atan2(away.dot(f.E), away.dot(f.N));
  };

  /** Switch the current pose to a new mode/target without moving the camera. */
  const rebase = (mode: Pose['mode'], target: THREE.Vector3) => {
    const c = cur.current!;
    cur.current = poseFrom(mode, target, camera.position, c.heading);
    goal.current = { ...cur.current, target: target.clone() };
  };

  const setGoal = (p: Pose, speed = 7) => {
    clampPose(p, aspect());
    goal.current = p;
    rate.current = speed;
    if (prefersReducedMotion() || document.visibilityState === 'hidden') cur.current = { ...p, target: p.target.clone() };
    invalidate();
  };

  // Initial pose + commands from the UI.
  const first = useRef(true);
  useEffect(() => {
    const st = useApp.getState();
    const r = region(st.regionId);
    const portrait = aspect() < 1 ? 1 / Math.max(0.5, aspect()) : 1;
    if (!cur.current) {
      const f = frame('global', new THREE.Vector3());
      cur.current = { mode: 'global', target: new THREE.Vector3(), heading: sunBearing(f), tilt: 2.62, logRange: Math.log(4.05 * portrait) };
      goal.current = { ...cur.current, target: new THREE.Vector3() };
      const { pos, up: u } = poseCamera(cur.current);
      camera.position.copy(pos);
      up.current.copy(u);
      look.current.set(0, 0, 0);
    }
    if (first.current && cmd.kind === 'global') {
      first.current = false;
      return;
    }
    // A camera deep link (initial command) jumps straight to its pose.
    const initial = first.current;
    first.current = false;
    if (initial) setTimeout(() => {
      if (goal.current) cur.current = { ...goal.current, target: goal.current.target.clone() };
      look.current.copy(goal.current!.target);
      invalidate();
    }, 0);
    dive.current = null;
    if (cmd.kind === 'intro') {
      // Welcome: a slow, restrained approach from farther out to the default view.
      rebase('global', new THREE.Vector3());
      const f = frame('global', new THREE.Vector3());
      const h = sunBearing(f);
      cur.current = { ...cur.current!, heading: h - 0.45, tilt: 2.3, logRange: Math.log(Math.min(GLOBAL_MAX, 7) * portrait) };
      setGoal({ mode: 'global', target: new THREE.Vector3(), heading: h, tilt: 2.62, logRange: Math.log(4.05 * portrait) }, 0.9);
      return;
    }
    if (cmd.kind === 'global') {
      rebase('global', new THREE.Vector3());
      const f = frame('global', new THREE.Vector3());
      setGoal({ mode: 'global', target: new THREE.Vector3(), heading: sunBearing(f), tilt: 2.62, logRange: Math.log(4.05 * portrait) });
      return;
    }
    if (cmd.kind === 'point' && cmd.latDeg !== undefined && cmd.lonDeg !== undefined) {
      const T = surfacePoint(cmd.latDeg, cmd.lonDeg);
      rebase('site', T);
      setGoal({ ...cur.current!, tilt: Math.min(cur.current!.tilt, 0.6), logRange: Math.log(Math.max(siteMinRange(cmd.latDeg) * 2, Math.exp(cur.current!.logRange) * 0.6)) });
      return;
    }
    if (cmd.kind === 'pole') {
      const T = new THREE.Vector3(0.0005, -1, 0).normalize();
      rebase('site', T);
      const f = frame('site', T);
      setGoal({ mode: 'site', target: T, heading: sunBearing(f), tilt: 0.45, logRange: Math.log(0.62 * Math.sqrt(portrait)) });
      return;
    }
    const p = r.observationPoint;
    const T = surfacePoint(p.latDeg, p.lonDeg, p.elevationM);
    rebase('site', T);
    const f = frame('site', T);
    if (cmd.kind === 'dive') {
      dive.current = { until: performance.now() + 1800 };
      setGoal({ mode: 'site', target: T, heading: sunBearing(f), tilt: TILT_MAX_SITE, logRange: Math.log(0.06) }, 5);
      // Frame-independent fallback: slow GPUs must not stretch the transition.
      const id = window.setTimeout(() => {
        dive.current = null;
        const st = useApp.getState();
        if (st.transitioning && st.mode === 'orbital') useApp.setState({ mode: 'surface', sceneReady: null });
      }, 2000);
      return () => window.clearTimeout(id);
    }
    // focus (optional range from a deep link)
    const rr = cmd.rangeKm ? cmd.rangeKm / MOON_KM : 0.26 * portrait;
    setGoal({ mode: 'site', target: T, heading: sunBearing(f), tilt: 0.6, logRange: Math.log(rr) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd.seq]);

  // Pointer, wheel, touch and keyboard input.
  useEffect(() => {
    const el = gl.domElement;
    el.tabIndex = 0;
    el.setAttribute('aria-label', 'Moon. Drag to rotate, scroll or pinch to zoom, right-drag or two fingers to pan, double-click to zoom to a point. Arrow keys rotate, plus and minus zoom.');
    const pointers = new Map<number, { x: number; y: number; button: number }>();
    let pinch = 0;
    let mid = { x: 0, y: 0 };

    const g = () => goal.current!;
    const rotate = (dx: number, dy: number) => {
      const p = g();
      const r = Math.exp(p.logRange);
      const k = p.mode === 'global' ? (0.9 * (r - 1)) / Math.max(1, size.height) : 2.2 / Math.max(1, size.height);
      p.heading += dx * k * (p.mode === 'global' ? -1 : 1);
      p.tilt += dy * k * (p.mode === 'global' ? -1 : -0.8);
      setGoal(p, 12);
    };
    const pan = (dx: number, dy: number) => {
      const p = g();
      if (p.mode !== 'site') return rotate(dx, dy);
      const r = Math.exp(p.logRange);
      const f = frame('site', p.target);
      const F = bearingVec(f, p.heading);
      const R = F.clone().cross(f.U).negate(); // screen-right on the ground
      const k = (r * 1.15) / Math.max(1, size.height);
      const move = R.multiplyScalar(-dx * k).add(F.multiplyScalar(dy * k));
      const radius = p.target.length();
      p.target.add(move).setLength(radius);
      cur.current!.target.copy(p.target);
      cur.current = poseFrom('site', p.target, camera.position, cur.current!.heading);
      setGoal(p, 12);
    };
    const zoom = (zoomRef.current = (factor: number) => {
      const p = g();
      const c = cur.current!;
      // Hand over only once the camera itself (not just the goal) has reached the limit,
      // so the rebased pose never needs clamping.
      const near = (lim: number) => Math.abs(c.logRange - Math.log(lim)) < 0.04;
      if (p.mode === 'global' && factor < 1 && p.logRange <= Math.log(GLOBAL_MIN) + 1e-3 && near(GLOBAL_MIN)) {
        // Hand over to site mode on the sub-camera point.
        const T = camera.position.clone().normalize();
        rebase('site', T);
      } else if (p.mode === 'site' && factor > 1 && p.logRange >= Math.log(SITE_MAX) - 1e-3 && near(SITE_MAX)) {
        rebase('global', new THREE.Vector3());
      }
      const q = g();
      q.logRange += Math.log(factor);
      setGoal(q, 10);
    });

    const down = (e: PointerEvent) => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort (e.g. synthetic pointers) */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      dive.current = null;
    };
    let raf = 0;
    const hover = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, camera);
        const hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
        useCursorLL.setState({ ll: hit ? vecToLonLat([hit.x, -hit.z, hit.y]) : null });
      });
    };
    const leave = () => useCursorLL.setState({ ll: null });
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') hover(e);
        return;
      }
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (pinch > 0 && d > 0) zoom(pinch / d);
        pan(m.x - mid.x, m.y - mid.y);
        pinch = d;
        mid = m;
        return;
      }
      if (prev.button === 2 || e.shiftKey) pan(dx, dy);
      else rotate(dx, dy);
    };
    const upH = (e: PointerEvent) => {
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      pointers.delete(e.pointerId);
      pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoom(Math.exp(THREE.MathUtils.clamp(dy, -200, 200) * (e.ctrlKey ? 0.006 : 0.0016)));
    };
    const dbl = (e: MouseEvent) => {
      // Ray–sphere hit test → zoom toward that point.
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
      if (!hit) return;
      const ll = vecToLonLat([hit.x, -hit.z, hit.y]);
      useApp.getState().pointCamera(ll.latDeg, ll.lonDeg);
    };
    const key = (e: KeyboardEvent) => {
      const s = e.shiftKey ? 4 : 1;
      if (e.key === 'ArrowLeft') (e.altKey ? pan : rotate)(-30 * s, 0);
      else if (e.key === 'ArrowRight') (e.altKey ? pan : rotate)(30 * s, 0);
      else if (e.key === 'ArrowUp') (e.altKey ? pan : rotate)(0, -30 * s);
      else if (e.key === 'ArrowDown') (e.altKey ? pan : rotate)(0, 30 * s);
      else if (e.key === '+' || e.key === '=') zoom(0.8);
      else if (e.key === '-' || e.key === '_') zoom(1.25);
      else return;
      e.preventDefault();
    };
    const ctx = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', upH);
    el.addEventListener('pointercancel', upH);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', dbl);
    el.addEventListener('keydown', key);
    el.addEventListener('contextmenu', ctx);
    el.addEventListener('pointerleave', leave);
    el.style.touchAction = 'none';
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', upH);
      el.removeEventListener('pointercancel', upH);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('dblclick', dbl);
      el.removeEventListener('keydown', key);
      el.removeEventListener('contextmenu', ctx);
      el.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, size.height]);

  // Damped follow of the goal pose.
  const last = useRef<{ r: number; lat: number; lon: number; mode: string } | null>(null);
  useFrame((_, dtRaw) => {
    const c = cur.current;
    const gp = goal.current;
    if (!c || !gp) return;
    const dt = Math.min(dtRaw, 0.1);
    const k = 1 - Math.exp(-dt * rate.current);
    let moving = false;
    const step = (a: number, b: number) => {
      const d = b - a;
      if (Math.abs(d) > 1e-5) moving = true;
      return a + d * k;
    };
    c.heading = c.heading + wrapPi(gp.heading - c.heading) * k;
    if (Math.abs(wrapPi(gp.heading - c.heading)) > 1e-5) moving = true;
    c.tilt = step(c.tilt, gp.tilt);
    c.logRange = step(c.logRange, gp.logRange);
    if (c.target.distanceToSquared(gp.target) > 1e-12) {
      c.target.lerp(gp.target, k);
      moving = true;
    }
    c.mode = gp.mode;

    const { pos, up: u } = poseCamera(c);
    camera.position.copy(pos);
    look.current.lerp(c.target, Math.min(1, k * 1.6));
    up.current.lerp(u, Math.min(1, k * 1.6)).normalize();
    if (look.current.distanceToSquared(c.target) > 1e-12) moving = true;
    // The up vector is smoothed too: keep rendering until it has converged, or the view is
    // left slightly rolled and the same pose no longer gives the same picture.
    if (up.current.distanceToSquared(u) > 1e-12) moving = true;
    camera.up.copy(up.current);
    camera.lookAt(look.current);
    const cam = camera as THREE.PerspectiveCamera;
    const alt = Math.max(1e-4, pos.length() - 1);
    cam.near = THREE.MathUtils.clamp(alt * 0.3, 0.0002, 0.5);
    cam.far = pos.length() + 2;
    cam.updateProjectionMatrix();

    // Dive → Surface hand-over.
    if (dive.current && (c.logRange < Math.log(0.075) || performance.now() > dive.current.until)) {
      dive.current = null;
      if (useApp.getState().transitioning) useApp.setState({ mode: 'surface', sceneReady: null });
    }

    // Telemetry for the UI (only on meaningful change).
    const tgt = c.mode === 'site' ? c.target : pos.clone().normalize();
    const ll = vecToLonLat([tgt.x, -tgt.z, tgt.y]);
    const rKm = (c.mode === 'site' ? Math.exp(c.logRange) : alt) * MOON_KM;
    const mpp = (rKm * 1000 * 2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, size.height);
    const l = last.current;
    if (!l || Math.abs(l.r - rKm) / rKm > 0.01 || Math.abs(l.lat - ll.latDeg) > 0.05 || Math.abs(l.lon - ll.lonDeg) > 0.2 || l.mode !== c.mode) {
      last.current = { r: rKm, lat: ll.latDeg, lon: ll.lonDeg, mode: c.mode };
      useCameraInfo.setState({ mode: c.mode, latDeg: ll.latDeg, lonDeg: ll.lonDeg, rangeKm: rKm, metersPerPixel: mpp });
    }
    if (import.meta.env.DEV) Object.assign(window as object, { __cam: { c, alt }, __globe: { cur, goal, look, up } });
    if (moving || dive.current) invalidate();
  });

  return null;
}
