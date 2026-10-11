import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { messageReducer, initialState, MessageState } from './messageReducer';
import { useRoomMessages } from '../useRoomMessage';
import { Message, MessageResponse } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';
import { messageApi } from '@/lib/api/messageApi';

const base = {
    chatRoomId: 'r1', senderId: 'u1', type: MessageType.TEXT, content: 'Hi',
    createdAt: '2026-10-09T10:00:00Z', updatedAt: '', isUpdated: false, isDeleted: false,
};
const failed: Message = {
    ...base, id: 'optimistic-t1', tempId: 't1', isOwn: true, isOptimistic: true,
    status: 'failed', errorMessage: 'Too many messages. Try again in 3 s', errorCode: 'RATE_LIMITED',
};
const other: Message = { ...base, id: 's0', senderId: 'u2', isOwn: false, status: 'sent' };

describe('messageReducer resend/discard', () => {
    it('FAIL_SENT_MESSAGE_withCode_storesServerTextAndCode', () => {
        const sending: Message = { ...failed, status: 'sending', errorMessage: undefined, errorCode: undefined };
        const next = messageReducer({ ...initialState, messages: [sending] }, {
            type: 'FAIL_SENT_MESSAGE', payload: { tempId: 't1', error: 'Too many messages. Try again in 3 s', code: 'RATE_LIMITED' },
        });
        expect(next.messages[0]).toMatchObject({ status: 'failed', errorCode: 'RATE_LIMITED', errorMessage: 'Too many messages. Try again in 3 s' });
    });

    it('RESEND_MESSAGE_failedMessage_replacedByNewAttemptNotDuplicated', () => {
        const state: MessageState = { ...initialState, messages: [failed, other] };
        const retry: Message = { ...failed, id: 'optimistic-t2', tempId: 't2', status: 'sending', errorMessage: undefined, errorCode: undefined };
        const next = messageReducer(state, { type: 'RESEND_MESSAGE', payload: { tempId: 't1', message: retry } });
        expect(next.messages.map(m => m.id)).toEqual(['s0', 'optimistic-t2']);
        expect(next.messages[1].status).toBe('sending');
    });

    it('DISCARD_MESSAGE_failedMessage_removed', () => {
        const next = messageReducer({ ...initialState, messages: [other, failed] }, { type: 'DISCARD_MESSAGE', payload: { tempId: 't1' } });
        expect(next.messages.map(m => m.id)).toEqual(['s0']);
    });

    it('DISCARD_MESSAGE_pendingMessage_kept', () => {
        const pending: Message = { ...failed, status: 'sending' };
        const next = messageReducer({ ...initialState, messages: [pending] }, { type: 'DISCARD_MESSAGE', payload: { tempId: 't1' } });
        expect(next.messages).toHaveLength(1);
    });

    it('CONFIRM_SENT_MESSAGE_noPendingCopy_appendsOnce', () => {
        const confirmation: Message = { ...base, id: 's1', tempId: 't9' };
        const once = messageReducer({ ...initialState, messages: [other] }, { type: 'CONFIRM_SENT_MESSAGE', payload: confirmation });
        expect(once.messages.map(m => m.id)).toEqual(['s0', 's1']);
        expect(once.messages[1]).toMatchObject({ isOwn: true, status: 'sent' });
        const twice = messageReducer(once, { type: 'CONFIRM_SENT_MESSAGE', payload: confirmation });
        expect(twice).toBe(once);
    });
});

