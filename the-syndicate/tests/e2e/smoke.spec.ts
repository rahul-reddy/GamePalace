import { expect, test } from '@playwright/test';

test('landing page loads and reaches the backend over HTTP and WebSocket @smoke', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.getByRole('heading', { name: 'THE SYNDICATE' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Host game' })).toBeVisible();
  await expect(page.getByTestId('backend-status')).toHaveText('Server: ok · Live connection: ok');
  expect(errors).toEqual([]);
});
