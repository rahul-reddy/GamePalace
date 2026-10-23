// Accessibility audit with axe-core on every screen a player sees. One real browser
// plays alongside three protocol clients (the same client the integration tests use).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { Client, joinRoom } from '../integration/client';

async function audit(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map(
      (v) =>
        `${screen}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

test('landing and entry screens have no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  await audit(page, 'landing');
  await page.goto('/host');
  await audit(page, 'host');
  await page.goto('/join');
  await audit(page, 'join');
});

test('every in-match screen has no serious accessibility violations', async ({ page }, info) => {
  test.setTimeout(300_000);
  const base = info.project.use.baseURL as string;
  process.env.SYNDICATE_BASE_URL = base;
  await page.goto('/host');
  await page.getByLabel('Nickname').fill('Ada');
  await page.getByRole('radio', { name: 'Quick' }).click();
  await page.getByRole('button', { name: 'Create room' }).click();
  const code = ((await page.getByTestId('room-code').textContent()) ?? '').trim();
  const bots: Client[] = [];
  for (let i = 2; i <= 4; i++)
    bots.push(await Client.connect(await joinRoom(code, `Bot ${i}`), `Bot ${i}`));
  await expect(page.getByTestId('player-3')).toBeVisible();
  await audit(page, 'lobby');
  await Promise.all(bots.map((b) => b.ok({ type: 'setReady', ready: true })));
  await page.getByRole('button', { name: 'Start match' }).click();
  const readyBots = async () => {
    for (const b of bots) await b.command({ type: 'setReady', ready: true });
  };
  const screens: [string, string, () => Promise<void>][] = [
    ['Briefing', 'Got it', readyBots],
    ['Intelligence', 'Done studying', readyBots],
    ['Negotiation', 'Done negotiating', readyBots],
  ];
  for (const [title, button, botAct] of screens) {
    await expect(page.getByTestId('phase-title')).toHaveText(title);
    await audit(page, title);
    await botAct();
    await page.getByRole('button', { name: button }).click();
  }
  await expect(page.getByTestId('phase-title')).toHaveText('Sealed commitment');
  await audit(page, 'Sealed commitment');
  await page.getByTestId('commit-1').click();
  await page.getByRole('button', { name: 'Seal 1 credit' }).click();
  await audit(page, 'Commit confirmation dialog');
  await page.getByRole('button', { name: 'Seal it' }).click();
  for (const b of bots) await b.command({ type: 'commit', amount: 1 });
  await expect(page.getByTestId('phase-title')).toHaveText('Outcome');
  await audit(page, 'Outcome');
  // Rules reference (both tabs) and the sound toggle, which starts muted.
  await page.getByRole('button', { name: 'Rules' }).click();
  await audit(page, 'Rules dialog');
  // Focus stays where the user puts it while the header countdown keeps re-rendering.
  await page.getByRole('tab', { name: 'Roles' }).focus();
  await page.waitForTimeout(1200);
  await expect(page.getByRole('tab', { name: 'Roles' })).toBeFocused();
  await page.getByRole('tab', { name: 'Roles' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Saboteur');
  await audit(page, 'Rules dialog: roles');
  // Tab never leaves the open dialog.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const sound = page.getByRole('button', { name: /^Sound (on|off)$/ });
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  // Fast-forward the rest of the quick match through the test-only endpoint.
  for (let i = 0; i < 40; i++) {
    const title = await page.getByTestId('phase-title').textContent();
    if (title === 'Final reckoning') break;
    await page.request.post(`/api/test/rooms/${code}/expire`);
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId('phase-title')).toHaveText('Final reckoning');
  await audit(page, 'Final reckoning');
  for (const b of bots) b.close();
});
