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
  let expiredSocketClosed = false;
  alice.on('websocket', socket => socket.on('close', () => { expiredSocketClosed = true; }));
  await alice.reload();
  await expect(alice.getByText('On air', { exact: true })).toBeVisible();
  expiredSocketClosed = false;
  await me(alice.context());
  await alice.waitForTimeout(65_000);
  expect(expiredSocketClosed).toBe(true);
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

test('auth_logoutCurrentSession_closesSiblingTabAndPreservesIndependentLogin', async ({ alice, bob }) => {
  const identity = await me(alice.context());
  await signOut(bob);
  await login(bob, 'Alice');
  expect((await me(bob.context())).id === identity.id).toBe(true);
  const mirror = await alice.context().newPage();
  let mirrorClosed = false;
  mirror.on('websocket', socket => socket.on('close', () => { mirrorClosed = true; }));
  try {
    await mirror.goto('/dashboard');
    await expect(mirror.getByText('On air', { exact: true })).toBeVisible();
    await signOut(alice);
    await expect.poll(() => mirrorClosed, { timeout: 5000 }).toBe(true);
    expect((await me(bob.context())).id === identity.id).toBe(true);
    const room = await createConversation(bob);
    await bob.getByRole('textbox', { name: 'Message', exact: true }).fill('Synthetic independent session remains usable');
    await bob.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect.poll(async () => {
      const response = await bob.request.get(origin + '/api/v1/rooms/' + room + '/messages');
      return JSON.stringify(await response.json()).includes('Synthetic independent session remains usable');
    }).toBe(true);
  } finally { await mirror.close(); }
});

test('auth_logoutCurrentSession_revokesUnusedWsToken', async ({ alice, bob }) => {
  const token = await alice.evaluate(async () => {
    const csrf = document.cookie.split('; ').find(value => value.startsWith('XSRF-TOKEN='))?.split('=')[1];
    const response = await fetch('/api/v1/auth/ws-token', { method: 'POST',
      headers: { 'X-XSRF-TOKEN': decodeURIComponent(csrf ?? '') } });
    if (response.status !== 200) throw new Error('Synthetic token issue failed');
    return (await response.json()).token as string;
  });
  await signOut(alice);
  // The other real session stays usable; only the old issuing session's grant is tested.
  await me(bob.context());
  const rejected = await bob.evaluate(value => new Promise<boolean>((resolve, reject) => {
    const socket = new WebSocket('ws://127.0.0.1:8100/ws', ['v12.stomp']);
    let error = false;
    const deadline = setTimeout(() => { socket.close(); reject(new Error('Synthetic CONNECT deadline')); }, 5000);
    socket.onopen = () => socket.send('CONNECT\naccept-version:1.2\nhost:localhost\nX-WS-Token:' + value + '\n\n\0');
    socket.onmessage = event => {
      const frame = String(event.data);
      if (frame.startsWith('ERROR')) error = true;
      if (frame.startsWith('CONNECTED')) { clearTimeout(deadline); resolve(false); socket.close(); }
    };
    socket.onclose = () => { clearTimeout(deadline); resolve(error); };
  }), token);
  expect(rejected).toBe(true);
});


test('auth_logoutCurrentSession_serverClosesTransportsWithoutClientCooperation', async ({ alice, bob }) => {
  const grants = await alice.evaluate(async () => {
    const csrf = document.cookie.split('; ').find(value => value.startsWith('XSRF-TOKEN='))?.split('=')[1];
    const values: string[] = [];
    for (let n = 0; n < 2; n++) {
      const response = await fetch('/api/v1/auth/ws-token', { method: 'POST', headers: { 'X-XSRF-TOKEN': decodeURIComponent(csrf ?? '') } });
      if (response.status !== 200) throw new Error('Synthetic token issue failed');
      values.push((await response.json()).token);
    }
    return values;
  });
  // These transports belong to Alice's HTTP session, but Bob's page never runs Alice's
  // logout cleanup/navigation. Only server revocation can close them here.
  await bob.evaluate(values => Promise.all(values.map((value, index) => new Promise<void>((resolve, reject) => {
    const state = window as typeof window & { __cm102Closed?: boolean[] };
    (state.__cm102Closed ??= [false, false]);
    const socket = new WebSocket('ws://127.0.0.1:8100/ws', ['v12.stomp']);
    const deadline = setTimeout(() => { socket.close(); reject(new Error('Synthetic CONNECT deadline')); }, 5000);
    socket.onopen = () => socket.send('CONNECT\naccept-version:1.2\nhost:localhost\nX-WS-Token:' + value + '\n\n\0');
    socket.onmessage = event => {
      if (String(event.data).startsWith('CONNECTED')) { clearTimeout(deadline); resolve(); }
      if (String(event.data).startsWith('ERROR')) { clearTimeout(deadline); reject(new Error('Synthetic CONNECT rejected')); }
    };
    socket.onclose = () => { state.__cm102Closed![index] = true; };
  }))), grants);
  await signOut(alice);
  await expect.poll(() => bob.evaluate(() => (window as typeof window & { __cm102Closed?: boolean[] }).__cm102Closed),
    { timeout: 5000 }).toEqual([true, true]);
  await me(bob.context());
});
