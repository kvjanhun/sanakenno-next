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

test('mobile viewport has no vertical scroll and honeycomb remains stationary across hint tier upgrades', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const honeycomb = page.getByRole('img', { name: /Kirjainkenno/i });
  await expect(honeycomb).toBeVisible();

  // Active play fits within mobile viewport without vertical scroll
  const isScrollable = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight,
  );
  expect(isScrollable).toBe(false);

  // Capture initial Honeycomb position in Tier 0
  const initialBox = await honeycomb.boundingBox();
  expect(initialBox).not.toBeNull();
  const initialY = initialBox!.y;

  // Upgrade to Tier 1
  await page.getByTestId('activate-hints-button').click();
  await page.waitForTimeout(100);
  const tier1Box = await honeycomb.boundingBox();
  expect(tier1Box!.y).toBe(initialY);

  // Upgrade to Tier 2
  await page.getByTestId('upgrade-tier-button').click();
  await page.waitForTimeout(100);
  const tier2Box = await honeycomb.boundingBox();
  expect(tier2Box!.y).toBe(initialY);

  // Upgrade to Tier 3
  await page.getByTestId('upgrade-tier-button').click();
  await page.waitForTimeout(100);
  const tier3Box = await honeycomb.boundingBox();
  expect(tier3Box!.y).toBe(initialY);

  // Space key shuffles letters without inserting characters in word input
  await page.keyboard.press('Space');
  await expect(page.getByTestId('word-input')).toHaveText('|');
});
