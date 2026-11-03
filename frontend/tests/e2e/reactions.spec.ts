import type { Page } from '@playwright/test';
import { joinRoom } from './fixtures/journey';
import { test, expect, createConversation, me } from './fixtures/local-stack';

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message', exact: true });
const row = (page: Page, text: string) =>
  page.getByRole('log').locator('[data-message-id]').filter({ has: page.getByText(text, { exact: true }) });
const chip = (page: Page, text: string, name: string) => row(page, text).getByRole('button', { name, exact: true });
const chips = (page: Page, text: string) => row(page, text).getByRole('list', { name: 'Reactions' });

async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(row(page, text).getByRole('img', { name: 'Sent', exact: true })).toBeVisible();
}

async function quickReact(page: Page, text: string, item: string) {
  await row(page, text).getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  // The next bubble click must not land on a menu that is still closing.
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/**
 * The picker loads Emojibase data from its CDN; the local-only harness blocks external origins, so the page gets a
 * two-emoji fixture in the same shape instead. Nothing here contacts the real CDN.
 */
async function serveEmojiFixture(page: Page) {
  const emojis = [
    { label: 'grinning face', hexcode: '1F600', emoji: '😀', group: 0, order: 1, tags: ['face', 'grin'], version: 1 },
    { label: 'party popper', hexcode: '1F389', emoji: '🎉', group: 0, order: 2, tags: ['party'], version: 1 },
  ];
  const messages = {
    groups: [{ key: 'smileys-emotion', message: 'smileys & emotion', order: 0 }],
    subgroups: [],
    skinTones: ['light', 'medium-light', 'medium', 'medium-dark', 'dark'].map((key) => ({ key, message: `${key} skin tone` })),
  };
  await page.route('https://cdn.jsdelivr.net/**', (route) => {
    const url = route.request().url();
    const body = url.endsWith('/messages.json') ? messages : url.endsWith('/data.json') ? emojis : null;
    if (!body) return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { etag: '"cm-118-fixture"' }, body: JSON.stringify(body) });
  });
}

test('reactions_quickBarPickerAndWhoReacted_updateLiveForBothMembers', async ({ alice, bob }) => {
  const room = await createConversation(alice);
  await joinRoom(bob, room);
  const text = 'CM-118 react to this';
  await send(bob, text);
  await expect(row(alice, text)).toBeVisible();

  // Quick bar: Alice's pick shows as hers, and Bob sees the count live (AC-015-7, AC-015-10).
  await quickReact(alice, text, 'React with 👍');
  await expect(chip(alice, text, '👍 1, including you. Show who reacted')).toBeVisible();
  await expect(chip(bob, text, '👍 1. Show who reacted')).toBeVisible();

  // Another emoji changes the one reaction; it never adds a second (AC-015-1).
  await quickReact(alice, text, 'React with ❤️');
  await expect(chip(alice, text, '❤️ 1, including you. Show who reacted')).toBeVisible();
  await expect(chip(bob, text, '❤️ 1. Show who reacted')).toBeVisible();
  await expect(chips(bob, text).getByRole('button')).toHaveCount(1);

  // Picking the current one again undoes it.
  await quickReact(alice, text, 'Remove reaction ❤️');
  await expect(chips(alice, text)).toHaveCount(0);
  await expect(chips(bob, text)).toHaveCount(0);

  // "+" opens the lazy-loaded full picker.
  await serveEmojiFixture(alice);
  await quickReact(alice, text, 'More reactions');
  const picker = alice.getByRole('dialog', { name: 'Choose a reaction' });
  await expect(picker).toBeVisible();
  await picker.getByRole('gridcell', { name: 'Party popper' }).click();
  await expect(picker).toHaveCount(0);
  await expect(chip(alice, text, '🎉 1, including you. Show who reacted')).toBeVisible();
  await expect(chip(bob, text, '🎉 1. Show who reacted')).toBeVisible();

  // Bob reacts too, then opens who reacted from a chip (AC-015-6).
  await quickReact(bob, text, 'React with 👍');
  await expect(chip(alice, text, '👍 1. Show who reacted')).toBeVisible();
  await chip(bob, text, '🎉 1. Show who reacted').click();
  const sheet = bob.getByRole('dialog', { name: 'Reactions' });
  const aliceName = (await me(alice.context())).name;
  await expect(sheet.getByRole('tab', { name: '🎉, 1' })).toHaveAttribute('aria-selected', 'true');
  await expect(sheet.getByRole('list', { name: 'People who reacted' }).getByRole('listitem')).toHaveCount(1);
  await expect(sheet.getByText(aliceName, { exact: true })).toBeVisible();
  await sheet.getByRole('tab', { name: 'All reactions, 2' }).click();
  await expect(sheet.getByRole('list', { name: 'People who reacted' }).getByRole('listitem')).toHaveCount(2);
});

test.describe('360px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('reactions_mobile_chipsFitAndWhoReactedOpensAsDrawer', async ({ alice, bob }) => {
    const room = await createConversation(alice);
    await joinRoom(bob, room);
    const text = 'CM-118 small screen';
    await send(bob, text);
    await quickReact(alice, text, 'React with 😂');
    await expect(chip(bob, text, '😂 1. Show who reacted')).toBeVisible();

    // The chips stay inside the viewport; nothing scrolls sideways.
    expect(await bob.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const box = (await chips(bob, text).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);

    await chip(bob, text, '😂 1. Show who reacted').click();
    const drawer = bob.getByRole('dialog', { name: 'Reactions' });
    await expect(drawer).toBeVisible();
    // A bottom drawer: full width, anchored to the bottom edge (after its slide-in settles).
    await expect.poll(async () => {
      const b = (await drawer.boundingBox())!;
      return [Math.round(b.x), Math.round(b.width), Math.round(b.y + b.height)];
    }).toEqual([0, 360, 740]);
  });
});
