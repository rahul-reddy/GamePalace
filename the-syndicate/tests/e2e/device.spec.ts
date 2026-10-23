// Moving a seat to a different device (a separate browser context with its own storage).
import { expect, test } from '@playwright/test';

test('a seat moves to another device through the private link without the token reaching any server', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'creates its own contexts');
  const laptop = await browser.newContext();
  await laptop.grantPermissions(['clipboard-read', 'clipboard-write']);
  const a = await laptop.newPage();
  await a.goto('/host');
  await a.getByLabel('Nickname').fill('Ada');
  await a.getByRole('button', { name: 'Create room' }).click();
  const code = ((await a.getByTestId('room-code').textContent()) ?? '').trim();

  await a.getByRole('button', { name: 'Use on another device' }).click();
  await expect(a.getByRole('dialog')).toContainText('Private');
  await a.getByRole('button', { name: 'Copy private link' }).click();
  const link = await a.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(new RegExp(`/room/${code}#seat=`));
  const token = await a.evaluate(
    (c) => JSON.parse(localStorage.getItem(`syndicate.seat.${c}`) ?? '{}').token as string,
    code,
  );
  await a.getByRole('button', { name: 'Close' }).click();

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const b = await phone.newPage();
  const requests: string[] = [];
  b.on('request', (r) => requests.push(r.url() + (r.postData() ?? '')));
  await b.goto(link);
  await expect(b.getByTestId('room-code')).toHaveText(code);
  await expect(b.getByTestId('player-0')).toContainText('Ada (you)');
  // The fragment is gone from the address bar, and no HTTP request ever carried the token.
  expect(new URL(b.url()).hash).toBe('');
  expect(requests.some((r) => r.includes(token) || r.includes('seat='))).toBe(false);
  // The laptop is told its seat moved.
  await expect(a.getByRole('heading', { name: 'Opened somewhere else' })).toBeVisible();
  await laptop.close();
  await phone.close();
});
