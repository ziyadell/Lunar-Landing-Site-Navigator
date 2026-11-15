import { expect, test, type Page } from '@playwright/test';
import { modeButton, openApp, query } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** Elements that are visible but extend past the viewport's left or right edge. */
const offscreen = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a, input, [role=button]')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[aria-hidden=true], .gm-label, .gm-dot, .gm-cluster');
      })
      .filter((e) => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; })
      .map((e) => (e.getAttribute('aria-label') || e.innerText || e.className).toString().slice(0, 40)),
  );

test('390x844: no horizontal scrolling and no control off screen, in every view', async ({ page }) => {
  await openApp(page);
  for (const mode of ['Orbit', 'Surface', 'Analysis'] as const) {
    if (mode !== 'Orbit') {
      await page.evaluate(() => document.querySelector<HTMLElement>('.more__btn') && document.body.click());
      await modeButton(page, mode).click();
      await expect.poll(() => query(page).get('mode')).toBe(mode === 'Surface' ? 'surface' : 'analysis');
      await page.waitForTimeout(2500);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${mode}: page width`).toBeLessThanOrEqual(390);
    expect(await offscreen(page), `${mode}: controls off screen`).toEqual([]);
  }
});

test('390x844: Surface tool strip keeps every icon inside the strip', async ({ page }) => {
  await openApp(page, '&mode=surface');
  const strip = page.locator('.tool-col').first();
  await expect(strip).toBeVisible({ timeout: 60_000 });
  const out = await strip.evaluate((col) => {
    const c = col.getBoundingClientRect();
    return [...col.querySelectorAll('button')]
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.height > 0 && (r.top < c.top - 1 || r.bottom > c.bottom + 1)).length;
  });
  expect(out).toBe(0);
});

test('390x844: a date can be picked from the calendar', async ({ page }) => {
  await openApp(page);
  await page.locator('.timepill__when').click(); // on phones the button is named by the date it shows
  await page.locator('.datef__btn').first().click();
  const cal = page.getByRole('dialog').filter({ has: page.locator('[role=grid], table, button') }).last();
  await expect(cal).toBeVisible();
  await cal.getByRole('button', { name: /22/ }).first().click();
  await expect.poll(() => query(page).get('t')).toMatch(/^2026-11-22T/);
});

test('390x844: Analysis scenario cards fit the screen', async ({ page }) => {
  await openApp(page, '&mode=analysis');
  await expect(page.locator('.sel__btn').first()).toBeVisible();
  const widths = await page.locator('.sel__btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
  expect(widths.length).toBeGreaterThan(0);
  for (const r of widths) expect(r).toBeLessThanOrEqual(390);
});
