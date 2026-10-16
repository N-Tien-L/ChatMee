import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import toast from 'react-hot-toast';
import { LoginForm } from './LoginForm';
import { oauthLoginUrl } from '@/lib/api/authApi';

let query = '';
vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(query),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
const login = vi.fn();
vi.mock('@/lib/api/authApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/api/authApi')>();
    return { ...actual, authApi: { ...actual.authApi, login: (provider: string) => login(provider) } };
});

afterEach(cleanup);
beforeEach(() => {
    query = '';
    login.mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
});

describe('LoginForm', () => {
    it('click_google_startsGoogleLogin', () => {
        render(<LoginForm />);
        fireEvent.click(screen.getByRole('button', { name: /google/i }));
        expect(login).toHaveBeenCalledWith('google');
    });

    it('click_github_startsGithubLogin', () => {
        render(<LoginForm />);
        fireEvent.click(screen.getByRole('button', { name: /github/i }));
        expect(login).toHaveBeenCalledWith('github');
    });

    it('oauthLoginUrl_google_asksForAccountSelection', () => {
        expect(oauthLoginUrl('google')).toBe('/oauth2/authorization/google?prompt=select_account');
    });

    it('oauthLoginUrl_github_omitsPrompt', () => {
        expect(oauthLoginUrl('github')).toBe('/oauth2/authorization/github');
    });

    it('render_errorQuery_showsErrorToast', () => {
        query = 'error=true';
        render(<LoginForm />);
        expect(toast.error).toHaveBeenCalledWith('Login failed. Please try again.', { id: 'login-error' });
    });

    it('render_signedOutQuery_showsSuccessToast', () => {
        query = 'signedOut=true';
        render(<LoginForm />);
        expect(toast.success).toHaveBeenCalledWith('Signed out successfully', { id: 'signed-out' });
    });

    it('render_noQuery_showsNoToast', () => {
        render(<LoginForm />);
        expect(toast.error).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
    });
});
