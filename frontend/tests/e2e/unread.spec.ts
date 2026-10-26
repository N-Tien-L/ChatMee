import { test, expect, createConversation, origin } from './fixtures/local-stack';
import type { Page } from '@playwright/test';

async function join(page: Page, roomId: string) {
  expect(await page.evaluate(async id => {
    const csrf = document.cookie.split('; ').find(value => value.startsWith('XSRF-TOKEN='))?.split('=')[1];
    return (await fetch(`/api/v1/rooms/${id}/members/me`, {
      method: 'POST', headers: { 'X-XSRF-TOKEN': decodeURIComponent(csrf ?? '') },
    })).status;
  }, roomId)).toBe(204);
  await page.goto('/dashboard?roomId=' + roomId);
  await expect(page.getByText('On air', { exact: true })).toBeVisible();
}
async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('log').getByText(text, { exact: true })).toBeVisible();
}
async function roomState(page: Page, roomId: string) {
  const response = await page.request.get(`${origin}/api/v1/rooms`);
  expect(response.status()).toBe(200);
  return (await response.json()).data.find((room: { id: string }) => room.id === roomId) as {
    id: string; roomName: string; unreadCount: number; lastMessage: { id: string };
  };
}

test('unread_duplicateStoredSend_incrementsBadgeOnceAndReconnectMatchesServer', async ({ alice, bob }) => {
  let resent = false;
  await bob.routeWebSocket('ws://127.0.0.1:8100/ws', socket => {
    const server = socket.connectToServer();
    socket.onMessage(frame => {
      server.send(frame);
      // Intentional transport retry of the exact real SEND/clientMessageId.
      if (!resent && String(frame).startsWith('SEND') && String(frame).includes('/app/chat.sendMessage')) {
        resent = true;
        server.send(frame);
      }
    });
  });
  const room = await createConversation(alice);
  await createConversation(alice); // keep the first room closed, tab visible
  await join(bob, room);
  await send(bob, 'CM-096 stored send retried');
  await expect.poll(() => roomState(alice, room).then(state => state.unreadCount)).toBe(1);
  await expect(alice.getByLabel('1 unread messages', { exact: true })).toBeVisible();
  await expect(alice).toHaveTitle('(1) ChatMee');
  expect(resent).toBe(true);
  const history = await alice.request.get(`${origin}/api/v1/rooms/${room}/messages`);
  const messages = (await history.json()).data.messages as { content: string }[];
  expect(messages.filter(message => message.content === 'CM-096 stored send retried')).toHaveLength(1);
  await alice.reload();
  await expect(alice.getByLabel('1 unread messages', { exact: true })).toBeVisible();
  await expect(alice).toHaveTitle('(1) ChatMee');
});

test('unread_failedReadThenNewMessage_retriesAndMatchesServer', async ({ alice, bob }) => {
  const room = await createConversation(alice);
  await createConversation(alice);
  await join(bob, room);
  await send(bob, 'CM-096 unread before read failure');
  await expect(alice).toHaveTitle('(1) ChatMee');
  const name = (await roomState(alice, room)).roomName;
  let failed = false;
  await alice.route(`**/api/v1/rooms/${room}/members/me/read`, route => {
    if (!failed) { failed = true; return route.abort('failed'); }
    return route.continue();
  });
  // Client navigation preserves the optimistic state and failed-read requirement.
  await alice.getByText(name, { exact: true }).click();
  await expect.poll(() => failed).toBe(true);
  await expect(alice).toHaveTitle('(1) ChatMee');
  await send(bob, 'CM-096 new activity retries failed read');
  await expect(alice.getByRole('log').getByText('CM-096 new activity retries failed read', { exact: true })).toBeVisible();
  await expect.poll(() => roomState(alice, room).then(state => state.unreadCount)).toBe(0);
  await expect(alice).toHaveTitle('ChatMee');
  await expect(alice.getByLabel(/unread messages/)).toHaveCount(0);
});

test('unread_reconnectSnapshotDelayedAcrossActivity_keepsNewBadgeAndTitle', async ({ alice, bob }) => {
  let cut: (() => void) | undefined;
  await alice.routeWebSocket('ws://127.0.0.1:8100/ws', socket => {
    const server = socket.connectToServer();
    cut = () => { socket.close(); server.close(); };
  });
  const room = await createConversation(alice);
  await createConversation(alice);
  await join(bob, room);
  const before = await roomState(alice, room);
  expect(before.unreadCount).toBe(0);
  let release!: () => void;
  let captured!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const snapshotCaptured = new Promise<void>(resolve => { captured = resolve; });
  let hold = true;
  await alice.route('**/api/v1/rooms', async route => {
    if (!hold || route.request().method() !== 'GET') return route.continue();
    hold = false;
    const response = await route.fetch(); // actual server snapshot before Bob's send
    captured();
    await gate; // intentional response-order fault; no mocked room counts
    await route.fulfill({ response });
  });
  expect(cut).toBeDefined();
  cut!();
  try {
    await snapshotCaptured;
    await expect(alice.getByText('On air', { exact: true })).toBeVisible({ timeout: 45_000 });
    await send(bob, 'CM-096 activity after captured snapshot');
    await expect(alice).toHaveTitle('(1) ChatMee');
  } finally { release(); }
  await expect(alice.getByLabel('1 unread messages', { exact: true })).toBeVisible();
  await expect(alice).toHaveTitle('(1) ChatMee');
  expect((await roomState(alice, room)).unreadCount).toBe(1);
});

test('unread_twoPages_readThenReconnect_convergesToServerState', async ({ alice, bob }) => {
  const { socketFaults, joinRoom, openRoom, sendStored, rooms } = await import('./fixtures/journey');
  const room = await createConversation(alice);
  await createConversation(alice); // both Alice pages keep the target room closed
  const mirror = await alice.context().newPage();
  try {
    const fault = await socketFaults(mirror);
    await mirror.goto('/dashboard');
    await expect(mirror.getByText('On air', { exact: true })).toBeVisible();
    await joinRoom(bob, room);
    await sendStored(bob, room, 'CM-097 two-page unread');
    for (const page of [alice, mirror]) {
      await expect(page).toHaveTitle('(1) ChatMee');
      await expect(page.getByLabel('1 unread messages', { exact: true })).toBeVisible();
      expect((await rooms(page)).find(value => value.id === room)?.unreadCount).toBe(1);
    }
    await openRoom(alice, room);
    await expect.poll(async () => (await rooms(alice)).find(value => value.id === room)?.unreadCount).toBe(0);
    await expect(alice).toHaveTitle('ChatMee');
    // No cross-tab read event is promised. A real socket reconnect refetches the authority.
    fault.cut();
    await expect.poll(() => fault.frames.filter(frame => frame.startsWith('CONNECTED')).length).toBeGreaterThan(1);
    await expect(mirror).toHaveTitle('ChatMee');
    await expect(mirror.getByLabel(/unread messages/)).toHaveCount(0);
    expect((await rooms(mirror)).find(value => value.id === room)?.unreadCount).toBe(0);
  } finally { await mirror.close(); }
});
