// Larger tables in real, isolated browsers: every player is its own browser context.
// Runs a quick match (3 operations) so 12 browsers finish in reasonable time.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'artifacts/screenshots';
mkdirSync(SHOTS, { recursive: true });

interface Seat {
  context: BrowserContext;
  page: Page;
  errors: string[];
}

async function seat(browser: Browser, phone: boolean): Promise<Seat> {
  const context = await browser.newContext(
    phone
      ? {
          viewport: { width: 375, height: 740 },
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 2,
        }
      : { viewport: { width: 1280, height: 800 } },
  );
  const page = await context.newPage();
  const s: Seat = { context, page, errors: [] };
  page.on('console', (m) => m.type() === 'error' && s.errors.push(m.text()));
  page.on('pageerror', (e) => s.errors.push(e.message));
  return s;
}

async function everyone(seats: Seat[], fn: (s: Seat, i: number) => Promise<void>): Promise<void> {
  await Promise.all(seats.map((s, i) => fn(s, i)));
}

async function phase(seats: Seat[], title: string): Promise<void> {
  await everyone(seats, (s) =>
    expect(s.page.getByTestId('phase-title')).toHaveText(title, { timeout: 60_000 }),
  );
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const n of [8, 12]) {
  test(`${n} players complete a quick match in ${n} isolated browsers @${n}p`, async ({
    browser,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'creates its own mixed desktop/phone contexts');
    test.setTimeout(600_000);
    const seats: Seat[] = [];
    for (let i = 0; i < n; i++) seats.push(await seat(browser, i % 2 === 1));
    const [host, ...guests] = seats as [Seat, ...Seat[]];

    await host.page.goto('/host');
    await host.page.getByLabel('Nickname').fill('Host');
    await host.page.getByRole('radio', { name: 'Quick' }).click();
    await host.page.getByLabel('Beginner mode', { exact: false }).uncheck();
    await host.page.getByRole('button', { name: 'Create room' }).click();
    const code = ((await host.page.getByTestId('room-code').textContent()) ?? '').trim();
    await host.page
      .getByRole('group', { name: 'Pace' })
      .getByRole('button', { name: 'Relaxed' })
      .click();

    await everyone(guests, async (s, i) => {
      await s.page.goto(`/join/${code}`);
      await s.page.getByLabel('Nickname').fill(`Agent ${i + 2}`);
      await s.page.getByRole('button', { name: 'Join room' }).click();
      await expect(s.page.getByTestId('room-code')).toHaveText(code);
    });
    await expect(host.page.getByTestId(`player-${n - 1}`)).toBeVisible();
    await guests[0]?.page.screenshot({ path: `${SHOTS}/${n}p-lobby-phone.png`, fullPage: true });
    await everyone(guests, (s) => s.page.getByRole('button', { name: "I'm ready" }).click());
    await host.page.getByRole('button', { name: 'Start match' }).click();
    await phase(seats, 'Briefing');

    // Each browser holds exactly one secret role, and all are different.
    const roles = await Promise.all(
      seats.map(async (s) => (await s.page.getByTestId('role-name').textContent())?.trim()),
    );
    expect(new Set(roles).size).toBe(n);

    await everyone(seats, (s) => s.page.getByRole('button', { name: 'Got it' }).click());
    for (let round = 1; round <= 3; round++) {
      await phase(seats, 'Intelligence');
      await everyone(seats, (s) => s.page.getByRole('button', { name: 'Done studying' }).click());
      await phase(seats, 'Negotiation');
      if (round === 1) {
        await guests[0]?.page.screenshot({
          path: `${SHOTS}/${n}p-negotiation-phone.png`,
          fullPage: true,
        });
        await everyone(
          seats.filter((s) => s.page.viewportSize()?.width === 375),
          (s) => noHorizontalScroll(s.page),
        );
      }
      await everyone(seats, (s) =>
        s.page.getByRole('button', { name: 'Done negotiating' }).click(),
      );
      await phase(seats, 'Sealed commitment');
      await everyone(seats, async (s, i) => {
        const amount = (i + round) % 3;
        await s.page.getByTestId(`commit-${amount}`).click();
        await s.page.getByRole('button', { name: /^Seal \d credits?$/ }).click();
        await s.page.getByRole('button', { name: 'Seal it' }).click();
      });
      await phase(seats, 'Outcome');
      const outcomes = await Promise.all(
        seats.map((s) => s.page.getByTestId('outcome-status').textContent()),
      );
      expect(new Set(outcomes).size).toBe(1);
      await everyone(seats, (s) => s.page.getByRole('button', { name: 'Continue' }).click());
      await phase(seats, 'Round summary');
      await everyone(seats, (s) => s.page.getByRole('button', { name: 'Continue' }).click());
    }
    await phase(seats, 'Final reckoning');
    await everyone(seats, (s) => expect(s.page.getByTestId('score-row')).toHaveCount(n));
    const totals = await Promise.all(
      seats.map((s) => s.page.getByTestId('score-total').allTextContents()),
    );
    expect(new Set(totals.map((t) => t.join(','))).size).toBe(1);
    await host.page.screenshot({ path: `${SHOTS}/${n}p-final-desktop.png`, fullPage: true });
    await guests[0]?.page.screenshot({ path: `${SHOTS}/${n}p-final-phone.png`, fullPage: true });
    for (const s of seats) {
      if (s.page.viewportSize()?.width === 375) await noHorizontalScroll(s.page);
      expect(s.errors).toEqual([]);
      await s.context.close();
    }
  });
}
