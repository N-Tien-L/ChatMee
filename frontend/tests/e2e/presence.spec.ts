import { test, expect, me, origin } from './fixtures/local-stack';
import { createUiConversation, joinRoom, mutate, socketFaults } from './fixtures/journey';
import type { Page } from '@playwright/test';

async function online(page: Page): Promise<string[]> {
  const response = await page.request.get(origin + '/api/v1/online-users');
  expect(response.status()).toBe(200);
  return response.json();
}
test('presence_sharedActiveMembership_controlsSnapshotAndRevokesOnLeave', async ({ alice, bob }) => {
  const stream = await socketFaults(alice);
  await alice.reload();
  const a = await me(alice.context()), b = await me(bob.context());
  for (const page of [alice, bob]) await expect(page.getByText('On air', { exact: true })).toBeVisible();
  await expect.poll(async () => (await online(alice)).includes(a.id)).toBe(true);
  await expect.poll(async () => (await online(bob)).includes(b.id)).toBe(true);
  expect((await online(alice)).includes(b.id)).toBe(false);
  expect((await online(bob)).includes(a.id)).toBe(false);
  const room = await createUiConversation(alice);
  const notices = () => stream.frames.filter(frame => frame.includes('PRESENCE_SCOPE_CHANGED')).length;
  const beforeJoin = notices();
  await joinRoom(bob, room);
  await expect.poll(notices).toBeGreaterThan(beforeJoin);
  await expect.poll(async () => (await online(alice)).includes(b.id)).toBe(true);
  await expect.poll(async () => (await online(bob)).includes(a.id)).toBe(true);
  const beforeLeave = notices();
  expect((await mutate(bob, `/api/v1/rooms/${room}/members/me`, 'DELETE')).status).toBe(200);
  await expect.poll(notices).toBeGreaterThan(beforeLeave);
  await expect.poll(async () => (await online(alice)).includes(b.id)).toBe(false);
  await expect.poll(async () => (await online(bob)).includes(a.id)).toBe(false);
});
