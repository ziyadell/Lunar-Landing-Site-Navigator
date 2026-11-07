// Marker drift test, run in the page (dev build) by the headless harness.
// 1) "same frame": during a 360° orbit, each visible marker's DOM centre must equal a
//    fresh projection of its lunar world point with the camera of that rendered frame.
// 2) "return": after the orbit, the same pose must put every marker on the same pixel.
// Returns max errors in CSS px.
(async () => {
  const g = window.__globe, cam = window.__camera, inv = window.__invalidate, pts = window.__markerPts;
  const host = document.querySelector('.viewport').getBoundingClientRect();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const setPose = (p) => { Object.assign(g.cur.current, p); Object.assign(g.goal.current, p); inv(); };
  const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2 - host.left, r.top + r.height / 2 - host.top]; };
  const measure = () => {
    cam.updateMatrixWorld();
    const out = {};
    for (const p of pts) {
      const dot = document.getElementById(`gm-dot-${p.id}`);
      if (!dot || dot.style.visibility !== 'visible') continue;
      const v = p.world.clone().project(cam);
      const ex = (v.x * 0.5 + 0.5) * host.width, ey = (-v.y * 0.5 + 0.5) * host.height;
      const [dx, dy] = centre(dot);
      out[p.id] = { dom: [dx, dy], err: Math.hypot(dx - ex, dy - ey) };
    }
    return out;
  };
  // Wait until the camera controller has converged: aim on target, up vector stable, and
  // several frames actually rendered (software rendering can be slower than any fixed delay).
  const gl = window.__gl;
  const settle = async () => {
    let prevUp = null, frames0 = gl.info.render.frame;
    for (let i = 0; i < 150; i++) {
      inv();
      await wait(200);
      const up = g.up.current.clone();
      const aimed = g.look.current.distanceTo(g.cur.current.target) < 1e-7;
      const upStable = prevUp && up.distanceTo(prevUp) < 1e-9;
      if (aimed && upStable && gl.info.render.frame - frames0 > 20) return true;
      prevUp = up;
    }
    return false;
  };  // Freeze the controller at its current goal so the start pose is exactly reproducible.
  const start = { ...g.goal.current, target: g.goal.current.target.clone() };
  setPose(start);
  await settle();
  const camBefore = cam.matrixWorld.elements.slice();
  const before = measure();
  let worstSameFrame = 0, samples = 0, seenIds = new Set();
  const steps = 72;
  for (let k = 1; k <= steps; k++) {
    setPose({ heading: start.heading + (2 * Math.PI * k) / steps, tilt: start.tilt + 0.15 * Math.sin((2 * Math.PI * k) / steps) });
    await wait(120);
    const m = measure();
    for (const [id, v] of Object.entries(m)) { worstSameFrame = Math.max(worstSameFrame, v.err); samples++; seenIds.add(id); }
  }
  const modeDuring = g.cur.current.mode;
  setPose({ ...start, target: start.target.clone() });
  const settled = await settle();
  const camDiff = Math.max(...cam.matrixWorld.elements.map((v, k) => Math.abs(v - camBefore[k])));
  const after = measure();
  let worstReturn = 0, compared = 0;
  for (const id of Object.keys(before)) if (after[id]) { compared++; worstReturn = Math.max(worstReturn, Math.hypot(after[id].dom[0] - before[id].dom[0], after[id].dom[1] - before[id].dom[1])); }
  return { worstSameFramePx: +worstSameFrame.toFixed(3), samples, markersSeen: seenIds.size, worstReturnPx: +worstReturn.toFixed(3), markersCompared: compared, cameraSettled: settled, cameraMatrixMaxDiff: camDiff, startMode: start.mode, modeAfterOrbit: modeDuring };
})();
