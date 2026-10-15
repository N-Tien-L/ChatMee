import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { StompProvider } from './StompProvider';
import { useAuthStore } from '@/lib/stores/authStore';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useChatStore } from '@/lib/stores/chatStore';
import { useInboxStore } from '@/lib/stores/inboxStore';
import { chatRoomApi } from '@/lib/api/chatRoomApi';

const session = vi.hoisted(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    onConnected: vi.fn(() => () => {}),
    onSubscriptionDenied: vi.fn(() => () => {}),
    onStatus: vi.fn(() => () => {}),
    getStatus: vi.fn(() => 'idle'),
}));
vi.mock('./stompSession', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./stompSession')>();
    return { ...actual, createStompSession: () => session };
});
vi.mock('@/lib/api/chatRoomApi', () => ({
    chatRoomApi: { getOnlineUsers: vi.fn(), getChatRooms: vi.fn(), getChatRoomById: vi.fn(), markRoomRead: vi.fn() },
}));
vi.mock('./stompClient', () => ({ createStompClientFactory: () => vi.fn() }));

afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false, loading: false });
});

describe('StompProvider', () => {
    it('mount_expiredSessionWithLegacyStoredFlag_opensNoSocketBeforeMeAnswers', async () => {
        localStorage.setItem(
            'auth-storage',
            JSON.stringify({ state: { isAuthenticated: true, user: { id: 'u1', name: 'Ann' } }, version: 0 }),
        );
        await useAuthStore.persist.rehydrate();
        render(<StompProvider><p>x</p></StompProvider>);
        expect(session.start).not.toHaveBeenCalled();
    });

    it('mount_meSucceeds_startsSocketOnce', () => {
        render(<StompProvider><p>x</p></StompProvider>);
        expect(session.start).not.toHaveBeenCalled();
        act(() => {
            useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1', name: 'Ann' } as never });
        });
        expect(session.start).toHaveBeenCalledTimes(1);
    });

    it('logout_afterConnect_stopsSocket', () => {
        useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1', name: 'Ann' } as never });
        render(<StompProvider><p>x</p></StompProvider>);
        act(() => {
            useAuthStore.setState({ isAuthenticated: false, user: null });
        });
        expect(session.stop).toHaveBeenCalled();
    });

    describe('user events', () => {
        const signIn = () => useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1', name: 'Ann' } as never });
        const subscribedTo = (destination: string) =>
            (session.subscribe.mock.calls as unknown as unknown[][]).filter(call => call[0] === destination);

        it('mount_signedIn_subscribesToUserEventsOnceAndDispatchesFrames', () => {
            const handleUserEvent = vi.fn().mockResolvedValue(undefined);
            useChatRoomsStore.setState({ handleUserEvent });
            signIn();
            render(<StompProvider><p>x</p></StompProvider>);
            expect(subscribedTo('/user/queue/events')).toHaveLength(1);

            const handler = subscribedTo('/user/queue/events')[0][1] as (m: { body: string }) => void;
            const envelope = { type: 'ROOM_ADDED', payload: {}, occurredAt: '2026-01-01T00:00:00Z' };
            handler({ body: JSON.stringify(envelope) });
            handler({ body: 'not json' });
            expect(handleUserEvent).toHaveBeenCalledTimes(1);
            expect(handleUserEvent).toHaveBeenCalledWith(envelope);
        });

        it('connected_firstConnectAndReconnect_refetchesRoomsAndOnlineUsersEachTime', async () => {
            const fetchRooms = vi.fn().mockResolvedValue(undefined);
            useChatRoomsStore.setState({ fetchRooms });
            vi.mocked(chatRoomApi.getOnlineUsers).mockResolvedValue(['u2', 'u3']);
            signIn();
            render(<StompProvider><p>x</p></StompProvider>);

            const listeners = session.onConnected.mock.calls.map(call => (call as unknown[])[0] as (i: { reconnected: boolean }) => void);
            expect(listeners.length).toBeGreaterThan(0);
            await act(async () => { listeners.forEach(l => l({ reconnected: false })); });
            await act(async () => { listeners.forEach(l => l({ reconnected: true })); });

            expect(fetchRooms).toHaveBeenCalledTimes(2);
            expect(chatRoomApi.getOnlineUsers).toHaveBeenCalledTimes(2);
            expect([...useChatStore.getState().onlineUsers].sort()).toEqual(['u2', 'u3']);
        });

        it('connected_firstConnectAndReconnect_refetchesInboxEachTime', async () => {
            const fetchInbox = vi.fn().mockResolvedValue(undefined);
            useChatRoomsStore.setState({ fetchRooms: vi.fn().mockResolvedValue(undefined) });
            useInboxStore.setState({ fetchInbox });
            vi.mocked(chatRoomApi.getOnlineUsers).mockResolvedValue([]);
            signIn();
            render(<StompProvider><p>x</p></StompProvider>);

            const listeners = session.onConnected.mock.calls.map(call => (call as unknown[])[0] as (i: { reconnected: boolean }) => void);
            await act(async () => { listeners.forEach(l => l({ reconnected: false })); });
            await act(async () => { listeners.forEach(l => l({ reconnected: true })); });

            expect(fetchInbox).toHaveBeenCalledTimes(2);
        });

        it('userEvent_dmRequestReceived_reachesTheInbox', () => {
            const handleUserEvent = vi.fn();
            useChatRoomsStore.setState({ handleUserEvent: vi.fn().mockResolvedValue(undefined) });
            useInboxStore.setState({ handleUserEvent });
            signIn();
            render(<StompProvider><p>x</p></StompProvider>);

            const handler = subscribedTo('/user/queue/events')[0][1] as (m: { body: string }) => void;
            const envelope = { type: 'DM_REQUEST_RECEIVED', payload: { request: { roomId: 'dm1' } }, occurredAt: '' };
            handler({ body: JSON.stringify(envelope) });
            expect(handleUserEvent).toHaveBeenCalledWith(envelope);
        });
    });
});
