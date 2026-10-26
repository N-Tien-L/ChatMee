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
    await expect.poll(async () => {
      const response = await bob.request.get(`${origin}/api/v1/rooms/${room}/messages`);
      const body = await response.json();
      return body.data.messages.some((message: { content: string }) => message.content === content);
    }).toBe(true);
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
    if (n % 10 === 0) await me(alice.context()); // keep HTTP session alive during socket-only outage
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
