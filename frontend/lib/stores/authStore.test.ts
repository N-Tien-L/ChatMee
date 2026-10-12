import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { useAuthStore } from './authStore';
import { useChatRoomsStore } from './chatRoomsStore';
import { useChatStore } from './chatStore';
import { authApi } from '../api/authApi';
import { resetRoomMessageCache } from '@/hooks/useRoomMessage';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../api/authApi', () => ({
    authApi: {
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
        login: vi.fn(),
        redirectToLogin: vi.fn(),
    },
}));
vi.mock('@/hooks/useRoomMessage', () => ({ resetRoomMessageCache: vi.fn() }));

const user = { id: 'u1', name: 'Ann' } as never;

beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user, isAuthenticated: true, loading: false });
    useChatStore.setState({ onlineUsers: new Set(['u2']) });
});
afterEach(() => localStorage.clear());

describe('authStore.logout', () => {
    it('logout_serverRejects403_keepsStateAndShowsError', async () => {
        vi.mocked(authApi.logout).mockRejectedValue(new Error('Forbidden'));
        const result = await useAuthStore.getState().logout();
        expect(result).toBe(false);
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
        expect(useAuthStore.getState().user).toBe(user);
        expect(resetRoomMessageCache).not.toHaveBeenCalled();
        expect(useChatStore.getState().onlineUsers.size).toBe(1);
        expect(toast.error).toHaveBeenCalled();
        expect(authApi.redirectToLogin).not.toHaveBeenCalled();
    });

    it('logout_serverConfirms_clearsStateAndCachesThenLandsOnLogin', async () => {
        vi.mocked(authApi.logout).mockResolvedValue(undefined);
        useChatRoomsStore.setState({ rooms: [{ id: 'r1' } as never] });
        const result = await useAuthStore.getState().logout();
        expect(result).toBe(true);
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
        expect(useAuthStore.getState().user).toBeNull();
        expect(resetRoomMessageCache).toHaveBeenCalledTimes(1);
        expect(useChatRoomsStore.getState().rooms).toEqual([]);
        expect(useChatStore.getState().onlineUsers.size).toBe(0);
        expect(authApi.redirectToLogin).toHaveBeenCalledTimes(1);
    });
});

describe('authStore persistence', () => {
    it('persist_state_neverStoresAuthenticatedFlag', () => {
        useAuthStore.setState({ isAuthenticated: true });
        const stored = JSON.parse(localStorage.getItem('auth-storage') ?? '{}');
        expect(stored.state?.isAuthenticated).toBeUndefined();
    });

    it('rehydrate_legacyStoredFlag_isIgnored', async () => {
        localStorage.setItem('auth-storage', JSON.stringify({ state: { isAuthenticated: true, user }, version: 0 }));
        useAuthStore.setState({ isAuthenticated: false, user: null });
        await useAuthStore.persist.rehydrate();
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
});
