import { setTimeout as pace } from 'node:timers/promises';
import type { Page } from '@playwright/test';
import { history, joinRoom } from './fixtures/journey';
import { test, expect, createConversation, me } from './fixtures/local-stack';

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message', exact: true });
const row = (page: Page, text: string) =>
  page.getByRole('log').locator('[data-message-id]').filter({ has: page.getByText(text, { exact: true }) });

async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(row(page, text).getByRole('img', { name: 'Sent', exact: true })).toBeVisible();
}

test('reply_toMessageMoreThan100Back_jumpsToDetachedSegmentAndBack', async ({ alice, bob }) => {
  test.setTimeout(240_000);
  const room = await createConversation(alice);
  await joinRoom(bob, room);
  await send(bob, 'CM-115 far original');
  for (let n = 0; n < 105; n++) {
    // Pace below the unchanged 10 sends / 5 seconds limit; this delay is not an assertion.
    await pace(550);
    await send(bob, `CM-115 filler ${n}`);
    // Keep both HTTP sessions alive: sends go over the socket only.
    if (n % 10 === 0) await Promise.all([me(alice.context()), me(bob.context())]);
  }

  // Alice scrolls back through older pages until the original is loaded, then replies to it from its menu.
  await alice.reload();
  await expect(alice.getByText('On air', { exact: true })).toBeVisible();
  const scroller = alice.getByTestId('message-scroll');
  await expect.poll(async () => {
    await scroller.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
    return row(alice, 'CM-115 far original').count();
  }, { timeout: 60_000 }).toBe(1);
  const original = row(alice, 'CM-115 far original');
  await original.getByRole('button', { name: 'More actions', exact: true }).click();
  await alice.getByRole('menuitem', { name: 'Reply', exact: true }).click();
  await expect(alice.getByRole('status', { name: /^Replying to E2E bob-/ })).toBeVisible();
  await expect(composer(alice)).toBeFocused();
  await composer(alice).fill('CM-115 the reply');
  await alice.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(alice.getByRole('status', { name: /^Replying to E2E bob-/ })).toHaveCount(0);
  await expect(row(alice, 'CM-115 the reply').getByRole('img', { name: 'Sent', exact: true })).toBeVisible();

  // The server stored its own snapshot of the target.
  const stored = (await history(alice, room)).find(message => message.content === 'CM-115 the reply') as
    unknown as { replyTo?: { messageId: string; senderName: string; preview: string } };
  const target = (await history(alice, room)).find(message => message.content === 'CM-115 far original')!;
  // By id: the reply's quote repeats the original's text, so a text filter would also match the reply row.
  const originalRow = alice.locator(`[data-message-id="${target.id}"]`);
  expect(stored.replyTo).toMatchObject({ messageId: target.id, senderName: expect.stringMatching(/^E2E bob-/), preview: 'CM-115 far original' });

  // Bob receives the reply live, quote included.
  await expect(row(bob, 'CM-115 the reply').getByTestId('reply-quote')).toContainText('CM-115 far original');

  // After a reload only the newest page is loaded: the original is more than 100 messages back.
  await alice.reload();
  await expect(alice.getByText('On air', { exact: true })).toBeVisible();
  await expect(row(alice, 'CM-115 the reply')).toBeVisible();
  await expect(originalRow).toHaveCount(0);
  await row(alice, 'CM-115 the reply')
    .getByRole('button', { name: /^Jump to the message from E2E bob-.* this replies to$/ }).click();

  // The context window opens as a detached segment around the highlighted original, never joined to the live tail.
  await expect(alice.getByText('Viewing an earlier part of the conversation.', { exact: true })).toBeVisible();
  const jumped = originalRow;
  await expect(jumped).toHaveAttribute('data-highlighted', 'true');
  await expect(jumped).toBeInViewport();
  await expect(row(alice, 'CM-115 the reply')).toHaveCount(0);
  await expect(row(alice, 'CM-115 filler 0')).toHaveCount(1);

  await alice.getByRole('button', { name: 'Jump to latest', exact: true }).click();
  await expect(alice.getByText('Viewing an earlier part of the conversation.', { exact: true })).toHaveCount(0);
  await expect(row(alice, 'CM-115 the reply')).toBeVisible();
  await expect(originalRow).toHaveCount(0);
});

test.describe('touch', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

  test('reply_swipeRight_startsReplyAndSends', async ({ alice, bob }) => {
    const room = await createConversation(alice);
    await joinRoom(bob, room);
    await send(bob, 'CM-115 swipe me');
    const bubble = row(alice, 'CM-115 swipe me').getByRole('button', { name: 'More actions', exact: true });
    await expect(bubble).toBeVisible();

    // Playwright has no swipe gesture: dispatch the touch pointer stream the browser would produce.
    const box = (await bubble.boundingBox())!;
    const y = box.y + box.height / 2;
    const at = (x: number, dy = 0) => ({ pointerType: 'touch', pointerId: 11, isPrimary: true, clientX: x, clientY: y + dy, button: 0 });
    // A vertical drag is a scroll: no reply, no menu.
    await bubble.dispatchEvent('pointerdown', at(box.x + 10));
    await bubble.dispatchEvent('pointermove', at(box.x + 12, 40));
    await bubble.dispatchEvent('pointerup', at(box.x + 12, 40));
    await expect(alice.getByRole('status', { name: /^Replying to E2E bob-/ })).toHaveCount(0);
    await expect(alice.getByRole('menu')).toHaveCount(0);

    await bubble.dispatchEvent('pointerdown', at(box.x + 10));
    for (const dx of [20, 45, 70]) await bubble.dispatchEvent('pointermove', at(box.x + 10 + dx, 2));
    await bubble.dispatchEvent('pointerup', at(box.x + 80, 2));
    await expect(alice.getByRole('status', { name: /^Replying to E2E bob-/ })).toBeVisible();
    await expect(alice.getByRole('menu')).toHaveCount(0);

    await send(alice, 'CM-115 swiped reply');
    await expect(row(alice, 'CM-115 swiped reply').getByTestId('reply-quote')).toContainText('CM-115 swipe me');
    // No horizontal overflow at 360 px with a quote on screen.
    expect(await alice.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
