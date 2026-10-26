import { setTimeout as pace } from 'node:timers/promises';
import { test, expect, createConversation, me, origin } from './fixtures/local-stack';

test('reconnect_moreThanOnePage_recoversEveryPersistedMessageOnce', async ({ alice, bob }) => {
  test.setTimeout(240_000);
  // Simulated socket outage only. OAuth, sends, persistence and history use the real local stack.
  let disconnected = false;
  let cut: (() => void) | undefined;
  await alice.routeWebSocket('ws://127.0.0.1:8100/ws', socket => {
    if (disconnected) { socket.close(); return; }
    const server = socket.connectToServer();
    cut = () => { socket.close(); server.close(); };
  });
  const room = await createConversation(alice);
  const joined = await bob.evaluate(async roomId => {
    const csrf = document.cookie.split('; ').find(value => value.startsWith('XSRF-TOKEN='))?.split('=')[1];
    return (await fetch(`/api/v1/rooms/${roomId}/members/me`, {
      method: 'POST', headers: { 'X-XSRF-TOKEN': decodeURIComponent(csrf ?? '') },
    })).status;
  }, room);
  expect(joined).toBe(204);
  await bob.goto('/dashboard?roomId=' + room);
  await expect(bob.getByText('On air', { exact: true })).toBeVisible();
  const send = async (content: string) => {
    await bob.getByRole('textbox', { name: 'Message', exact: true }).fill(content);
    await bob.getByRole('button', { name: 'Send message', exact: true }).click();
    // Sender echo follows persistence. The final complete REST history walk
    // independently checks all stored IDs without a polling request per SEND.
    await expect(bob.getByRole('log').locator('[data-message-id]').filter({ has: bob.getByText(content, { exact: true }) })
      .getByRole('img', { name: 'Sent', exact: true })).toBeVisible();
  };
  await send('CM-095 confirmed anchor');
  await expect(alice.getByRole('log').getByText('CM-095 confirmed anchor', { exact: true })).toBeVisible();
  expect(cut).toBeDefined();
  disconnected = true;
  cut!();
  await expect(alice.getByText('On air', { exact: true })).toHaveCount(0);
  for (let n = 0; n < 105; n++) {
    // Pace below the unchanged 10 sends / 5 seconds limit; this delay is not an assertion.
    await pace(550);
    await send(`CM-095 missed ${n}`);
    if (n % 10 === 0) await Promise.all([me(alice.context()), me(bob.context())]); // keep HTTP session alive during socket-only outage
  }
  const persisted: string[] = [];
  let before: string | null = null;
  do {
    const response = await bob.request.get(`${origin}/api/v1/rooms/${room}/messages`, {
      params: before ? { before } : {},
    });
    expect(response.status()).toBe(200);
    const data = (await response.json()).data as { messages: { id: string }[]; nextCursor: string | null };
    persisted.unshift(...data.messages.map(message => message.id));
    before = data.nextCursor;
  } while (before);
  disconnected = false;
  await expect(alice.getByText('On air', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => alice.locator('[data-message-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-message-id'))),
    { timeout: 45_000 }).toEqual(persisted);
  expect(new Set(persisted).size).toBe(persisted.length);
  await expect(alice.getByText(/Conversation recovery incomplete/)).toHaveCount(0);
});

test('chat_lostEchoAndFailedSend_resendMatchesPersistedHistory', async ({ alice, bob }) => {
  const { socketFaults, joinRoom, sendStored, history, expectHistory, createUiConversation } = await import('./fixtures/journey');
  const fault = await socketFaults(alice);
  const room = await createUiConversation(alice);
  await joinRoom(bob, room);
  fault.dropEcho = 'CM-097 saved without echo';
  await sendStored(alice, room, fault.dropEcho, 'history');
  await expect.poll(() => fault.droppedEchoes).toBeGreaterThan(0);
  await expect(bob.getByRole('log').getByText(fault.dropEcho, { exact: true })).toBeVisible();
  await expect(alice.getByRole('button', { name: 'Resend', exact: true })).toBeVisible({ timeout: 20_000 });
  const first = fault.sends.at(-1)!;
  fault.dropEcho = '';
  await alice.getByRole('button', { name: 'Resend', exact: true }).click();
  await expect(alice.getByRole('button', { name: 'Resend', exact: true })).toHaveCount(0);
  expect(fault.sends.at(-1)).toBe(first);
  await expectHistory(alice, room);
  await expectHistory(bob, room);
  fault.dropSend = true;
  await alice.getByRole('textbox', { name: 'Message', exact: true }).fill('CM-097 dropped before persistence');
  await alice.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(alice.getByRole('button', { name: 'Resend', exact: true })).toBeVisible({ timeout: 20_000 });
  expect((await history(bob, room)).some(message => message.content === 'CM-097 dropped before persistence')).toBe(false);
  const failed = fault.sends.at(-1)!;
  fault.dropSend = false;
  await alice.getByRole('button', { name: 'Resend', exact: true }).click();
  await expect(alice.getByRole('button', { name: 'Resend', exact: true })).toHaveCount(0);
  expect(fault.sends.at(-1)).toBe(failed);
  await expectHistory(alice, room);
  await expectHistory(bob, room);
});

