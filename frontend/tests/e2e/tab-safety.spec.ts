import { test, expect, me } from './fixtures/local-stack';
import { mutate, socketFaults } from './fixtures/journey';

test('safety_blockUnblock_refreshesOwnOtherTabWithoutRevealingBlocker', async ({ alice, bob }) => {
  const a = await me(alice.context()), b = await me(bob.context());
  const created = await mutate(alice, '/api/v1/rooms', 'POST', { roomType: 'DIRECT_MESSAGE', participantId: b.id });
  expect(created.status).toBe(201);
  const room = created.body.data.id as string;
  expect((await mutate(bob, `/api/v1/rooms/${room}/dm-request/accept`)).status).toBe(204);
  const observed = await socketFaults(alice);
  await alice.reload();
  await expect(alice.getByText('On air', { exact: true })).toBeVisible();
  const mirror = await bob.context().newPage();
  try {
    await mirror.goto('/dashboard?roomId=' + room);
    const input = mirror.getByRole('textbox', { name: 'Message', exact: true });
    await expect(input).toBeEnabled();
    expect((await mutate(bob, `/api/v1/users/${a.id}/block`, 'PUT')).status).toBe(204);
    await expect(input).toBeDisabled();
    await expect(mirror.getByRole('status').filter({ hasText: 'You blocked' })).toBeVisible();
    expect((await mutate(bob, `/api/v1/users/${a.id}/block`, 'DELETE')).status).toBe(204);
    await expect(input).toBeEnabled();
    await expect(mirror.getByRole('status').filter({ hasText: 'You blocked' })).toHaveCount(0);
    expect(observed.frames.some(frame => frame.includes('ACCOUNT_STATE_CHANGED'))).toBe(false);
  } finally {
    await mutate(bob, `/api/v1/users/${a.id}/block`, 'DELETE');
    await mirror.close();
  }
});

test('safety_decline_refreshesRecipientsOtherInboxTab', async ({ alice, bob }) => {
  const a = await me(alice.context()), b = await me(bob.context());
  const created = await mutate(alice, '/api/v1/rooms', 'POST', { roomType: 'DIRECT_MESSAGE', participantId: b.id });
  expect(created.status).toBe(201);
  const mirror = await bob.context().newPage();
  try {
    await mirror.goto('/dashboard');
    for (const page of [bob, mirror]) await page.getByRole('button', { name: /^Inbox/ }).click();
    const request = (page: typeof bob) => page.getByRole('region', { name: 'Message requests' })
      .getByRole('listitem').filter({ hasText: a.name });
    await expect(request(bob)).toBeVisible();
    await expect(request(mirror)).toBeVisible();
    await request(bob).getByRole('button', { name: 'Decline', exact: true }).click();
    await expect(request(bob)).toHaveCount(0);
    await expect(request(mirror)).toHaveCount(0);
  } finally { await mirror.close(); }
});
