import { test, expect, createConversation } from './fixtures/local-stack';
import type { Page } from '@playwright/test';

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message', exact: true });

async function open(page: Page, roomId: string) {
  await page.goto('/dashboard?roomId=' + roomId);
  await expect(page.getByText('On air', { exact: true })).toBeVisible();
}

test('drafts_switchRoomsAndReload_restoresTextAndNeverSends', async ({ alice }) => {
  const first = await createConversation(alice);
  const second = await createConversation(alice);

  await open(alice, first);
  await composer(alice).fill('SPEC-013 unsent text');
  // The debounce is ~300 ms; the room switch below also flushes it.
  await open(alice, second);
  await expect(composer(alice)).toHaveValue('');

  await open(alice, first);
  await expect(composer(alice)).toHaveValue('SPEC-013 unsent text');
  await alice.reload();
  await expect(composer(alice)).toHaveValue('SPEC-013 unsent text');

  // Never auto-sent: the room history has no such message.
  const history = await alice.request.get(`/api/v1/rooms/${first}/messages`);
  const messages = (await history.json()).data.messages as { content: string }[];
  expect(messages.some(message => message.content === 'SPEC-013 unsent text')).toBe(false);
});

test('drafts_sendConfirmed_clearsDraft', async ({ alice }) => {
  const room = await createConversation(alice);
  await open(alice, room);
  await composer(alice).fill('SPEC-013 sent text');
  await alice.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(alice.getByRole('log').getByText('SPEC-013 sent text', { exact: true })).toBeVisible();
  // The optimistic bubble is instant; wait for the server echo to clear the stored draft before reloading.
  await expect.poll(() => alice.evaluate(() =>
    Object.keys(sessionStorage).filter(key => key.startsWith('chatmee:draft:v1:')).length)).toBe(0);
  await alice.reload();
  await expect(composer(alice)).toHaveValue('');
});