for (const touch of [false, true]) {
  test.describe(touch ? '360px recovery' : 'desktop recovery', () => {
    test.use({ viewport: touch ? { width: 360, height: 740 } : { width: 1280, height: 900 }, hasTouch: touch, contextOptions: { reducedMotion: 'reduce' } });
    test('chat_recoveryRetryContinue_preservesScrollAndPersistedHistory', async ({ alice, bob }) => {
      test.setTimeout(240_000);
      const { socketFaults, joinRoom, sendStored, expectHistory, createUiConversation } = await import('./fixtures/journey');
      const fault = await socketFaults(alice);
      const room = await createUiConversation(alice);
      await joinRoom(bob, room);
      for (let n = 0; n < 20; n++) {
        await pace(550); // Workload pacing below the existing server limit, never a success condition.
        await sendStored(bob, room, `CM-097 anchor ${n}\nline two\nline three\nline four`);
      }
      await expectHistory(alice, room);
      const scroll = alice.getByTestId('message-scroll');
      await scroll.evaluate(element => { element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) / 2); element.dispatchEvent(new Event('scroll')); });
      const anchor = await scroll.evaluate(element => {
        const top = element.getBoundingClientRect().top;
        const row = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(row => row.getBoundingClientRect().bottom > top);
        return { id: row?.dataset.messageId, offset: (row?.getBoundingClientRect().top ?? 0) - top };
      });
      expect(anchor.id).toBeTruthy();
      fault.offline = true;
      fault.cut();
      await expect(alice.getByText('On air', { exact: true })).toHaveCount(0);
      for (let n = 0; n < 12; n++) {
        await pace(550);
        await sendStored(bob, room, `CM-097 recovery gap ${n}`);
      }
      // Smaller REAL server pages exercise the ten-request budget without 500+ sends.
      // One deliberately failed page tests Retry; all successful data is persisted backend history.
      let failed = false;
      await alice.route(`**/api/v1/rooms/${room}/messages*`, route => {
        const url = new URL(route.request().url());
        if (url.searchParams.has('before') && !failed) {
          failed = true;
          return route.fulfill({ status: 503, body: '{}' });
        }
        url.searchParams.set('limit', '1');
        return route.continue({ url: url.toString() });
      });
      fault.offline = false;
      const retry = alice.getByRole('button', { name: 'Retry recovery', exact: true });
      await expect(retry).toBeVisible({ timeout: 45_000 });
      await expect(alice.getByRole('status').filter({ hasText: 'Conversation recovery incomplete' })).toBeVisible();
      await retry.focus();
      await expect(retry).toBeFocused();
      await retry.press('Enter');
      const more = alice.getByRole('button', { name: 'Continue recovery', exact: true });
      await expect(more).toBeVisible();
      if (touch) await more.tap(); else await more.click();
      await expect(alice.getByText(/Conversation recovery incomplete|Recovering missed messages/)).toHaveCount(0);
      await expectHistory(alice, room);
      const offset = await alice.locator(`[data-message-id="${anchor.id}"]`).evaluate(row => {
        const parent = row.closest('[data-testid="message-scroll"]')!;
        return row.getBoundingClientRect().top - parent.getBoundingClientRect().top;
      });
      expect(Math.abs(offset - anchor.offset)).toBeLessThanOrEqual(3);
      expect(await alice.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
