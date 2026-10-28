import { expect, test } from '@playwright/test';

test('loads daily puzzle, submits a valid Finnish word, updates score/rank, and persists across reload', async ({
  page,
}) => {
  await page.goto('/');

  const honeycomb = page.getByRole('img', { name: /Kirjainkenno/i });
  await expect(honeycomb).toBeVisible();
  await expect(page.getByTestId('score-display')).toHaveText('0 pistettä');
  await expect(page.getByTestId('rank-button')).toContainText('Etsi sanoja!');

  // Determine which seeded puzzle slot is active today by checking the center hex cell
  const isCenterA =
    (await page.getByTestId('hex-cell-a').count()) > 0 &&
    (await page.getByTestId('hex-cell-a').getAttribute('data-hex-center')) === 'true';

  const wordToSubmit = isCenterA ? 'kansallinen' : 'keskihieno';
  const expectedScore = isCenterA ? '18 pistettä' : '17 pistettä';

  await page.keyboard.type(wordToSubmit);
  await expect(page.getByTestId('word-input')).toHaveText(wordToSubmit.toUpperCase());

  await page.keyboard.press('Enter');

  await expect(page.getByTestId('score-display')).toHaveText(expectedScore);
  await expect(page.getByTestId('rank-button')).not.toContainText('Etsi sanoja!');
  await expect(page.getByTestId('found-words-count')).toHaveText('1');
  await expect(
    page.getByRole('link', {
      name: `Avaa sanan "${wordToSubmit}" määritelmä Kotuksessa`,
    }),
  ).toBeVisible();

  // Reload page and verify progress is restored from localStorage
  await page.reload();

  await expect(page.getByTestId('score-display')).toHaveText(expectedScore);
  await expect(page.getByTestId('rank-button')).not.toContainText('Etsi sanoja!');
  await expect(page.getByTestId('found-words-count')).toHaveText('1');
});
