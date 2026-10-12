import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { StompProvider } from './StompProvider';
import { useAuthStore } from '@/lib/stores/authStore';

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
});
