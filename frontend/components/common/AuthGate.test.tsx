import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AuthGate } from './AuthGate';
import { useAuthStore } from '@/lib/stores/authStore';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace }),
}));

afterEach(cleanup);
beforeEach(() => replace.mockClear());

function setAuth(isAuthenticated: boolean) {
    const checkAuthStatus = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ isAuthenticated, loading: false, checkAuthStatus });
}

describe('AuthGate', () => {
    it('render_authenticated_showsChildren', async () => {
        setAuth(true);
        render(<AuthGate><p>secret</p></AuthGate>);
        expect(await screen.findByText('secret')).toBeInTheDocument();
        expect(replace).not.toHaveBeenCalled();
    });

    it('render_unauthenticated_redirectsToLoginWithoutAccessDenied', async () => {
        setAuth(false);
        render(<AuthGate><p>secret</p></AuthGate>);
        await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
        expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
        expect(screen.queryByText('secret')).not.toBeInTheDocument();
    });

    it('render_beforeCheckCompletes_showsStatusSkeletonNotChildren', () => {
        const checkAuthStatus = vi.fn(() => new Promise<void>(() => {}));
        useAuthStore.setState({ isAuthenticated: true, loading: true, checkAuthStatus });
        render(<AuthGate><p>secret</p></AuthGate>);
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.queryByText('secret')).not.toBeInTheDocument();
    });
});