const transport = vi.hoisted(() => ({
    connected: true, connecting: false,
    sendMessage: vi.fn<(roomId: string, content: string, tempId?: string) => boolean>(() => true),
    subscribeRoom: vi.fn<(roomId: string, onMessage: (message: Message) => void) => () => void>(() => () => {}),
    subscribeErrors: vi.fn<(handler: (error: { tempId?: string; code?: string; message: string }) => void) => () => void>(() => () => {}),
    onReconnect: vi.fn<(listener: () => void) => () => void>(() => () => {}),
    getLastReconnectAt: vi.fn(() => 0),
}));
vi.mock('../useWebSocket', () => ({ useWebSocket: () => transport }));
vi.mock('@/lib/stores/authStore', () => ({ useAuthStore: () => ({ user: { id: 'u1', name: 'Alice' } }) }));
vi.mock('@/lib/api/messageApi', () => ({
    messageApi: { get50RecentMessages: vi.fn().mockResolvedValue({ success: true, data: [] }) },
}));

describe('useRoomMessages resend, reload and resync', () => {
    let sequence = 0;
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        transport.sendMessage.mockImplementation(() => true);
    });
    afterEach(() => { vi.useRealTimers(); });

    async function mountRoom() {
        const roomId = `resend-room-${++sequence}`;
        const hook = renderHook(() => useRoomMessages(roomId));
        await act(async () => {});
        return { ...hook, roomId };
    }

    it('resendMessage_rateLimitedMessage_publishesNewAttemptAndReplacesFailedCopy', async () => {
        const { result } = await mountRoom();
        act(() => { void result.current.sendMessage('hello'); });
        const first = result.current.messages[0];
        const onError = transport.subscribeErrors.mock.calls.at(-1)![0];
        act(() => { onError({ tempId: first.tempId, code: 'RATE_LIMITED', message: 'Too many messages. Try again in 3 s' }); });
        expect(result.current.messages[0].errorMessage).toBe('Too many messages. Try again in 3 s');

        act(() => { result.current.resendMessage(first.tempId as string); });
        expect(result.current.messages).toHaveLength(1);
        const retry = result.current.messages[0];
        expect(retry.status).toBe('sending');
        expect(retry.tempId).not.toBe(first.tempId);
        expect(transport.sendMessage).toHaveBeenLastCalledWith(expect.any(String), 'hello', retry.tempId);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('discardMessage_failedMessage_removedFromList', async () => {
        const { result } = await mountRoom();
        transport.sendMessage.mockImplementationOnce(() => false);
        act(() => { void result.current.sendMessage('lost'); });
        expect(result.current.messages[0]).toMatchObject({ status: 'failed', errorCode: 'NOT_SENT' });
        act(() => { result.current.discardMessage(result.current.messages[0].tempId as string); });
        expect(result.current.messages).toHaveLength(0);
    });

    it('reload_afterLoadFailure_showsLoadingThenMessages', async () => {
        vi.mocked(messageApi.get50RecentMessages).mockRejectedValueOnce(new Error('Network Error'));
        const { result } = await mountRoom();
        expect(result.current.error).toBe('Network Error');
        const saved: MessageResponse = { ...base, id: 's1' };
        vi.mocked(messageApi.get50RecentMessages).mockResolvedValueOnce({ success: true, message: 'ok', data: [saved] });
        act(() => { result.current.reload(); });
        expect(result.current.loading).toBe(true);
        await act(async () => {});
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
        expect(result.current.messages.map(m => m.id)).toEqual(['s1']);
    });

    it('resync_lostConfirmation_confirmsPendingAndClearsTimer', async () => {
        const { result, roomId } = await mountRoom();
        act(() => { void result.current.sendMessage('hello'); });
        const pending = result.current.messages[0];
        const savedCopy: MessageResponse = { ...base, id: 's1', chatRoomId: roomId, content: 'hello', createdAt: pending.createdAt };
        vi.mocked(messageApi.get50RecentMessages).mockResolvedValueOnce({ success: true, message: 'ok', data: [savedCopy] });
        const reconnected = transport.onReconnect.mock.calls.at(-1)![0];
        await act(async () => { reconnected(); });
        expect(result.current.messages.map(m => m.id)).toEqual(['s1']);
        expect(result.current.messages[0].status).toBe('sent');
        expect(vi.getTimerCount()).toBe(0);
    });
});
