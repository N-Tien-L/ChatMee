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

    it.each(['Enter', ' ', 'ArrowDown'])('keyDown%s_onTrigger_opensMenuAndFocusesFirstItem', key => {
        render(<UserMenu user={user} onSignOut={vi.fn()} />);
        const trigger = screen.getByRole('button', { name: 'Account menu' });
        trigger.focus();
        fireEvent.keyDown(trigger, { key });
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveFocus();
    });

    it('keyDownArrowUp_onTrigger_opensMenuAndFocusesLastItem', () => {
        render(<UserMenu user={user} onSignOut={vi.fn()} />);
        const trigger = screen.getByRole('button', { name: 'Account menu' });
        fireEvent.keyDown(trigger, { key: 'ArrowUp' });
        expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
    });

    it('keyDownEnter_onTrigger_preventsNativeClickToggle', () => {
        render(<UserMenu user={user} onSignOut={vi.fn()} />);
        const trigger = screen.getByRole('button', { name: 'Account menu' });
        const notCancelled = fireEvent.keyDown(trigger, { key: 'Enter' });
        expect(notCancelled).toBe(false);
    });

    it('keyDownArrows_inMenu_moveFocusAndWrap', () => {
        render(<UserMenu user={user} onSignOut={vi.fn()} />);
        fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'ArrowDown' });
        const order = ['Profile', 'System', 'Light', 'Dark', 'Sign out'];
        const item = (name: string) =>
            screen.getAllByRole(name === 'Profile' || name === 'Sign out' ? 'menuitem' : 'menuitemradio', { name })[0];
        for (let i = 1; i < order.length; i++) {
            fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
            expect(item(order[i])).toHaveFocus();
        }
        fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
        expect(item('Profile')).toHaveFocus();
        fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });
        expect(item('Sign out')).toHaveFocus();
        fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });
        expect(item('Dark')).toHaveFocus();
    });

    it('keyDownHomeEnd_inMenu_focusesFirstAndLastItem', () => {
        render(<UserMenu user={user} onSignOut={vi.fn()} />);
        fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'ArrowDown' });
        fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
        expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
        fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
        expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveFocus();
    });

    it('keyDownEscape_fromMenuItem_closesAndReturnsFocusToTrigger', () => {
        render(<UserMenu user={user} onSignOut={vi.fn()} />);
        const trigger = screen.getByRole('button', { name: 'Account menu' });
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
        fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it('click_trigger_keepsMenuPanelInsideHeaderStackingContext', () => {
        const { container } = render(<UserMenu user={user} onSignOut={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
        const menu = screen.getByRole('menu');
        // Not portalled: the panel stays in the header's z-20 context, positioned under the trigger (CM-084 mobile fix).
        expect(container.contains(menu)).toBe(true);
        expect(menu).toHaveClass('absolute', 'z-50');
    });

    it('mouseDown_outside_closesMenu', () => {
        render(<UserMenu user={user} onSignOut={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
});
