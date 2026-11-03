import { expect, test, type Page } from '@playwright/test';

async function phase(page: Page, title: string): Promise<void> {
  await expect(page.getByTestId('phase-title')).toHaveText(title, { timeout: 30_000 });
}

test('one person practises a whole quick match against three bots @practice', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice with bots' }).click();
  await expect(page.getByRole('heading', { name: 'Practice with bots' })).toBeVisible();
  await page.getByLabel('Nickname').fill('Solo');
  await page.getByRole('radio', { name: 'Quick' }).click();
  await page.getByRole('button', { name: 'Start practice' }).click();

  // The lobby fills itself with three bots, all ready, so the match can start at once.
  await expect(page.getByText('BOT', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^Fill with/ })).toHaveCount(0);
  const start = page.getByRole('button', { name: 'Start match' });
  await expect(start).toBeEnabled();
  await start.click();

  await phase(page, 'Briefing');
  await expect(page.getByTestId('role-card')).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  for (let round = 1; round <= 3; round++) {
    await phase(page, 'Intelligence');
    await expect(page.getByText(`Operation ${round} of 3`, { exact: false })).toHaveCount(1);
    await page.getByRole('button', { name: 'Done studying' }).click();
    await phase(page, 'Negotiation');
    await page.getByRole('button', { name: 'Done negotiating' }).click();
    await phase(page, 'Sealed commitment');
    await page.getByTestId('commit-2').click();
    await page.getByRole('button', { name: /^Seal \d credits?$/ }).click();
    await page.getByRole('button', { name: 'Seal it' }).click();
    // Bots sealed already, so the person's seal resolves the operation.
    await phase(page, 'Outcome');
    await page.getByRole('button', { name: 'Continue' }).click();
    await phase(page, 'Round summary');
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await phase(page, 'Final reckoning');
  await page.getByRole('button', { name: 'Continue' }).click();
  await phase(page, 'Results');
  await expect(page.getByTestId('score-total')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('the host can add and remove bots by hand in a normal lobby @practice', async ({ page }) => {
  await page.goto('/host');
  await page.getByLabel('Nickname').fill('Host');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByText('BOT', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a bot' }).click();
  await expect(page.getByText('BOT', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Fill with 2 bots' }).click();
  await expect(page.getByText('BOT', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Start match' })).toBeEnabled();
  // Ultra-relaxed pace (rules 2.1.0) is offered and sticks.
  const pace = page.getByRole('group', { name: 'Pace' });
  await pace.getByRole('button', { name: 'Ultra-relaxed' }).click();
  await expect(pace.getByRole('button', { name: 'Ultra-relaxed' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(pace.getByRole('button', { name: 'Relaxed', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
