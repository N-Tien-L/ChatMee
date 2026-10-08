import { describe, it, expect } from 'vitest';
import { messageReducer, initialState, MessageState, MessageAction } from './messageReducer';
import { Message, MessageResponse } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';

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

    it('FETCH_ERROR sets error and clears messages', () => {
        const state: MessageState = { ...initialState, loading: true, messages: [{ ...baseMessage, id: '1' } as Message] };
        const nextState = messageReducer(state, {
            type: 'FETCH_ERROR',
            payload: 'fetch failed'
        });
        expect(nextState.loading).toBe(false);
        expect(nextState.error).toBe('fetch failed');
        expect(nextState.messages).toEqual([]);
        expect(nextState.hasMoreMessages).toBe(false);
    });

    it('ADD_OPTIMISTIC_MESSAGE adds message and sets sending to true', () => {
        const msg: Message = { ...baseMessage, id: 'tmp1', isOwn: true, status: 'sending', isOptimistic: true, tempId: 'tmp1' };
        const nextState = messageReducer(initialState, {
            type: 'ADD_OPTIMISTIC_MESSAGE',
            payload: msg
        });
        expect(nextState.sending).toBe(true);
        expect(nextState.messages).toHaveLength(1);
        expect(nextState.messages[0]).toEqual(msg);
    });

    it('CONFIRM_SENT_MESSAGE replaces optimistic message with confirmed state', () => {
        const msg: Message = { ...baseMessage, id: 'tmp1', isOwn: true, status: 'sending', isOptimistic: true, tempId: 'tmp1' };
        const state: MessageState = { ...initialState, sending: true, messages: [msg] };
        
        const confirmedMsg: Message = { ...msg, id: 'real1', status: 'sent', isOptimistic: false, isOwn: true };
        const nextState = messageReducer(state, {
            type: 'CONFIRM_SENT_MESSAGE',
            payload: confirmedMsg
        });
        
        expect(nextState.sending).toBe(false);
        expect(nextState.messages).toHaveLength(1);
        expect(nextState.messages[0].id).toBe('real1');
        expect(nextState.messages[0].status).toBe('sent');
        expect(nextState.messages[0].isOwn).toBe(true);
    });

    it('FAIL_SENT_MESSAGE marks optimistic message as failed with error message', () => {
        const msg: Message = { ...baseMessage, id: 'tmp1', isOwn: true, status: 'sending', isOptimistic: true, tempId: 'tmp1' };
        const state: MessageState = { ...initialState, sending: true, messages: [msg] };
        
        const nextState = messageReducer(state, {
            type: 'FAIL_SENT_MESSAGE',
            payload: { tempId: 'tmp1', error: 'Network error' }
        });
        
        expect(nextState.sending).toBe(false);
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
