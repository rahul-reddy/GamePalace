import { expect, test } from '@playwright/test';

test('landing page loads and the browser reaches the backend over HTTP and WebSocket @smoke', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.getByRole('heading', { name: 'THE SYNDICATE' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Host a game' })).toBeVisible();
  const reachable = await page.evaluate(async () => {
    const health = (await (await fetch('/api/health')).json()) as { ok: boolean };
    const probe = await new Promise<string>((resolve) => {
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws-probe`,
      );
      ws.onmessage = (e) => resolve(String(e.data));
      ws.onerror = () => resolve('error');
    });
    return { health: health.ok, probe: (JSON.parse(probe) as { type: string }).type };
  });
  expect(reachable).toEqual({ health: true, probe: 'probe' });
  // No horizontal scrolling at this viewport.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('unknown and invalid room links lead somewhere useful @smoke', async ({ page }) => {
  await page.goto('/room/ZZZZZZ');
  await expect(page.getByRole('heading', { name: 'Join a game' })).toBeVisible();
  await expect(page.getByLabel('Room code')).toHaveValue('ZZZZZZ');
  await page.getByLabel('Nickname').fill('Lost');
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByRole('alert')).toContainText('No room with that code');
  await page.goto('/nowhere');
  await expect(page.getByRole('button', { name: 'Host a game' })).toBeVisible();
});

test('the how-to-play guide opens from the homepage and works as a direct link @smoke', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page).toHaveURL(/\/how-to-play$/);
  await expect(page.getByRole('heading', { name: 'How to play', level: 1 })).toBeVisible();
  // Numbers come from the live rules config.
  await expect(page.getByLabel('The goal')).toContainText('5 operations');
  await expect(page.getByLabel('The goal')).toContainText('3 in a quick game');
  const saboteur = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Saboteur' }) });
  await saboteur.getByText('Exact powers').click();
  await expect(saboteur).toContainText('Mole:');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'artifacts/screenshots/how-to-play.png', fullPage: true });
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.getByRole('button', { name: 'Host a game' })).toBeVisible();
  // A shared link opens the guide directly.
  await page.goto('/how-to-play');
  await expect(page.getByRole('heading', { name: 'Who wins' })).toBeVisible();
  await page.goto('/how-to-play/');
  await expect(page.getByRole('heading', { name: 'How to play', level: 1 })).toBeVisible();
});
