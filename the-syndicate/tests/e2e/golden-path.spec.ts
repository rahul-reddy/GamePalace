// E2E-MULTIPLAYER-001 (THE_SYNDICATE_AGENT_BUILD_PLAN.md section 5): four isolated
// browser contexts play a full match against the real Worker, including a
// round-three disconnect with same-seat restore, a server-verified scoreboard and a
// rematch.
import { determineWinners, replay, type CommandEnvelope } from '@syndicate/game-engine';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'artifacts/screenshots';
mkdirSync(SHOTS, { recursive: true });

interface Seat {
  name: string;
  context: BrowserContext;
  page: Page;
  frames: string[];
  errors: string[];
}

async function openSeat(
  browser: Browser,
  name: string,
  viewport: { width: number; height: number },
  mobile: boolean,
): Promise<Seat> {
  const context = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
  });
  const page = await context.newPage();
  const seat: Seat = { name, context, page, frames: [], errors: [] };
  attach(seat, page);
  return seat;
}

function attach(seat: Seat, page: Page): void {
  page.on('console', (m) => {
    if (m.type() === 'error') seat.errors.push(m.text());
  });
  page.on('pageerror', (e) => seat.errors.push(e.message));
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => typeof f.payload === 'string' && seat.frames.push(f.payload)),
  );
}

async function phase(page: Page): Promise<string> {
  return (await page.getByTestId('phase-title').textContent()) ?? '';
}

async function waitPhase(seats: Seat[], title: string): Promise<void> {
  await Promise.all(
    seats.map((s) =>
      expect(s.page.getByTestId('phase-title')).toHaveText(title, { timeout: 30_000 }),
    ),
  );
}

async function pressReady(seats: Seat[], label: string, next: string): Promise<void> {
  for (const s of seats) await s.page.getByRole('button', { name: label }).click();
  await waitPhase(seats, next);
}

/** Uses the role ability through the real UI if this phase offers it (any role, any target). */
async function useAbilityIfOffered(page: Page): Promise<void> {
  const panel = page.getByTestId('ability-panel');
  if (!(await panel.isVisible())) return;
  if (await panel.getByText('Used this operation').isVisible()) return;
  for (const group of ['Target player', 'Forecast', 'Which operation', 'Operation to inspect']) {
    const options = panel.getByRole('radiogroup', { name: group }).getByRole('radio');
    if ((await options.count()) > 0) await options.last().click();
  }
  const action = panel.getByRole('button').last();
  if (await action.isDisabled()) return;
  await action.click();
  await page.getByRole('button', { name: 'Do it' }).click();
  await expect(panel).toContainText('Used this operation');
}

async function fillProfile(page: Page, name: string, avatar: string): Promise<void> {
  await page.getByLabel('Nickname').fill(name);
  await page.getByRole('radio', { name: avatar }).click();
}

