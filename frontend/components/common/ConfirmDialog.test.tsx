import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
    const props = {
        open: true,
        onOpenChange: vi.fn(),
        title: 'Leave room?',
        description: 'You will stop receiving messages.',
        confirmLabel: 'Leave',
        onConfirm: vi.fn(),
        ...overrides,
    };
    render(<ConfirmDialog {...props} />);
    return props;
}

describe('ConfirmDialog', () => {
    it('render_open_focusesCancelButton', () => {
        renderDialog();
        expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });

    it('render_open_exposesTitleAndDescriptionToDialog', () => {
        renderDialog();
        const dialog = screen.getByRole('dialog', { name: 'Leave room?' });
        expect(dialog).toHaveAccessibleDescription('You will stop receiving messages.');
    });

    it('click_confirm_callsOnConfirmAndCloses', () => {
        const props = renderDialog();
        fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
        expect(props.onConfirm).toHaveBeenCalledTimes(1);
        expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('click_cancel_closesWithoutConfirming', () => {
        const props = renderDialog();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(props.onConfirm).not.toHaveBeenCalled();
        expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('render_closed_rendersNothing', () => {
        renderDialog({ open: false });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
