import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, createRef } from 'react';
import MessageList from '@/components/chat/MessageList';
import { act, render, renderHook } from '@testing-library/react';
import { useRoomMessages } from '../useRoomMessage';
import { messageReducer, initialState, MessageState, MessageAction } from './messageReducer';
import { Message, MessageResponse } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';
import { messageApi } from '@/lib/api/messageApi';

// The hook refreshes the opened room; keep the real HTTP client (and its timers) out of the timer-count tests.
vi.mock('@/lib/api/chatRoomApi', () => ({ chatRoomApi: { getChatRoomById: vi.fn(), getMembers: vi.fn() } }));

// Provide a valid base message to reduce boilerplate
const baseMessage = {
    chatRoomId: 'r1',
    senderId: 'u1',
    type: 'TEXT' as MessageType,
    content: 'Hi',
    createdAt: '',
    updatedAt: '',
    isUpdated: false,
    isDeleted: false,
    tempId: ''
};

describe('messageReducer', () => {
    it('FETCH_START sets loading to true and clears error', () => {
        const state: MessageState = { ...initialState, error: 'some error' };
        const nextState = messageReducer(state, { type: 'FETCH_START' });
        expect(nextState.loading).toBe(true);
        expect(nextState.error).toBeNull();
    });

    it('FETCH_SUCCESS sets messages with isOwn flag and updates hasMoreMessages', () => {
        const mockResponse: MessageResponse = {
            ...baseMessage,
            id: '1',
            content: 'Hello'
        };
        const nextState = messageReducer(initialState, {
            type: 'FETCH_SUCCESS',
            payload: { messages: [mockResponse], hasMore: true, userId: 'u1' }
        });
        expect(nextState.loading).toBe(false);
        expect(nextState.hasMoreMessages).toBe(true);
        expect(nextState.messages).toHaveLength(1);
        expect(nextState.messages[0].isOwn).toBe(true);
        expect(nextState.messages[0].status).toBe('sent');
    });

    // CM-046: a failed history load keeps live/own messages on screen (the list shows the error and Retry).
    it('FETCH_ERROR sets error and keeps messages on screen', () => {
        const state: MessageState = { ...initialState, loading: true, messages: [{ ...baseMessage, id: '1' } as Message] };
        const nextState = messageReducer(state, {
            type: 'FETCH_ERROR',
            payload: 'fetch failed'
        });
        expect(nextState.loading).toBe(false);
        expect(nextState.error).toBe('fetch failed');
        expect(nextState.messages.map((m) => m.id)).toEqual(['1']);
        expect(nextState.hasMoreMessages).toBe(false);
    });

    it('ADD_OPTIMISTIC_MESSAGE adds message without blocking another send', () => {
        const msg: Message = { ...baseMessage, id: 'tmp1', isOwn: true, status: 'sending', isOptimistic: true, tempId: 'tmp1' };
        const nextState = messageReducer(initialState, {
            type: 'ADD_OPTIMISTIC_MESSAGE',
            payload: msg
        });
        expect(nextState.messages).toHaveLength(1);
        expect(nextState.messages[0]).toEqual(msg);
    });

    it('CONFIRM_SENT_MESSAGE replaces optimistic message with confirmed state', () => {
        const msg: Message = { ...baseMessage, id: 'tmp1', isOwn: true, status: 'sending', isOptimistic: true, tempId: 'tmp1' };
        const state: MessageState = { ...initialState, messages: [msg] };
        
        const confirmedMsg: Message = { ...msg, id: 'real1', status: 'sent', isOptimistic: false, isOwn: true };
        const nextState = messageReducer(state, {
            type: 'CONFIRM_SENT_MESSAGE',
            payload: confirmedMsg
        });
        
        expect(nextState.messages).toHaveLength(1);
        expect(nextState.messages[0].id).toBe('real1');
        expect(nextState.messages[0].status).toBe('sent');
        expect(nextState.messages[0].isOwn).toBe(true);
    });

    it('FAIL_SENT_MESSAGE marks optimistic message as failed with error message', () => {
        const msg: Message = { ...baseMessage, id: 'tmp1', isOwn: true, status: 'sending', isOptimistic: true, tempId: 'tmp1' };
        const state: MessageState = { ...initialState, messages: [msg] };
        
        const nextState = messageReducer(state, {
            type: 'FAIL_SENT_MESSAGE',
            payload: { tempId: 'tmp1', error: 'Network error' }
        });
        
        expect(nextState.messages).toHaveLength(1);
        expect(nextState.messages[0].status).toBe('failed');
        expect(nextState.messages[0].errorMessage).toBe('Network error');
    });

    it('RECEIVE_WEBSOCKET_MESSAGE ignores duplicate incoming message', () => {
        const msg: Message = { ...baseMessage, id: 'real1', senderId: 'u2', isOwn: false, status: 'sent' };
        const state: MessageState = { ...initialState, messages: [msg] };
        
        const nextState = messageReducer(state, {
            type: 'RECEIVE_WEBSOCKET_MESSAGE',
            payload: { message: msg, userId: 'u1' }
        });
        
        expect(nextState.messages).toHaveLength(1);
        expect(nextState).toBe(state); // Should return same state object
    });

    it('RECEIVE_WEBSOCKET_MESSAGE adds new message and sets isOwn correctly', () => {
        const msg: Message = { ...baseMessage, id: 'real1', senderId: 'u2', isOwn: false, status: 'sent' };
        
        const nextState = messageReducer(initialState, {
            type: 'RECEIVE_WEBSOCKET_MESSAGE',
            payload: { message: msg, userId: 'u2' }
        });
        
        expect(nextState.messages).toHaveLength(1);
        expect(nextState.messages[0].id).toBe('real1');
        expect(nextState.messages[0].isOwn).toBe(true); // Since senderId == userId
    });

    it('default case returns current state', () => {
        const nextState = messageReducer(initialState, { type: 'UNKNOWN_ACTION' } as unknown as MessageAction);
        expect(nextState).toBe(initialState);
    });
});


