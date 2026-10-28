import { expect, test } from '@playwright/test';

test('switches themes and palettes, opens RulesModal and StatsModal, and loads a past puzzle from ArchiveModal', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('img', { name: /Kirjainkenno/i })).toBeVisible();

  // 1. Open SettingsModal and switch palette + theme
  await page.getByRole('button', { name: 'Asetukset' }).click();
  const settingsDialog = page.getByRole('dialog', { name: 'Asetukset' });
  await expect(settingsDialog).toBeVisible();

  await settingsDialog.getByRole('radio', { name: 'Meri' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'meri');

  await settingsDialog.getByRole('radio', { name: 'Tumma' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await settingsDialog.getByRole('button', { name: 'Sulje' }).click();
  await expect(settingsDialog).not.toBeVisible();

  // 2. Open RulesModal and verify content
  await page.getByRole('button', { name: 'Säännöt' }).click();
  const rulesDialog = page.getByRole('dialog', { name: 'Pelin säännöt' });
  await expect(rulesDialog).toBeVisible();
  await expect(rulesDialog.getByText('palo-ovi')).toBeVisible();
  await rulesDialog.getByRole('button', { name: 'Sulje' }).click();
  await expect(rulesDialog).not.toBeVisible();

  // 3. Open StatsModal and verify empty state
  await page.getByRole('button', { name: 'Tilastot' }).click();
  const statsDialog = page.getByRole('dialog', { name: 'Tilastot' });
  await expect(statsDialog).toBeVisible();
  await expect(statsDialog.getByText('Ei vielä tilastoja. Pelaa kenno!')).toBeVisible();
  await statsDialog.getByRole('button', { name: 'Sulje' }).click();
  await expect(statsDialog).not.toBeVisible();

  // 4. Open ArchiveModal, select a past puzzle, and load it via Pelaa
  await page.getByRole('button', { name: 'Arkisto' }).click();
  const archiveDialog = page.getByRole('dialog', { name: 'Arkisto' });
  await expect(archiveDialog).toBeVisible();
  await expect(archiveDialog.getByText('tänään')).toBeVisible();

  // Click the second entry (yesterday's puzzle)
  const archiveButtons = archiveDialog.locator('button[data-testid^="archive-entry-"]');
  await expect(archiveButtons).toHaveCount(2);
  await archiveButtons.nth(1).click();

  // Action sheet opens with Pelaa and Näytä vastaukset
  await expect(page.getByRole('button', { name: 'Pelaa', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pelaa', exact: true }).click();

  // Archive modal closes and header shows "Takaisin tähän päivään" button
  await expect(archiveDialog).not.toBeVisible();
  const backButton = page.getByRole('button', { name: 'Takaisin tähän päivään' });
  await expect(backButton).toBeVisible();

  // Click back button to return to today's puzzle
  await backButton.click();
  await expect(backButton).not.toBeVisible();
  await expect(page.getByTestId('puzzle-header')).toContainText('Sanakenno');
});