test.describe('E2E-MULTIPLAYER-001 @4p', () => {
  test('four players complete a match, survive a disconnect and rematch', async ({
    browser,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'creates its own desktop and phone contexts');
    test.setTimeout(420_000);
    const started = Date.now();
    const a = await openSeat(browser, 'Ada', { width: 1280, height: 860 }, false);
    const b = await openSeat(browser, 'Bo', { width: 390, height: 844 }, true);
    const c = await openSeat(browser, 'Cy', { width: 375, height: 740 }, true);
    const d = await openSeat(browser, 'Dee', { width: 1024, height: 768 }, false);
    const all = [a, b, c, d];

    // 1. A hosts and receives a valid shareable code.
    await a.page.goto('/');
    await a.page.screenshot({ path: `${SHOTS}/01-landing.png` });
    await a.page.getByRole('button', { name: 'Host a game' }).click();
    await fillProfile(a.page, 'Ada', 'fox');
    await a.page.getByLabel('Beginner mode', { exact: false }).uncheck();
    await a.page.getByRole('button', { name: 'Create room' }).click();
    await expect(a.page.getByTestId('room-code')).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
    const code = ((await a.page.getByTestId('room-code').textContent()) ?? '').trim();

    // 2. B, C and D join with separate sessions via the invite link.
    for (const [seat, avatar] of [
      [b, 'owl'],
      [c, 'wolf'],
      [d, 'cat'],
    ] as const) {
      await seat.page.goto(`/join/${code}`);
      await fillProfile(seat.page, seat.name, avatar);
      await seat.page.getByRole('button', { name: 'Join room' }).click();
      await expect(seat.page.getByTestId('room-code')).toHaveText(code);
    }
    await expect(a.page.getByTestId('player-3')).toContainText('Dee');
    await a.page.screenshot({ path: `${SHOTS}/02-lobby-host-desktop.png`, fullPage: true });
    await b.page.screenshot({ path: `${SHOTS}/03-lobby-guest-mobile.png`, fullPage: true });

    // 3. Everyone readies; A starts.
    const start = a.page.getByRole('button', { name: 'Start match' });
    await expect(start).toBeDisabled();
    for (const s of [b, c, d]) await s.page.getByRole('button', { name: "I'm ready" }).click();
    await expect(start).toBeEnabled();
    await start.click();
    await waitPhase(all, 'Briefing');

    // 4. Each player sees only their own private information: a secret role card.
    const roleNames: string[] = [];
    for (const s of all) {
      await expect(s.page.getByTestId('role-card')).toBeVisible();
      roleNames.push(((await s.page.getByTestId('role-name').textContent()) ?? '').trim());
      await expect(s.page.getByTestId('my-credits')).toHaveText('10');
    }
    expect(roleNames.every((r) => r.length > 0)).toBe(true);
    expect(new Set(roleNames).size).toBe(4);
    await c.page.screenshot({ path: `${SHOTS}/04-briefing-mobile.png`, fullPage: true });
    await pressReady(all, 'Got it', 'Intelligence');

    const commitPlan = [
      [3, 2, 1, 0],
      [2, 2, 2, 2],
      [1, 3, 0, 3],
      [3, 0, 2, 1],
      [2, 1, 3, 2],
    ];
    for (let round = 1; round <= 5; round++) {
      const present = round === 3 ? [a, b, d] : all;
      await expect(a.page.getByText(`Operation ${round} of 5`)).toBeVisible();
      if (round === 1) {
        await a.page.screenshot({ path: `${SHOTS}/05-intelligence-desktop.png`, fullPage: true });
        await b.page.screenshot({ path: `${SHOTS}/06-intelligence-mobile.png`, fullPage: true });
        await b.page.getByRole('button', { name: /Pay a contact/ }).click();
        await b.page.getByRole('button', { name: /Pay 1 credit|Ask/ }).click();
        await expect(b.page.getByTestId('intel-panel')).toContainText('Paid contact');
      }
      if (round === 3) {
        // 8. C disconnects in round three; the others see it and carry on.
        await c.page.close();
        await expect(a.page.getByTestId('player-2')).toContainText('offline');
      }
      if (round === 2) {
        // Intelligence-phase abilities (Insider reads odds; Auditor checks a record).
        for (const s of present) await useAbilityIfOffered(s.page);
      }
      await pressReady(present, 'Done studying', 'Negotiation');
      if (round === 2) {
        await a.page.getByRole('radiogroup', { name: 'Accuse' }).getByRole('radio').first().click();
        await a.page.getByRole('button', { name: /^Accuse / }).click();
        await a.page.getByRole('button', { name: 'Accuse publicly' }).click();
        await expect(d.page.getByLabel('Accusations')).toContainText('Ada accused');
        await a.page.screenshot({ path: `${SHOTS}/16-accusation.png`, fullPage: true });
      }
      if (round === 1) {
        await a.page.getByRole('button', { name: 'Propose a deal' }).click();
        await a.page.getByRole('button', { name: 'Everyone' }).click();
        await a.page.getByRole('button', { name: 'Send proposal' }).click();
        for (const s of [b, c, d]) await s.page.getByRole('button', { name: 'Accept' }).click();
        await a.page.getByRole('button', { name: "I'm in for 3." }).click();
        await expect(d.page.locator('ol li', { hasText: "I'm in for 3." })).toBeVisible();
        await d.page.screenshot({ path: `${SHOTS}/07-negotiation-desktop.png`, fullPage: true });
      }
      if (round === 3) {
        // C comes back on a new page in the same browser profile: same seat, no re-join.
        c.page = await c.context.newPage();
        attach(c, c.page);
        await c.page.goto(`/room/${code}`);
        await expect(c.page.getByTestId('phase-title')).toHaveText('Negotiation');
        await expect(a.page.getByTestId('player-2')).not.toContainText('offline');
        await c.page.screenshot({ path: `${SHOTS}/08-reconnected-mobile.png`, fullPage: true });
      }
      await pressReady(all, 'Done negotiating', 'Sealed commitment');
      // 5. Sealed commitments with explicit confirmation and server acknowledgement.
      for (const [i, s] of all.entries()) {
        if (round === 2) await useAbilityIfOffered(s.page);
        const amount = commitPlan[round - 1]?.[i] ?? 0;
        await s.page.getByTestId(`commit-${amount}`).click();
        await s.page.getByRole('button', { name: /^Seal \d credits?$/ }).click();
        if (round === 1 && i === 0)
          await s.page.screenshot({ path: `${SHOTS}/09-commit-confirm.png` });
        await s.page.getByRole('button', { name: 'Seal it' }).click();
        if (i < 3) await expect(s.page.getByTestId('sealed')).toContainText(`${amount} credit`);
        if (round === 1 && i === 1)
          await s.page.screenshot({ path: `${SHOTS}/10-sealed-mobile.png`, fullPage: true });
      }
      // 6. Everyone observes the same authoritative outcome.
      await waitPhase(all, 'Outcome');
      const statuses = await Promise.all(
        all.map((s) => s.page.getByTestId('outcome-status').textContent()),
      );
      expect(new Set(statuses).size).toBe(1);
      if (round === 1) {
        await a.page.screenshot({ path: `${SHOTS}/11-outcome-desktop.png`, fullPage: true });
        await b.page.screenshot({ path: `${SHOTS}/12-outcome-mobile.png`, fullPage: true });
      }
      await pressReady(all, 'Continue', 'Round summary');
      if (round === 1) await d.page.screenshot({ path: `${SHOTS}/13-summary.png`, fullPage: true });
      // 7. All five rounds advance through legal readiness transitions.
      await pressReady(all, 'Continue', round < 5 ? 'Intelligence' : 'Final reckoning');
    }

    // The final reckoning reveals every secret role.
    for (const s of all) {
      for (const name of roleNames)
        await expect(s.page.getByTestId('role-reveal')).toContainText(name);
    }
    await a.page.screenshot({ path: `${SHOTS}/14-final-reckoning-desktop.png`, fullPage: true });
    await pressReady(all, 'Continue', 'Results');
    await b.page.screenshot({ path: `${SHOTS}/15-results-mobile.png`, fullPage: true });

    // 9. Scoreboard matches an independent replay of the server's own command log.
    const log = (await (await a.page.request.post(`/api/test/rooms/${code}/replay`)).json()) as {
      create: { seed: string } & Record<string, unknown>;
      commands: CommandEnvelope[];
    };
    const { seed, ...create } = log.create;
    const truth = determineWinners(
      replay({ create: create as never, seed, commands: log.commands }),
    );
    for (const s of all) {
      const totals = await s.page.getByTestId('score-total').allTextContents();
      expect(totals.map(Number)).toEqual(truth.map((t) => t.total));
    }

    // Network inspection: no socket frame ever carried another player's credits or intel,
    // nor the hidden odds before the final reckoning.
    for (const s of all) {
      for (const raw of s.frames) {
        const m = JSON.parse(raw) as { type: string; view?: { phase: string; players: unknown[] } };
        if (m.type !== 'state' || !m.view) continue;
        expect(JSON.stringify(m.view.players)).not.toMatch(/"credits"|"intel"/);
        if (m.view.phase !== 'FINAL_RECKONING' && m.view.phase !== 'RESULTS')
          expect(raw).not.toContain('trueBase');
      }
    }

    // 10. All four start and complete a rematch.
    await a.page.getByRole('button', { name: 'Rematch' }).click();
    await waitPhase(all, 'Lobby');
    for (const s of [b, c, d]) await s.page.getByRole('button', { name: "I'm ready" }).click();
    await a.page
      .getByRole('button', { name: 'Settings' })
      .isVisible()
      .catch(() => false);
    await a.page.getByRole('button', { name: 'Start match' }).click();
    await waitPhase(all, 'Briefing');
    for (const s of all) await expect(s.page.getByTestId('my-credits')).toHaveText('10');
    await pressReady(all, 'Got it', 'Intelligence');
    for (let round = 1; round <= 5; round++) {
      await pressReady(all, 'Done studying', 'Negotiation');
      await pressReady(all, 'Done negotiating', 'Sealed commitment');
      for (const s of all) {
        await s.page.getByTestId('commit-1').click();
        await s.page.getByRole('button', { name: 'Seal 1 credit' }).click();
        await s.page.getByRole('button', { name: 'Seal it' }).click();
      }
      await waitPhase(all, 'Outcome');
      await pressReady(all, 'Continue', 'Round summary');
      await pressReady(all, 'Continue', round < 5 ? 'Intelligence' : 'Final reckoning');
    }
    await pressReady(all, 'Continue', 'Results');
    for (const s of all) await expect(s.page.getByTestId('score-row')).toHaveCount(4);

    // No blocking errors in any browser.
    for (const s of all) expect(s.errors, `${s.name} console errors`).toEqual([]);
    info.annotations.push({
      type: 'duration',
      description: `${Math.round((Date.now() - started) / 1000)} s`,
    });
    expect(await phase(a.page)).toBe('Results');
    for (const s of all) await s.context.close();
  });
});
