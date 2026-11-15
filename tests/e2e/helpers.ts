import { expect, type Page } from '@playwright/test';

/** A fixed, daylit moment at Malapert Massif, so readings are deterministic. */
export const AT = '2026-11-20T12:00Z';

/** Opens the app in English with sound off, past the welcome screen, readings loaded. */
export async function openApp(page: Page, query = '') {
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem('lsn.settings.v2') ?? '{}');
    if (!s.__e2e) {
      Object.assign(s, { __e2e: true, lang: 'en', sound: false, audioGuide: false, voice: 'captions' });
      localStorage.setItem('lsn.settings.v2', JSON.stringify(s));
    }
  });
  await page.goto(`/?t=${AT}${query}`);
  // The welcome screen only appears in Orbit; a link straight into Surface or Analysis skips it.
  if (!/mode=(surface|analysis)/.test(query)) {
    await page.locator('.welcome__enter').click();
    await expect(page.locator('.welcome__enter')).toHaveCount(0);
  }
  await dismissIntro(page);
}

export async function dismissIntro(page: Page) {
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('.intro__close')?.click();
    document.querySelectorAll<HTMLElement>('.welcome-caption button').forEach((b) => b.click());
  });
}

export const modeButton = (page: Page, name: 'Orbit' | 'Surface' | 'Analysis') =>
  page.locator('.modenav__btn', { hasText: new RegExp(`^\\s*${name}\\s*$`) });

export const query = (page: Page) => new URL(page.url()).searchParams;
