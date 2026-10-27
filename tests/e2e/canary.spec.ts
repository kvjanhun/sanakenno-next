import { expect, test } from '@playwright/test';

test('renders live Kysely + Hono RPC system status in the React canary card', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Sanakenno 2\.0/i })).toBeVisible();
  await expect(page.getByTestId('canary-status')).toContainText('kysely-sqlite');
  await expect(page.getByTestId('puzzle-count')).toHaveText('2');
});
