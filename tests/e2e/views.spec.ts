import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { modeButton, openApp, query } from './helpers';

test.describe('Orbit', () => {
  test('shows the nine regions, live readings and the 2027 ranking', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.gm-label')).toHaveCount(9);
    const sun = page.locator('.cond__body--sun');
    await expect(sun).toContainText('Visible');
    await expect(sun).toContainText('above horizon');
    await expect(page.locator('.cond__body--earth')).toContainText('Visible');
    await expect(page.locator('.rank__row')).toHaveCount(9);
    await page.locator('.rank__tab', { hasText: /^Earth$/ }).click();
    await expect(page.locator('.rank')).toContainText('Share of 2027 with Earth above the terrain horizon');
  });

  test('changes region from the picker and keeps it in the URL', async ({ page }) => {
    await openApp(page);
    await page.locator('.rpick__btn').click();
    await page.locator('.rpick__opt', { hasText: 'Nobile Rim 1' }).click();
    await expect(page.locator('.deck-card__titles')).toContainText('Nobile Rim 1');
    await expect.poll(() => query(page).get('site')).toBe('nobile-rim-1');
  });

  test('lists every value under All measurements', async ({ page }) => {
    await openApp(page);
    await page.locator('.cond__more').click();
    const panel = page.getByRole('complementary', { name: 'Measurements' });
    for (const label of ['Elevation', 'Azimuth', 'Terrain skyline', 'Clearance', 'Disc above skyline']) await expect(panel).toContainText(label);
  });
});

test.describe('Surface', () => {
  test('stands at the observation point with the skyline and Sun label', async ({ page }) => {
    await openApp(page);
    await modeButton(page, 'Surface').click();
    await expect.poll(() => query(page).get('mode')).toBe('surface');
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.locator('#sky-label-sun')).toBeAttached({ timeout: 60_000 });
    await expect(page.getByText(/SKYLINE 360°/i)).toBeVisible();
    const heading = page.getByText(/Heading \d+°/);
    const before = await heading.textContent();
    await page.getByRole('button', { name: 'Face Earth' }).click();
    await expect.poll(() => heading.textContent(), { timeout: 15_000 }).not.toBe(before);
  });
});

test.describe('Analysis', () => {
  test('compares two scenarios and survives a reload through the URL', async ({ page }) => {
    await openApp(page);
    await modeButton(page, 'Analysis').click();
    await expect(page.getByRole('heading', { name: /How much sunlight and Earth contact/ })).toBeVisible();
    await page.locator('.sel__btn').nth(2).click();
    await page.locator('.sel__opt-label', { hasText: /^Mons Mouton$/ }).click();
    await page.locator('.seg__btn').nth(6).click(); // scenario B: 90 d
    await expect(page.locator('.glance-wrap')).toContainText('Mons Mouton');
    await expect.poll(() => query(page).get('b')).toMatch(/^mons-mouton,\d{4}-\d{2}-\d{2},90$/);
    const before = await page.locator('.glance-wrap').innerText();

    await page.reload(); // the URL now says mode=analysis, so no welcome screen
    await expect(page.locator('.sel__btn').nth(2)).toContainText('Mons Mouton');
    await expect(page.locator('.seg__btn').nth(6)).toHaveClass(/is-active/);
    await expect.poll(() => page.locator('.glance-wrap').innerText(), { timeout: 90_000 }).toBe(before);
  });

  test('opens a shared link with both scenarios', async ({ page }) => {
    await openApp(page, '&mode=analysis&a=nobile-rim-2,2027-03-01,7&b=haworth,2027-06-01,365');
    await expect(page.locator('.sel__btn').nth(0)).toContainText('Nobile Rim 2');
    await expect(page.locator('.sel__btn').nth(2)).toContainText('Haworth');
    await expect(page.locator('.datef__input').nth(0)).toHaveValue('2027-03-01');
    await expect(page.locator('.datef__input').nth(1)).toHaveValue('2027-06-01');
    await expect(page.locator('.seg__btn').nth(0)).toHaveClass(/is-active/);
    await expect(page.locator('.seg__btn').nth(7)).toHaveClass(/is-active/);
  });

  test('exports the scenario as CSV', async ({ page }) => {
    await openApp(page, '&mode=analysis&a=malapert-massif,2027-01-01,7&b=nobile-rim-1,2027-01-01,7');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).first().click()]);
    expect(download.suggestedFilename()).toBe('malapert-massif_2027-01-01_7d.csv');
    const lines = readFileSync((await download.path())!, 'utf8').trim().split(/\r?\n/);
    const header = lines.find((l) => /sun/i.test(l) && /earth/i.test(l) && l.includes(','))!;
    expect(header).toBeTruthy();
    const cols = header.split(',').length;
    const rows = lines.slice(lines.indexOf(header) + 1);
    expect(rows.length).toBeGreaterThan(100); // 7 days of samples
    expect(rows.every((r) => r.split(',').length === cols)).toBe(true);
  });
});
