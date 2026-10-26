import type { Page } from '@playwright/test';
import { test, expect, createConversation as createWithReload } from './fixtures/local-stack';
import { expectHistory, history, joinRoom, sendStored, createUiConversation as createConversation } from './fixtures/journey';

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
for (const touch of [false, true]) {
  test.describe(touch ? '360px touch' : 'desktop keyboard', () => {
    test.use({ viewport: touch ? { width: 360, height: 740 } : { width: 1280, height: 900 },
      hasTouch: touch, contextOptions: { reducedMotion: 'reduce' } });
    test('mobile_backNavigationAndOwnMenu_restoreConversation', async ({ alice }) => {
      const room = await createConversation(alice);
      await sendStored(alice, room, 'CM-097 own navigation message');
      const own = alice.getByRole('log').getByRole('button', { name: 'More actions', exact: true }).first();
      if (touch) await own.tap(); else { await own.focus(); await own.press('Enter'); }
      await expect(alice.getByRole('menuitem', { name: 'Copy text' })).toBeVisible();
      await expect(alice.getByRole('menuitem', { name: 'Report message' })).toHaveCount(0);
      await alice.keyboard.press('Escape');
      await expect(own).toBeFocused();
      if (touch) await alice.getByRole('button', { name: 'Back to chat rooms', exact: true }).tap();
      else await alice.goBack();
      await expect(alice).toHaveURL(/\/dashboard$/);
      await expect(alice.getByRole('complementary', { name: 'Chat rooms' })).toBeVisible();
      await noOverflow(alice);
      if (touch) await alice.goBack(); else await alice.goForward();
      await expect(alice).toHaveURL(new RegExp(room));
      const input = alice.getByRole('textbox', { name: 'Message', exact: true });
      await expect(input).toBeVisible();
      await input.focus();
      await expect(input).toBeFocused();
      await expectHistory(alice, room);
    });
    test('mobile_chatInputAndActions_remainReachable', async ({ alice, bob }) => {
      const room = await createConversation(alice);
      await joinRoom(bob, room);
      await noOverflow(alice);
      expect(await alice.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      const input = alice.getByRole('textbox', { name: 'Message', exact: true });
      await input.focus();
      await expect(input).toBeFocused();
      await expect(input).toHaveAccessibleDescription('Press Enter to send, Shift+Enter for a new line.');
      await input.fill('CM-097 IME draft');
      // Synthetic composition event checks the browser handler; it is not a physical IME/mobile keyboard.
      const count = (await history(alice, room)).length;
      await input.dispatchEvent('compositionstart', { data: 'draft' });
      await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true });
      await expect(input).toHaveValue('CM-097 IME draft');
      expect((await history(alice, room)).length).toBe(count);
      await input.dispatchEvent('compositionend', { data: 'draft' });
      await input.press('Shift+Enter');
      await input.pressSequentially('second line');
      await expect(input).toHaveValue('CM-097 IME draft\nsecond line');
      await input.press('Enter');
      await expect(input).toHaveValue('');
      await expect.poll(async () => (await history(alice, room)).filter(message => message.content === 'CM-097 IME draft\nsecond line').length).toBe(1);
      await sendStored(bob, room, 'CM-097 received menu text');
      await expectHistory(alice, room);
      const received = (await history(alice, room)).find(message => message.content === 'CM-097 received menu text')!;
      const trigger = alice.locator(`[data-message-id="${received.id}"]`).getByRole('button', { name: 'More actions', exact: true });
      if (touch) await trigger.tap();
      else { await trigger.focus(); await trigger.press('Enter'); }
      const menu = alice.getByRole('menu');
      await expect(menu).toBeVisible();
      const time = await alice.evaluate(value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), received.createdAt);
      await expect(menu).toContainText(time);
      await expect(menu.getByRole('menuitem', { name: 'Copy text' })).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'Report message' })).toBeVisible();
      await alice.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await menu.getByRole('menuitem', { name: 'Copy text' }).click();
      await expect(alice.getByText('Copied', { exact: true })).toBeVisible();
      expect(await alice.evaluate(() => navigator.clipboard.readText())).toBe(received.content);
      await expect(trigger).toBeFocused();
      if (touch) await trigger.tap();
      else await trigger.press('Enter');
      await alice.getByRole('menuitem', { name: 'Report message' }).click();
      const dialog = alice.getByRole('dialog', { name: /Report message from/ });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('radio', { name: 'Spam', exact: true }).check();
      const reported = alice.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/reports' && response.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Send report', exact: true }).click();
      expect((await reported).status()).toBe(202);
      await expect(dialog).toHaveCount(0);
      await expect(alice.locator('body')).not.toHaveCSS('pointer-events', 'none');
      await expect(trigger).toBeFocused();
      // Cancel must release the same layers and restore the same keyboard target.
      if (touch) await trigger.tap(); else await trigger.press('Enter');
      await alice.getByRole('menuitem', { name: 'Report message' }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await noOverflow(alice);
      // Own-message menu must retain Copy/time and omit reporting one's own message.
      const own = alice.getByRole('log').getByRole('button', { name: 'More actions', exact: true }).first();
      await own.click();
      await expect(alice.getByRole('menuitem', { name: 'Report message' })).toHaveCount(0);
      await alice.keyboard.press('Escape');
      if (touch) {
        await alice.getByRole('button', { name: 'Back to chat rooms', exact: true }).tap();
        await expect(alice).toHaveURL(/\/dashboard$/);
        await expect(alice.getByRole('complementary', { name: 'Chat rooms' })).toBeVisible();
        await noOverflow(alice);
        await alice.goBack();
        await expect(alice).toHaveURL(new RegExp(room));
        await expect(input).toBeVisible();
        await input.focus();
        await expect(input).toBeFocused();
        await expectHistory(alice, room);
      }
    });
  });
}

// CM-100: retain the failing cold-navigation path independently of other journeys.
test('room_apiCreateThenReload_keepsComposerReachable', async ({ alice }) => {
  await createWithReload(alice);
});
