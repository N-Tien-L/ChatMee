import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import Login from './page';
import { useAuthStore } from '@/lib/stores/authStore';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace, push }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

afterEach(cleanup);
beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    useAuthStore.setState({ user: null, isAuthenticated: false, loading: false });
});

describe('Login page', () => {
    it('render_validSession_replacesWithDashboardWithoutHistoryEntry', async () => {
        const checkAuthStatus = vi.fn(async () => {
            useAuthStore.setState({ isAuthenticated: true });
        });
        useAuthStore.setState({ checkAuthStatus });
        render(<Login />);
        await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
        expect(push).not.toHaveBeenCalled();
        expect(screen.queryByText(/sign in to chatmee/i)).not.toBeInTheDocument();
    });

    it('render_staleCookie_showsFormAndChecksOnce', async () => {
        const checkAuthStatus = vi.fn(async () => {
            useAuthStore.setState({ isAuthenticated: false, user: null });
        });
        useAuthStore.setState({ checkAuthStatus });
        render(<Login />);
        expect(await screen.findByText(/sign in to chatmee/i)).toBeInTheDocument();
        expect(replace).not.toHaveBeenCalled();
        expect(checkAuthStatus).toHaveBeenCalledTimes(1);
    });

    it('render_checkPending_showsNeitherFormNorText', () => {
        const checkAuthStatus = vi.fn(() => new Promise<void>(() => {}));
        useAuthStore.setState({ checkAuthStatus });
        const { container } = render(<Login />);
        expect(screen.queryByText(/sign in to chatmee/i)).not.toBeInTheDocument();
        expect(container.textContent).toBe('');
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('render_storedAuthenticatedFlag_doesNotRedirectBeforeServerAnswers', () => {
        // A stale client flag must not redirect: only the /auth/me answer decides.
        useAuthStore.setState({
            isAuthenticated: true,
            checkAuthStatus: vi.fn(() => new Promise<void>(() => {})),
        });
        render(<Login />);
        expect(replace).not.toHaveBeenCalled();
    });
});
