import { test, expect, me, signOut, createConversation, login, origin } from './fixtures/local-stack';

test('auth_loginReloadLogout_preservesSessionContract', async ({ alice, bob }) => {
  const a = await me(alice.context());
  const b = await me(bob.context());
  expect(a.id === b.id).toBe(false);
  const cookieA = (await alice.context().cookies()).find(cookie => cookie.name === 'JSESSIONID');
  const cookieB = (await bob.context().cookies()).find(cookie => cookie.name === 'JSESSIONID');
  expect(Boolean(cookieA && cookieB && cookieA.value !== cookieB.value)).toBe(true);
  expect(cookieA?.httpOnly).toBe(true);
  expect(cookieA?.sameSite).toBe('Lax');
  await alice.reload();
  await bob.reload();
  expect((await me(alice.context())).id === a.id).toBe(true);
  expect((await me(bob.context())).id === b.id).toBe(true);
  await alice.goto('/login');
  await expect(alice).toHaveURL(/\/dashboard/);
  await signOut(alice);
  await expect(alice).toHaveURL(/\/login\?signedOut=true/);
  expect((await alice.request.get(origin + '/api/v1/auth/me')).status()).toBe(401);
  expect((await me(bob.context())).id === b.id).toBe(true);
});

test('auth_logoutRejected_keepsSessionState', async ({ alice }) => {
  const identity = await me(alice.context());
  const room = await createConversation(alice);
  // Real CSRF rejection: remove only the header from the user's actual logout request.
  await alice.route('**/logout', async route => {
    const headers = { ...route.request().headers() };
    delete headers['x-xsrf-token'];
    await route.continue({ headers });
  });
  const rejected = alice.waitForResponse(response => new URL(response.url()).pathname === '/logout');
  await signOut(alice);
  expect((await rejected).status()).toBe(403);
  await expect(alice.getByText('Could not sign out. Please try again.')).toBeVisible();
  expect((await me(alice.context())).id === identity.id).toBe(true);
  await expect(alice).toHaveURL(new RegExp(room));
  await alice.getByRole('textbox', { name: 'Message', exact: true }).fill('Synthetic after rejected logout');
  await alice.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(async () => {
    const response = await alice.request.get(origin + '/api/v1/rooms/' + room + '/messages');
    return JSON.stringify(await response.json()).includes('Synthetic after rejected logout');
  }).toBe(true);
});

test('auth_logoutConfirmed_clearsAccountState', async ({ alice }) => {
  let closed = false;
  alice.on('websocket', socket => socket.on('close', () => { closed = true; }));
  const room = await createConversation(alice);
  closed = false;
  await signOut(alice);
  await expect(alice).toHaveURL(/\/login\?signedOut=true/);
  await expect.poll(() => closed).toBe(true);
  expect(await alice.evaluate(() => JSON.parse(localStorage.getItem('auth-storage') ?? '{}').state?.user === null)).toBe(true);
  expect((await alice.request.get(origin + '/api/v1/auth/me')).status()).toBe(401);
  await login(alice, 'Bob');
  expect(await alice.evaluate(() => document.body.textContent?.includes('Synthetic auth'))).toBe(false);
  expect((await alice.request.get(origin + '/api/v1/rooms/' + room + '/messages')).status()).toBe(404);
});

test('auth_expiredSession_stopsReconnect', async ({ alice }) => {
  // Natural server idle expiry, not a forged 401. WS heartbeats do not refresh HTTP sessions.
  // The 60-second test-only servlet timeout needs a quiet interval with no session reads.
  await expect(alice.getByText('On air', { exact: true })).toBeVisible();
  await me(alice.context());
  await alice.waitForTimeout(65_000);
  await alice.reload();
  await expect(alice).toHaveURL(/\/login/);
  await expect(alice.waitForRequest('**/api/v1/auth/ws-token', { timeout: 2500 })).rejects.toThrow(/Timeout/);
  await expect(alice.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
  expect((await alice.request.get(origin + '/api/v1/auth/me')).status()).toBe(401);
});

test('auth_wsToken401_stopsReconnect', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/v1/auth/ws-token', async route => {
    attempts++;
    await route.fulfill({ status: 401, contentType: 'application/problem+json',
      body: JSON.stringify({ status: 401, code: 'UNAUTHENTICATED' }) });
  });
  // Simulated expired session: token rejection followed by a guest session check.
  await page.route('**/api/v1/auth/me', async route => {
    if (attempts) await route.fulfill({ status: 401, body: '{}' });
    else await route.continue();
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();
  await page.getByRole('link', { name: 'Alice', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?reason=expired/);
  await expect(page.getByText('Your session ended. Sign in again.')).toBeVisible();
  expect(attempts).toBe(1);
  await expect(page.waitForRequest('**/api/v1/auth/ws-token', { timeout: 2500 })).rejects.toThrow(/Timeout/);
});

for (const fault of ['network', '503'] as const) {
  test('auth_backendUnreachable_offersRetry_' + fault, async ({ page }) => {
    // Selective simulated proxy/network failure; no successful API is mocked.
    await page.route('**/api/v1/auth/me', route => fault === 'network'
      ? route.abort('connectionrefused') : route.fulfill({ status: 503, body: '{}' }));
    await page.goto('/login');
    await expect(page.getByText("Can't reach ChatMee right now.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await page.unroute('**/api/v1/auth/me');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText("Can't reach ChatMee right now.")).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeEnabled();
  });
}
test('auth_loginDenied_showsFailure', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();
  await page.getByRole('link', { name: 'Deny', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?error=true/);
  await expect(page.getByText('Login failed. Please try again.')).toBeVisible();
  expect((await page.request.get(origin + '/api/v1/auth/me')).status()).toBe(401);
});

for (const fault of ['network', '503'] as const) {
  test('auth_wsTokenUnreachable_retries_' + fault, async ({ page }) => {
    let attempts = 0;
    await page.route('**/api/v1/auth/ws-token', async route => {
      if (++attempts > 1) return route.continue();
      if (fault === 'network') await route.abort('connectionrefused');
      else await route.fulfill({ status: 503, body: '{}' });
    });
    await login(page, 'Alice');
    await expect(page.getByText('On air', { exact: true })).toBeVisible();
    expect(attempts).toBeGreaterThanOrEqual(2);
    await expect(page).toHaveURL(/\/dashboard/);
  });
}