import { createHash } from 'node:crypto';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { assertLocalTarget } from '../local-only.mjs';

export const origin = assertLocalTarget();
export async function login(page: Page, account: 'Alice' | 'Bob') {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();
  await expect(page.getByRole('heading', { name: 'Local synthetic OAuth' })).toBeVisible();
  await page.getByRole('link', { name: account, exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/dashboard');
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}
export async function me(context: BrowserContext) {
  const response = await context.request.get(origin + '/api/v1/auth/me');
  expect(response.status()).toBe(200);
  return (await response.json()).data.user as { id: string; name: string };
}
export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
}
export async function createConversation(page: Page) {
  const result = await page.evaluate(async () => {
    const csrf = document.cookie.split('; ').find(value => value.startsWith('XSRF-TOKEN='))?.split('=')[1];
    const response = await fetch('/api/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(csrf ?? '') },
      body: JSON.stringify({ roomType: 'PUBLIC', roomName: 'Synthetic auth ' + crypto.randomUUID().slice(0, 8), maxUsers: 2 }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(result.status).toBe(201);
  const id = result.body.data.id as string;
  await page.goto('/dashboard?roomId=' + id);
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  await expect(page.getByText('On air', { exact: true })).toBeVisible();
  return id;
}
// A test owns its synthetic identity pair, including quotas and unread state.
async function allowLocal(context: BrowserContext, namespace: string) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['http://127.0.0.1:3100', 'http://127.0.0.1:9100'].includes(url.origin)) return route.abort();
    if (url.origin === 'http://127.0.0.1:9100' && url.pathname === '/authorize') {
      url.searchParams.set('fixture', namespace);
      return route.continue({ url: url.toString() });
    }
    return route.continue();
  });
}
const namespaceFor = (testId: string) => createHash('sha256').update(testId).digest('hex').slice(0, 16);
export const test = base.extend<{ alice: Page; bob: Page }>({
  context: async ({ context }, provide, info) => {
    await allowLocal(context, namespaceFor(info.testId));
    await provide(context);
  },
  alice: async ({ page }, provide) => {
    await login(page, 'Alice');
    await provide(page);
  },
  bob: async ({ browser }, provide, info) => {
    const context = await browser.newContext({ baseURL: origin, serviceWorkers: 'block' });
    await allowLocal(context, namespaceFor(info.testId));
    try {
      const page = await context.newPage();
      await login(page, 'Bob');
      await provide(page);
    } finally { await context.close(); }
  },
});
export { expect };
