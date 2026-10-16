import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useChatStore } from './chatStore';

const typingIn = (roomId: string) => [...(useChatStore.getState().typingUsers[roomId] ?? [])];

describe('chatStore typing expiry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useChatStore.setState({ typingUsers: {} });
    });

    afterEach(() => {
        useChatStore.getState().clearTyping('r1');
        vi.useRealTimers();
    });

    it('updateTyping_noFurtherEventFor5Seconds_clearsTyping', () => {
        useChatStore.getState().updateTyping({ roomId: 'r1', userId: 'u2', typing: true });
        vi.advanceTimersByTime(4_999);
        expect(typingIn('r1')).toEqual(['u2']);
        vi.advanceTimersByTime(1);
        expect(typingIn('r1')).toEqual([]);
    });

    it('updateTyping_repeatedTypingEvent_restartsTheFiveSecondWindow', () => {
        const store = useChatStore.getState();
        store.updateTyping({ roomId: 'r1', userId: 'u2', typing: true });
        vi.advanceTimersByTime(4_000);
        store.updateTyping({ roomId: 'r1', userId: 'u2', typing: true });
        vi.advanceTimersByTime(4_000);
        expect(typingIn('r1')).toEqual(['u2']);
        vi.advanceTimersByTime(1_000);
        expect(typingIn('r1')).toEqual([]);
    });

    it('updateTyping_typingFalse_clearsImmediatelyAndCancelsExpiry', () => {
        const store = useChatStore.getState();
        store.updateTyping({ roomId: 'r1', userId: 'u2', typing: true });
        store.updateTyping({ roomId: 'r1', userId: 'u2', typing: false });
        expect(typingIn('r1')).toEqual([]);
        store.updateTyping({ roomId: 'r1', userId: 'u3', typing: true });
        vi.advanceTimersByTime(5_000);
        expect(typingIn('r1')).toEqual([]);
    });

    it('clearTyping_roomChanged_dropsOnlyThatRoomsTypingUsers', () => {
        const store = useChatStore.getState();
        store.updateTyping({ roomId: 'r1', userId: 'u2', typing: true });
        store.updateTyping({ roomId: 'r2', userId: 'u3', typing: true });
        store.clearTyping('r1');
        expect(typingIn('r1')).toEqual([]);
        expect(typingIn('r2')).toEqual(['u3']);
    });
});