const transport = vi.hoisted(() => {
    const roomCleanup = vi.fn();
    const errorCleanup = vi.fn();
    return {
        connected: true, connecting: false, roomCleanup, errorCleanup,
        sendMessage: vi.fn(),
        subscribeRoom: vi.fn<(roomId: string, onMessage: (message: Message) => void) => () => void>(() => roomCleanup),
        subscribeErrors: vi.fn<(handler: (error: { tempId?: string; message: string }) => void) => () => void>(
            () => errorCleanup),
        onReconnect: vi.fn<(listener: () => void) => () => void>(() => () => {}), getLastReconnectAt: vi.fn(() => 0),
    };
});
vi.mock('../useWebSocket', () => ({ useWebSocket: () => transport }));
vi.mock('@/lib/stores/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'u1', name: 'Alice' } }),
}));
vi.mock('@/lib/api/messageApi', () => ({
    messageApi: { getMessages: vi.fn().mockResolvedValue({ success: true, data: { messages: [], nextCursor: null, hasMore: false } }) },
}));

describe('useRoomMessages delivery timeout', () => {
    let sequence = 0;
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        transport.sendMessage.mockReset();
    });
    afterEach(() => { vi.useRealTimers(); });

    async function mountRoom() {
        const roomId = `timeout-room-${++sequence}`;
        const hook = renderHook(({ room }) => useRoomMessages(room), { initialProps: { room: roomId } });
        await act(async () => {});
        return { ...hook, roomId };
    }

    it('fails only after 10 seconds and allows another send while pending', async () => {
        const { result } = await mountRoom();
        act(() => { void result.current.sendMessage('first'); });
        expect(result.current.messages[0].status).toBe('sending');
        act(() => { void result.current.sendMessage('second'); });
        expect(transport.sendMessage).toHaveBeenCalledTimes(2);
        act(() => { vi.advanceTimersByTime(9999); });
        expect(result.current.messages.every(message => message.status === 'sending')).toBe(true);
        act(() => { vi.advanceTimersByTime(1); });
        expect(result.current.messages.every(message => message.status === 'failed')).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears the timer on confirmation and replaces a late failed message', async () => {
        const { result, roomId } = await mountRoom();
        act(() => { void result.current.sendMessage('first'); });
        const pending = result.current.messages[0];
        const receive = transport.subscribeRoom.mock.calls.find(call => call[0] === roomId)![1];
        act(() => { receive({ ...pending, id: 'saved', isOptimistic: undefined }); });
        expect(vi.getTimerCount()).toBe(0);
        act(() => { vi.advanceTimersByTime(10000); });
        expect(result.current.messages[0].status).toBe('sent');
        expect(result.current.messages[0].isOptimistic).toBe(false);
        act(() => { void result.current.sendMessage('late'); });
        const late = result.current.messages[1];
        act(() => { vi.advanceTimersByTime(10000); });
        expect(result.current.messages[1].status).toBe('failed');
        act(() => { receive({ ...late, id: 'saved-late' }); });
        expect(result.current.messages[1].status).toBe('sent');
    });

    it('clears timers on server error and synchronous send failure', async () => {
        const { result } = await mountRoom();
        act(() => { void result.current.sendMessage('first'); });
        const pending = result.current.messages[0];
        const onError = transport.subscribeErrors.mock.calls[0][0];
        act(() => { onError({ tempId: pending.tempId, message: 'Save failed' }); });
        expect(result.current.messages[0].status).toBe('failed');
        expect(vi.getTimerCount()).toBe(0);
        transport.sendMessage.mockImplementationOnce(() => { throw new Error('Disconnected'); });
        act(() => { void result.current.sendMessage('second'); });
        expect(result.current.messages[1].status).toBe('failed');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('resyncs the open room after a reconnect and keeps pending messages', async () => {
        const { result, roomId } = await mountRoom();
        act(() => { void result.current.sendMessage('pending'); });
        const pending = result.current.messages[0];
        const missed: MessageResponse = {
            ...baseMessage, id: 'missed', chatRoomId: roomId, senderId: 'u2', createdAt: '2026-10-09T10:00:00Z',
        };
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce({ success: true, message: 'ok', data: { messages: [missed], nextCursor: null, hasMore: false } });
        const reconnected = transport.onReconnect.mock.calls.at(-1)![0];
        await act(async () => { reconnected(); });
        expect(result.current.messages.map(m => m.id)).toEqual(['missed', pending.id]);
        expect(result.current.messages[1].status).toBe('sending');
    });

    it('clears timers and error subscriptions on room change and unmount', async () => {
        const { result, rerender, unmount } = await mountRoom();
        act(() => { void result.current.sendMessage('old room'); });
        expect(vi.getTimerCount()).toBe(1);
        await act(async () => { rerender({ room: `timeout-room-${++sequence}` }); });
        expect(vi.getTimerCount()).toBe(0);
        expect(transport.errorCleanup).toHaveBeenCalled();
        expect(transport.roomCleanup).toHaveBeenCalled();
        act(() => { void result.current.sendMessage('new room'); });
        expect(vi.getTimerCount()).toBe(1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});


describe('MessageList UTC display', () => {
    it('parses ISO UTC timestamps before local formatting and exposes delivery failures', () => {
        const previousScroll = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView = vi.fn();
        const formatTime = vi.fn((date: Date) => date.toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
        }));
        const view = render(createElement(MessageList, {
            messages: [{ ...baseMessage, id: 'failed', createdAt: '2026-10-08T12:34:56Z',
                isOwn: true, status: 'failed', errorMessage: 'Message confirmation timed out' }],
            onlineUsers: new Set<string>(), formatTime, formatDate: () => 'Today',
            messagesEndRef: createRef<HTMLDivElement>(),
        }));
        expect(view.getByText('19:34')).toBeInTheDocument();
        expect(formatTime.mock.calls[0][0].toISOString()).toBe('2026-10-08T12:34:56.000Z');
        expect(view.getByRole('img', { name: 'Failed to send' })).toHaveAttribute('title', 'Message confirmation timed out');
        HTMLElement.prototype.scrollIntoView = previousScroll;
    });
});
