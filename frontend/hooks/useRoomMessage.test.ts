import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRoomMessages } from './useRoomMessage';
import { Message, MessageResponse } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';
import { messageApi } from '@/lib/api/messageApi';

const transport = vi.hoisted(() => ({
    connected: true, connecting: false,
    sendMessage: vi.fn<(roomId: string, content: string, tempId?: string) => boolean>(() => true),
    subscribeRoom: vi.fn<(roomId: string, onMessage: (message: Message) => void) => () => void>(() => () => {}),
    subscribeErrors: vi.fn<(handler: (error: { tempId?: string; code?: string; message: string }) => void) => () => void>(() => () => {}),
    onReconnect: vi.fn<(listener: () => void) => () => void>(() => () => {}),
    getLastReconnectAt: vi.fn(() => 0),
}));
vi.mock('./useWebSocket', () => ({ useWebSocket: () => transport }));
vi.mock('@/lib/stores/authStore', () => ({ useAuthStore: () => ({ user: { id: 'u1', name: 'Alice' } }) }));
vi.mock('@/lib/api/messageApi', () => ({
    messageApi: { getMessages: vi.fn().mockResolvedValue({ success: true, data: { messages: [], nextCursor: null, hasMore: false } }) },
}));

const base = {
    chatRoomId: 'r1', senderId: 'u1', type: MessageType.TEXT, content: 'hello',
    createdAt: '2026-10-09T10:00:00Z', updatedAt: '2026-10-09T10:00:00Z', isUpdated: false, isDeleted: false,
};

describe('useRoomMessages client ids (SPEC-008 AC-008-13)', () => {
    let sequence = 0;
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        transport.sendMessage.mockImplementation(() => true);
    });
    afterEach(() => { vi.useRealTimers(); });

    async function mountRoom() {
        const roomId = `client-id-room-${++sequence}`;
        const hook = renderHook(() => useRoomMessages(roomId));
        await act(async () => {});
        return { ...hook, roomId };
    }

    it('resync_lostEchoMoreThanTheMatchWindowAgo_showsStoredMessageOnce', async () => {
        const { result, roomId } = await mountRoom();
        act(() => { void result.current.sendMessage('hello'); });
        const pending = result.current.messages[0];
        // Five minutes later the content heuristic cannot match; only the stored client id can.
        const storedAt = new Date(Date.parse(pending.createdAt) + 5 * 60_000).toISOString();
        // History carries clientMessageId (not tempId): the stored client id is the only link to the pending copy.
        const saved: MessageResponse = { ...base, id: 's1', chatRoomId: roomId, clientMessageId: pending.tempId, createdAt: storedAt, updatedAt: storedAt };
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce({ success: true, message: 'ok', data: { messages: [saved], nextCursor: null, hasMore: false } });

        const reconnected = transport.onReconnect.mock.calls.at(-1)![0];
        await act(async () => { reconnected(); });

        expect(result.current.messages.map(m => m.id)).toEqual(['s1']);
        expect(result.current.messages[0].status).toBe('sent');
    });

    it('resend_afterTimedOutSend_reusesClientIdAndStoredCopyConfirmsIt', async () => {
        const { result } = await mountRoom();
        act(() => { void result.current.sendMessage('hello'); });
        const first = result.current.messages[0];
        act(() => { vi.advanceTimersByTime(10_000); });
        expect(result.current.messages[0].status).toBe('failed');

        act(() => { result.current.resendMessage(first.tempId as string); });
        expect(transport.sendMessage).toHaveBeenLastCalledWith(expect.any(String), 'hello', first.tempId);

        // The server stored the first attempt; its broadcast carries the same client id and confirms the retry.
        const onMessage = transport.subscribeRoom.mock.calls.at(-1)![1];
        const echo: Message = { ...base, id: 's1', tempId: first.tempId, isOwn: true, status: 'sent' };
        act(() => { onMessage(echo); });
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0]).toMatchObject({ id: 's1', status: 'sent' });
    });

    it('sendMessage_twoNewSends_getDistinctClientIds', async () => {
        const { result } = await mountRoom();
        act(() => { void result.current.sendMessage('one'); });
        act(() => { void result.current.sendMessage('two'); });

        const [first, second] = result.current.messages;
        expect(first.tempId).toBeTruthy();
        expect(second.tempId).not.toBe(first.tempId);
        expect(transport.sendMessage).toHaveBeenNthCalledWith(1, expect.any(String), 'one', first.tempId);
        expect(transport.sendMessage).toHaveBeenNthCalledWith(2, expect.any(String), 'two', second.tempId);
    });
});
