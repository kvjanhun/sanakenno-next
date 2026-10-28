import { expect, test } from '@playwright/test';

test.describe('PWA & Shell Verification', () => {
  test('serves installable manifest with valid icons and metadata', async ({ page, baseURL }) => {
    await page.goto('/');

    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);
    const manifestHref = await manifestLink.getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifestUrl = new URL(manifestHref!, baseURL!).toString();
    const manifestRes = await page.request.get(manifestUrl);
    expect(manifestRes.ok()).toBe(true);
    const manifest = (await manifestRes.json()) as {
      name: string;
      short_name: string;
      display: string;
      start_url: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string; purpose?: string }>;
    };

    expect(manifest.name).toBe('Sanakenno');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

    const themeMeta = page.locator('meta[name="theme-color"]');
    await expect(themeMeta).toHaveAttribute('content', '#3A3A3A');

    const appleMeta = page.locator('meta[name="apple-mobile-web-app-capable"]');
    await expect(appleMeta).toHaveAttribute('content', 'yes');
  });

  test('preserves rendered gameplay shell when network transitions offline', async ({
    context,
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('svg polygon').first()).toBeVisible();

    await context.setOffline(true);
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.locator('svg polygon').first()).toBeVisible();

    await context.setOffline(false);
  });
});
