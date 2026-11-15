import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { modeButton, openApp, query } from './helpers';

const focused = (page: Page) => page.evaluate(() => {
  const e = document.activeElement as HTMLElement | null;
  return e ? `${e.getAttribute('aria-label') ?? ''}|${(e.innerText ?? '').trim()}` : '';
});

async function tabTo(page: Page, match: RegExp, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (match.test(await focused(page))) return;
  }
  throw new Error(`Tab never reached ${match}`);
}

test.describe('keyboard', () => {
  test('Tab reaches the mode switcher and Enter changes the view', async ({ page }) => {
    await openApp(page);
    await page.locator('body').focus();
    await tabTo(page, /Stand at the observation point|^\|Surface$/);
    await page.keyboard.press('Enter');
    await expect.poll(() => query(page).get('mode')).toBe('surface');
  });

  test('region picker: Enter opens, arrows move, Enter selects, Escape cancels', async ({ page }) => {
    await openApp(page);
    await page.locator('.rpick__btn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.rpick__panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.rpick__panel')).toHaveCount(0);
    await expect(page.locator('.deck-card__titles')).toContainText('Malapert Massif');

    await page.locator('.rpick__btn').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('.rpick__panel')).toHaveCount(0);
    await expect(page.locator('.deck-card__titles')).not.toContainText('Malapert Massif');
    await expect.poll(() => query(page).get('site')).not.toBe('malapert-massif');
  });

  test('Analysis dropdown and timeline work from the keyboard', async ({ page }) => {
    await openApp(page, '&mode=analysis&a=malapert-massif,2027-01-01,7&b=nobile-rim-1,2027-01-01,7');
    const b = page.locator('.sel__btn').nth(2);
    await b.focus();
    await page.keyboard.press('ArrowDown');
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(b).toContainText('Nobile Rim 1');

    await b.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(b).not.toContainText('Nobile Rim 1');
    await expect.poll(() => query(page).get('b')).not.toMatch(/^nobile-rim-1,/);

    const slider = page.locator('.timeline--A').getByRole('slider');
    await slider.scrollIntoViewIfNeeded();
    await slider.focus();
    await page.keyboard.press('Home');
    const start = await slider.getAttribute('aria-valuenow');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => slider.getAttribute('aria-valuenow')).not.toBe(start);
    await expect(slider).toHaveAttribute('aria-valuetext', /Sun (visible|not visible), Earth (visible|not visible)/);
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', (await slider.getAttribute('aria-valuemax'))!);
  });

  test('calendar: arrow keys move the day and Enter chooses it', async ({ page }) => {
    await openApp(page, '&mode=analysis&a=malapert-massif,2027-01-01,7&b=nobile-rim-1,2027-01-01,7');
    await page.locator('.datef__btn').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog').last()).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator('.datef__input').first()).toHaveValue('2027-01-03');
  });
});

test.describe('screen-reader names', () => {
  const RULES = ['button-name', 'link-name', 'input-button-name', 'label', 'image-alt', 'aria-allowed-attr', 'aria-required-attr',
    'aria-valid-attr', 'aria-valid-attr-value', 'aria-roles', 'aria-hidden-focus', 'aria-command-name', 'aria-toggle-field-name',
    'aria-input-field-name', 'select-name', 'svg-img-alt', 'role-img-alt', 'duplicate-id-aria', 'list', 'listitem'];
  for (const mode of ['Orbit', 'Surface', 'Analysis'] as const) {
    test(`${mode}: every control has an accessible name and valid ARIA`, async ({ page }) => {
      await openApp(page);
      if (mode !== 'Orbit') {
        await modeButton(page, mode).click();
        await page.waitForTimeout(4000);
      }
      const r = await new AxeBuilder({ page }).withRules(RULES).analyze();
      const found = r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join(' ; ')}`);
      expect(found).toEqual([]);
    });
  }
});
