import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UserMenu } from './UserMenu';

afterEach(cleanup);

const user = { name: 'Ada Lovelace', avatarUrl: undefined };

describe('UserMenu', () => {
    it('render_initially_menuIsClosed', () => {
        render(<UserMenu user={user} onSignOut={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Account menu' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('click_trigger_showsProfileLinkToProfilePage', () => {
        render(<UserMenu user={user} onSignOut={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
        expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute('href', '/profile');
    });

    it('click_signOut_callsOnSignOutAndCloses', () => {
        const onSignOut = vi.fn();
        render(<UserMenu user={user} onSignOut={onSignOut} />);
        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
        expect(onSignOut).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('keyDown_escape_closesMenuAndReturnsFocusToTrigger', () => {
        render(<UserMenu user={user} onSignOut={vi.fn()} />);
        const trigger = screen.getByRole('button', { name: 'Account menu' });
        fireEvent.click(trigger);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it('mouseDown_outside_closesMenu', () => {
        render(<UserMenu user={user} onSignOut={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
});
