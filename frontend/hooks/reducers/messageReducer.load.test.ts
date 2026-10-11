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

    it('RESET_roomChanged_clearsMessagesAndError', () => {
        const next = messageReducer({ ...initialState, error: 'Network Error', messages: [live, pending] }, { type: 'RESET' });
        expect(next).toEqual(initialState);
    });
});
