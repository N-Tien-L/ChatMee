import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { AxiosError } from 'axios';
import { StompProvider } from './StompProvider';
import { useAuthStore } from '@/lib/stores/authStore';
import { authApi } from '@/lib/api/authApi';

// SPEC-008 AC-008-14 (CM-067): an expired session (ws-token answers 401) stops the socket and goes to /login.
// The real stompSession runs; only the STOMP client and the HTTP layer are faked.
interface FakeClientConfig { beforeConnect: () => Promise<void> }
const fake = vi.hoisted(() => ({
    configs: [] as unknown[],
    clients: [] as { active: boolean; activate: () => void; deactivate: () => Promise<void> }[],
}));
vi.mock('./stompClient', () => ({
    createStompClientFactory: () => (config: unknown) => {
        fake.configs.push(config);
        const client = {
            active: false,
            connectHeaders: {},
            activate: vi.fn(() => { client.active = true; }),
            deactivate: vi.fn(async () => { client.active = false; }),
            subscribe: vi.fn(),
            publish: vi.fn(),
        };
        fake.clients.push(client);
        return client;
    },
}));
vi.mock('@/lib/api/authApi', () => ({ authApi: { getWsToken: vi.fn() } }));
vi.mock('@/lib/api/chatRoomApi', () => ({
    chatRoomApi: { getOnlineUsers: vi.fn(), getChatRooms: vi.fn(), getChatRoomById: vi.fn(), markRoomRead: vi.fn() },
}));

const unauthorized = () => {
    const response = { status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config: {} };
    return new Error('Authentication required', {
        cause: new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response as never),
    });
};

afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
});
beforeEach(() => {
    vi.clearAllMocks();
    fake.configs.length = 0;
    fake.clients.length = 0;
    useAuthStore.setState({ user: null, isAuthenticated: false, loading: false });
});

describe('StompProvider expired session', () => {
    it('wsToken401_redirectsToLoginExpiredAndStopsTheSocket', async () => {
        vi.mocked(authApi.getWsToken).mockRejectedValue(unauthorized());
        useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1', name: 'Ann' } as never });
        render(<StompProvider><p>x</p></StompProvider>);
        expect(fake.clients).toHaveLength(1);
        expect(fake.clients[0].activate).toHaveBeenCalledTimes(1);

        const replace = vi.fn();
        vi.stubGlobal('window', { ...window, location: { replace } });
        await act(() => (fake.configs[0] as FakeClientConfig).beforeConnect());
        vi.unstubAllGlobals();

        expect(replace).toHaveBeenCalledWith('/login?reason=expired');
        expect(fake.clients[0].deactivate).toHaveBeenCalled();
        expect(authApi.getWsToken).toHaveBeenCalledTimes(1);
    });

    it('wsTokenNetworkError_doesNotRedirect', async () => {
        vi.mocked(authApi.getWsToken).mockRejectedValue(new Error('Network Error'));
        useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1', name: 'Ann' } as never });
        render(<StompProvider><p>x</p></StompProvider>);

        const replace = vi.fn();
        vi.stubGlobal('window', { ...window, location: { replace } });
        await act(() => (fake.configs[0] as FakeClientConfig).beforeConnect());
        vi.unstubAllGlobals();

        expect(replace).not.toHaveBeenCalled();
    });
});
