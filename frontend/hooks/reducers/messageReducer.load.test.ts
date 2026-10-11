import { describe, it, expect } from 'vitest';
import { messageReducer, initialState, MessageState } from './messageReducer';
import { Message, MessageResponse } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';

const base = {
    chatRoomId: 'r1', senderId: 'u2', type: MessageType.TEXT, content: 'Hi',
    updatedAt: '', isUpdated: false, isDeleted: false,
};
const history: MessageResponse[] = [
    { ...base, id: 's1', createdAt: '2026-10-09T10:00:00Z' },
    { ...base, id: 's2', createdAt: '2026-10-09T10:01:00Z' },
];
const live: Message = { ...base, id: 's3', createdAt: '2026-10-09T10:05:00Z', isOwn: false, status: 'sent' };
const pending: Message = {
    ...base, id: 'optimistic-t1', tempId: 't1', senderId: 'u1', content: 'mine',
    createdAt: '2026-10-09T10:06:00Z', isOwn: true, isOptimistic: true, status: 'sending',
};

describe('messageReducer history load', () => {
    it('FETCH_SUCCESS_liveMessagesArrivedDuringLoad_keptAndOrdered', () => {
        const loading: MessageState = { ...initialState, loading: true, messages: [live, pending] };
        const next = messageReducer(loading, { type: 'FETCH_SUCCESS', payload: { messages: history, hasMore: false, userId: 'u1' } });
        expect(next.messages.map(m => m.id)).toEqual(['s1', 's2', 's3', 'optimistic-t1']);
        expect(next.loading).toBe(false);
    });

    it('FETCH_SUCCESS_messageAlsoInHistory_notDuplicated', () => {
        const liveCopy: Message = { ...live, id: 's2', createdAt: '2026-10-09T10:01:00Z' };
        const next = messageReducer({ ...initialState, messages: [liveCopy] }, {
            type: 'FETCH_SUCCESS', payload: { messages: history, hasMore: false, userId: 'u1' },
        });
        expect(next.messages.map(m => m.id)).toEqual(['s1', 's2']);
    });

    it('FETCH_ERROR_withMessagesOnScreen_keepsMessagesAndStoresError', () => {
        const next = messageReducer({ ...initialState, loading: true, messages: [live] }, { type: 'FETCH_ERROR', payload: 'Network Error' });
        expect(next.messages.map(m => m.id)).toEqual(['s3']);
        expect(next.error).toBe('Network Error');
    });

    it('FETCH_SUCCESS_afterFailedLoadRetry_clearsErrorAndKeepsLiveMessages', () => {
        const failedLoad: MessageState = { ...initialState, error: 'Network Error', messages: [live] };
        const retrying = messageReducer(failedLoad, { type: 'FETCH_START' });
        const next = messageReducer(retrying, { type: 'FETCH_SUCCESS', payload: { messages: history, hasMore: true, userId: 'u1' } });
        expect(next.error).toBeNull();
        expect(next.hasMoreMessages).toBe(true);
        expect(next.messages.map(m => m.id)).toEqual(['s1', 's2', 's3']);
    });

    it('loadOlder_success_prependsWithoutDuplicates', () => {
        const newest = messageReducer(initialState, {
            type: 'FETCH_SUCCESS', payload: { messages: history, hasMore: true, nextCursor: 'c1', userId: 'u1' },
        });
        const loadingOlder = messageReducer(newest, { type: 'LOAD_OLDER_START' });
        expect(loadingOlder.loadingOlder).toBe(true);
        const older: MessageResponse[] = [
            { ...base, id: 's0', createdAt: '2026-10-09T09:59:00Z' },
            { ...base, id: 's1', createdAt: '2026-10-09T10:00:00Z' },
        ];
        const next = messageReducer(loadingOlder, {
            type: 'LOAD_OLDER_SUCCESS', payload: { messages: older, hasMore: true, nextCursor: 'c0', userId: 'u1' },
        });
        expect(next.messages.map(m => m.id)).toEqual(['s0', 's1', 's2']);
        expect(next.loadingOlder).toBe(false);
        expect(next.nextCursor).toBe('c0');
        expect(next.hasMoreMessages).toBe(true);
    });

    it('loadOlder_noMore_stopsRequesting', () => {
        const state: MessageState = { ...initialState, messages: [live], hasMoreMessages: true, nextCursor: 'c1', loadingOlder: true };
        const next = messageReducer(state, {
            type: 'LOAD_OLDER_SUCCESS', payload: { messages: history, hasMore: false, nextCursor: null, userId: 'u1' },
        });
        expect(next.hasMoreMessages).toBe(false);
        expect(next.nextCursor).toBeNull();
        expect(next.messages.map(m => m.id)).toEqual(['s1', 's2', 's3']);
    });

    it('loadOlder_error_keepsCursorForRetry', () => {
        const state: MessageState = { ...initialState, messages: [live], hasMoreMessages: true, nextCursor: 'c1', loadingOlder: true };
        const next = messageReducer(state, { type: 'LOAD_OLDER_ERROR', payload: 'Network Error' });
        expect(next).toMatchObject({ loadingOlder: false, olderError: 'Network Error', nextCursor: 'c1', hasMoreMessages: true });
        expect(messageReducer(next, { type: 'LOAD_OLDER_START' }).olderError).toBeNull();
    });

    it('resync_afterOlderPagesLoaded_keepsOlderMessages', () => {
        const older: MessageResponse = { ...base, id: 's0', createdAt: '2026-10-09T09:00:00Z' };
        const state: MessageState = {
            ...initialState, hasMoreMessages: true, nextCursor: 'c0',
            messages: [...[older, ...history].map((m): Message => ({ ...m, isOwn: false, status: 'sent' })), pending],
        };
        const missed: MessageResponse = { ...base, id: 's4', createdAt: '2026-10-09T10:04:00Z' };
        const next = messageReducer(state, { type: 'RESYNC', payload: { messages: [...history, missed], userId: 'u1' } });
        expect(next.messages.map(m => m.id)).toEqual(['s0', 's1', 's2', 's4', 'optimistic-t1']);
        expect(next.messages[4].status).toBe('sending');
        expect(next.nextCursor).toBe('c0');
        expect(next.hasMoreMessages).toBe(true);
    });

    it('RESET_roomChanged_clearsMessagesAndError', () => {
        const next = messageReducer({ ...initialState, error: 'Network Error', messages: [live, pending] }, { type: 'RESET' });
        expect(next).toEqual(initialState);
    });
});
