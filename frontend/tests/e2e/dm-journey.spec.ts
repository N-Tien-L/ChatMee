import { test, expect, me } from './fixtures/local-stack';
import { anotherSend, expectHistory, history, mutate, openRoom, rooms, sendStored, socketFaults } from './fixtures/journey';

test('dm_requestAcceptAndTwoWayChat_keepsOneConversation_and_blockHideAndUnhide_preservesSafetyAndUnread', async ({ alice, bob }) => {
  const a = await me(alice.context());
  const b = await me(bob.context());
  const transport = await socketFaults(alice);
  await alice.reload();
  await alice.getByRole('complementary', { name: 'Chat rooms' }).getByRole('button', { name: 'New message', exact: true }).click();
  await alice.getByRole('searchbox', { name: 'Search users' }).fill(b.name);
  await alice.getByRole('button', { name: 'Message ' + b.name, exact: true }).click();
  await expect(alice).toHaveURL(/roomId=/);
  const room = new URL(alice.url()).searchParams.get('roomId')!;
  expect((await rooms(alice)).find(value => value.id === room)?.state).toBe('REQUESTED');
  expect((await rooms(bob)).some(value => value.id === room)).toBe(false);
  await sendStored(alice, room, 'CM-097 request preview');
  await expect(alice.getByRole('textbox', { name: 'Message', exact: true })).toBeDisabled();
  await expect(alice.getByRole('status').filter({ hasText: 'Request sent.' })).toBeVisible();
  // Adversarial extra SEND through the existing authenticated socket, not a forged error.
  transport.inject(anotherSend(transport.sends.at(-1)!, 'CM-097 forbidden second request'));
  await expect.poll(() => transport.frames.some(frame => frame.includes('DM_REQUEST_PENDING'))).toBe(true);
  expect((await history(alice, room)).map(message => message.content)).not.toContain('CM-097 forbidden second request');
  const duplicate = await mutate(alice, '/api/v1/rooms', 'POST', { roomType: 'DIRECT_MESSAGE', participantId: b.id });
  expect(duplicate.status).toBe(200);
  expect(duplicate.body.data.id).toBe(room);
  await bob.getByRole('button', { name: /^Inbox/ }).click();
  const request = bob.getByRole('region', { name: 'Message requests' }).getByRole('listitem').filter({ hasText: a.name });
  await expect(request).toContainText('CM-097 request preview');
  await request.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(bob).toHaveURL(new RegExp(room));
  await expect(alice.getByRole('textbox', { name: 'Message', exact: true })).toBeEnabled();
  await sendStored(bob, room, 'CM-097 accepted reply');
  await sendStored(alice, room, 'CM-097 two way');
  await expectHistory(alice, room);
  await expectHistory(bob, room);
  const reverse = await mutate(bob, '/api/v1/rooms', 'POST', { roomType: 'DIRECT_MESSAGE', participantId: a.id });
  expect(reverse.status).toBe(200);
  expect(reverse.body.data.id).toBe(room);
  for (const page of [alice, bob]) expect((await rooms(page)).filter(value => value.id === room)).toHaveLength(1);

  await bob.getByRole('button', { name: 'Room info', exact: true }).click();
  await bob.getByRole('button', { name: 'Block ' + a.name, exact: true }).click();
  await bob.getByRole('dialog', { name: 'Room information' }).getByRole('button', { name: 'Close', exact: true }).click();
  try {
    await expect(bob.getByRole('textbox', { name: 'Message', exact: true })).toBeDisabled();
    expect((await rooms(bob)).find(value => value.id === room)?.blocked).toBe(true);
    expect((await rooms(alice)).find(value => value.id === room)?.blocked).toBe(false);
    await alice.getByRole('textbox', { name: 'Message', exact: true }).fill('CM-097 blocked send');
    await alice.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(alice.getByText('Cannot message this user', { exact: true })).toBeVisible();
    expect((await history(alice, room)).some(message => message.content === 'CM-097 blocked send')).toBe(false);
    expect((await history(bob, room)).map(message => message.id)).toEqual((await history(alice, room)).map(message => message.id));
    await bob.getByRole('button', { name: 'Unblock', exact: true }).click();
    await expect(bob.getByRole('textbox', { name: 'Message', exact: true })).toBeEnabled();
    await alice.getByRole('button', { name: 'Discard', exact: true }).click();
    await sendStored(alice, room, 'CM-097 after unblock');
  } finally {
    expect((await mutate(bob, `/api/v1/users/${a.id}/block`, 'DELETE')).status).toBe(204);
  }
  await bob.getByRole('button', { name: 'Room info', exact: true }).click();
  await bob.getByRole('button', { name: 'Hide conversation', exact: true }).click();
  await expect.poll(async () => (await rooms(bob)).some(value => value.id === room)).toBe(false);
  await bob.goto('/dashboard');
  await sendStored(alice, room, 'CM-097 unhides on persisted activity');
  await expect.poll(async () => (await rooms(bob)).find(value => value.id === room)?.unreadCount).toBe(1);
  await expect(bob).toHaveTitle('(1) ChatMee');
  await expect(bob.getByLabel('1 unread messages', { exact: true })).toBeVisible();
  await openRoom(bob, room);
  await expect.poll(async () => (await rooms(bob)).find(value => value.id === room)?.unreadCount).toBe(0);
  await expect(bob).toHaveTitle('ChatMee');
  await expectHistory(bob, room);
  await expectHistory(alice, room);
});
