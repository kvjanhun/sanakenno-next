import { expect, test } from '@playwright/test';

test('admin login, puzzle preview, puzzle save, schedule view, and logout', async ({ page }) => {
  await page.goto('/#/admin');

  // Login page should be displayed
  await expect(page.getByRole('heading', { name: 'Sanakenno Admin' })).toBeVisible();
  await expect(page.locator('#admin-username')).toBeVisible();

  await page.locator('#admin-username').fill('admin');
  await page.locator('#admin-password').fill('adminpassword123');
  await page.getByRole('button', { name: 'Kirjaudu' }).click();

  // Admin layout should load with navigation tabs
  await expect(page.getByRole('button', { name: 'Puzzlet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aikataulu' })).toBeVisible();

  // Test Puzzle Editor: preview and save
  await page.locator('#puzzle-letters').fill('a,e,i,k,l,n,s');
  await page.locator('#puzzle-center').fill('k');

  // Preview puzzle
  await page.getByRole('button', { name: 'Esikatsele' }).click();
  await expect(page.getByText(/Sanoja: \d+/i)).toBeVisible();
  await expect(page.getByText(/Maksimipisteet: \d+/i)).toBeVisible();

  // Save puzzle (exercises duplicate protection and force override)
  await page.getByRole('button', { name: 'Tallenna peli' }).click();
  await expect(page.getByRole('button', { name: 'Luo silti (Ohita varoitus)' })).toBeVisible();
  await page.getByRole('button', { name: 'Luo silti (Ohita varoitus)' }).click();
  await expect(page.getByText('Peli tallennettu onnistuneesti')).toBeVisible();

  // Switch to Schedule tab
  await page.getByRole('button', { name: 'Aikataulu' }).click();
  await expect(page.getByRole('heading', { name: '14 päivän kierrosaikataulu' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  // Switch back to Puzzlet tab and clean up slot 3 to maintain test isolation
  await page.getByRole('button', { name: 'Puzzlet' }).click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#puzzle-slot').fill('3');
  await page.getByRole('button', { name: 'Poista peli' }).click();
  await expect(page.getByText('Slotti 3 poistettu.')).toBeVisible();

  // Switch to Tilastot tab
  await page.getByRole('button', { name: 'Tilastot' }).click();
  await expect(page.getByRole('heading', { name: 'Saavutustilastot' })).toBeVisible();

  // Switch to Sanadata tab
  await page.getByRole('button', { name: 'Sanadata' }).click();
  await expect(page.getByRole('heading', { name: 'Pelitilastot & Sanadata' })).toBeVisible();
  await page.getByRole('button', { name: 'Löydetyt sanat' }).click();
  await expect(page.getByRole('button', { name: 'Vaikeimmat ensin' })).toBeVisible();

  // Test Logout
  await page.getByRole('button', { name: 'Kirjaudu ulos' }).click();
  await expect(page.locator('#admin-username')).toBeVisible();
});
