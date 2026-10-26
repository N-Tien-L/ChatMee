import type { Page, WebSocketRoute } from '@playwright/test';
import { expect, origin } from './local-stack';

export interface StoredMessage { id: string; content: string; clientMessageId?: string; createdAt: string }
export interface RoomState { id: string; roomName: string; state: string; blocked: boolean; unreadCount: number; counterpart?: { id: string; name: string } }
export async function mutate(page: Page, path: string, method = 'POST', body?: unknown) {
  return page.evaluate(async ({ path, method, body }) => {
    const csrf = document.cookie.split('; ').find(value => value.startsWith('XSRF-TOKEN='))?.split('=')[1];
    const response = await fetch(path, { method,
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(csrf ?? '') },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }, { path, method, body });
}
export async function rooms(page: Page): Promise<RoomState[]> {
  const response = await page.request.get(origin + '/api/v1/rooms');
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}
export async function history(page: Page, room: string) {
  const messages: StoredMessage[] = [];
  const seen = new Set<string>();
  let before: string | null = null;
  do {
    const response = await page.request.get(`${origin}/api/v1/rooms/${room}/messages`, { params: before ? { before } : {} });
    expect(response.status()).toBe(200);
    const data = (await response.json()).data as { messages: StoredMessage[]; nextCursor: string | null };
    messages.unshift(...data.messages);
    before = data.nextCursor;
    if (before) { expect(seen.has(before)).toBe(false); seen.add(before); }
    expect(seen.size).toBeLessThan(100);
  } while (before);
  expect(new Set(messages.map(message => message.id)).size).toBe(messages.length);
  return messages;
}
export async function openRoom(page: Page, room: string) {
  if (await page.getByRole('button', { name: 'Back to chat rooms', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Back to chat rooms', exact: true }).click();
  const response = await page.request.get(origin + '/api/v1/rooms/' + room);
  expect(response.status()).toBe(200);
  const state = (await response.json()).data as RoomState;
  await page.getByRole('complementary', { name: 'Chat rooms' })
    .getByText(state.counterpart?.name || state.roomName, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(room));
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  await expect(page.getByText('On air', { exact: true })).toBeVisible();
}
export async function joinRoom(page: Page, room: string) {
  await expect(page.getByText('On air', { exact: true })).toBeVisible();
  expect((await mutate(page, `/api/v1/rooms/${room}/members/me`)).status).toBe(204);
  await openRoom(page, room);
}
export async function sendStored(page: Page, room: string, text: string, confirmation: 'echo' | 'history' = 'echo') {
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  if (confirmation === 'echo') {
    await expect(page.getByRole('log').locator('[data-message-id]').filter({ has: page.getByText(text, { exact: true }) })
      .getByRole('img', { name: 'Sent', exact: true })).toBeVisible();
    expect((await history(page, room)).filter(message => message.content === text)).toHaveLength(1);
  } else {
    await expect.poll(async () => (await history(page, room)).filter(message => message.content === text).length).toBe(1);
  }
}
export async function expectHistory(page: Page, room: string) {
  const persisted = await history(page, room);
  await expect.poll(() => page.locator('[data-message-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-message-id'))))
    .toEqual(persisted.map(message => message.id));
  for (const message of persisted) await expect(page.locator(`[data-message-id="${message.id}"]`)).toContainText(message.content);
}
// Transport-only simulation. Successful HTTP responses and persisted message rows stay real.
export async function socketFaults(page: Page) {
  const control = { offline: false, dropSend: false, dropEcho: '', sends: [] as string[], frames: [] as string[],
    cut: (): void => { throw new Error('Socket not connected'); }, inject: (frame: string): void => { throw new Error('Socket not connected: ' + Boolean(frame)); } };
  await page.routeWebSocket('ws://127.0.0.1:8100/ws', socket => {
    if (control.offline) { socket.close(); return; }
    const server: WebSocketRoute = socket.connectToServer();
    control.cut = () => { socket.close(); server.close(); };
    control.inject = frame => server.send(frame);
    socket.onMessage(frame => {
      const text = String(frame);
      if (text.startsWith('SEND') && text.includes('/app/chat.sendMessage')) {
        control.sends.push(text);
        if (control.dropSend) return;
      }
      server.send(frame);
    });
    server.onMessage(frame => {
      const text = String(frame);
      control.frames.push(text);
      if (control.dropEcho && text.startsWith('MESSAGE') && text.includes('"content":' + JSON.stringify(control.dropEcho))) return;
      socket.send(frame);
    });
  });
  return control;
}
export function anotherSend(frame: string, content: string) {
  const divider = frame.indexOf('\n\n');
  const body = JSON.parse(frame.slice(divider + 2).replace(/\0$/, '')) as Record<string, unknown>;
  body.content = content;
  body.tempId = crypto.randomUUID();
  const encoded = JSON.stringify(body);
  const headers = frame.slice(0, divider).replace(/\ncontent-length:[^\n]*/, '');
  return `${headers}\ncontent-length:${Buffer.byteLength(encoded)}\n\n${encoded}\0`;
}

// UI setup for independent journeys. The original API-create + reload fixture stays
// unchanged in inherited tests and the CM-100 regression; its failure remains visible.
export async function createUiConversation(page: Page) {
  if (await page.getByRole('button', { name: 'Back to chat rooms', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Back to chat rooms', exact: true }).click();
  await page.getByRole('complementary', { name: 'Chat rooms' }).getByRole('button', { name: 'New room', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New room', exact: true });
  await dialog.getByRole('textbox', { name: 'Room name', exact: true }).fill('Synthetic CM-097 ' + crypto.randomUUID().slice(0, 8));
  await dialog.getByText('Public', { exact: true }).click();
  await expect(dialog.getByRole('radio', { name: /^Public / })).toBeChecked();
  await dialog.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(page).toHaveURL(/roomId=/);
  const room = new URL(page.url()).searchParams.get('roomId')!;
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  await expect(page.getByText('On air', { exact: true })).toBeVisible();
  return room;
}
