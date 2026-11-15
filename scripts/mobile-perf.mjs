// Phone-sized memory and frame-rate check (390 x 844, touch, 4x CPU slowdown) against a running app.
//   npx vite --port 5199   then   node scripts/mobile-perf.mjs [baseUrl]
// Measures, per view: frame rate while the camera moves, and JS heap after garbage collection,
// then repeats 12 region switches to see whether memory keeps growing.
// shortcut: a desktop GPU stands in for a phone GPU, so frame rates are indicative only; use a real handset for final numbers.
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:5199';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--enable-precise-memory-info'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  const s = JSON.parse(localStorage.getItem('lsn.settings.v2') ?? '{}');
  Object.assign(s, { lang: 'en', sound: false, audioGuide: false, voice: 'captions' });
  localStorage.setItem('lsn.settings.v2', JSON.stringify(s));
});
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Performance.enable');

const MB = (b) => (b / 1048576).toFixed(1);
async function heap() {
  await cdp.send('HeapProfiler.collectGarbage');
  await p.waitForTimeout(500);
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  return m.JSHeapUsedSize;
}
/** Frame times while dragging the view for `ms`. */
async function fps(ms) {
  await p.evaluate(() => {
    window.__ft = [];
    let last = performance.now();
    const tick = (t) => { window.__ft.push(t - last); last = t; if (window.__ftOn) requestAnimationFrame(tick); };
    window.__ftOn = true; requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  await p.mouse.move(195, 420);
  await p.mouse.down();
  while (Date.now() - t0 < ms) { await p.mouse.move(195 + 90 * Math.sin((Date.now() - t0) / 700), 420, { steps: 2 }); }
  await p.mouse.up();
  const ft = await p.evaluate(() => { window.__ftOn = false; return window.__ft.slice(5); });
  ft.sort((a, b) => a - b);
  const q = (x) => ft[Math.min(ft.length - 1, Math.floor(ft.length * x))];
  return { frames: ft.length, fps: (1000 * ft.length / ft.reduce((a, b) => a + b, 0)).toFixed(1), p50: q(0.5).toFixed(1), p95: q(0.95).toFixed(1), over50: ft.filter((x) => x > 50).length };
}
const idle = () => p.waitForFunction(() => !document.querySelector('.loadchip') && !/Loading /i.test(document.body.innerText), null, { timeout: 180000 }).catch(() => {});

await p.goto(`${BASE}/?t=2026-11-20T12:00Z`);
await p.locator('.welcome__enter').click();
await p.waitForTimeout(3000); await idle();
await p.evaluate(() => { document.querySelector('.intro__close')?.click(); document.querySelectorAll('.welcome-caption button').forEach((b) => b.click()); });
const gl = await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g?.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
console.log('GPU:', gl);

const out = [];
const h0 = await heap();
out.push(['Orbit', await fps(8000), MB(h0)]);
await p.locator('.modenav__btn', { hasText: 'Surface' }).click();
await p.waitForTimeout(6000); await idle();
out.push(['Surface', await fps(8000), MB(await heap())]);
await p.locator('.modenav__btn', { hasText: 'Orbit' }).click();
await p.waitForTimeout(4000); await idle();
const hBefore = await heap();
for (let i = 0; i < 12; i++) { await p.getByRole('button', { name: 'Next region' }).click(); await p.waitForTimeout(2500); }
await idle();
const hAfter = await heap();
for (let i = 0; i < 12; i++) { await p.getByRole('button', { name: 'Next region' }).click(); await p.waitForTimeout(2500); }
await idle();
const hAfter2 = await heap();
out.push(['Orbit after 24 region switches', await fps(6000), MB(hAfter2)]);

console.log('\nview | frames | mean fps | p50 ms | p95 ms | frames > 50 ms | JS heap MB');
for (const [v, f, h] of out) console.log(`${v} | ${f.frames} | ${f.fps} | ${f.p50} | ${f.p95} | ${f.over50} | ${h}`);
console.log(`\nJS heap: before switching ${MB(hBefore)} MB, after 12 switches ${MB(hAfter)} MB, after 24 switches ${MB(hAfter2)} MB`);
console.log(`growth over the second 12 switches: ${MB(hAfter2 - hAfter)} MB`);
await browser.close();
