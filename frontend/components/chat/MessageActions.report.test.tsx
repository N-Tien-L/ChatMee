import { useRef, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageActions } from './MessageActions';
import { ReportDialog, type ReportTarget } from '@/components/safety/ReportDialog';
import { Message, MessageType } from '@/lib/types';
import { reportApi } from '@/lib/api/reportApi';

vi.mock('@/lib/api/reportApi', () => ({ reportApi: { create: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
let removeFocusGuard = () => {};
afterEach(() => { cleanup(); removeFocusGuard(); });

const message = { id: 'received', content: 'Synthetic message', isOwn: false,
    senderId: 'other', chatRoomId: 'room', createdAt: '2026-10-01T00:00:00Z', type: MessageType.TEXT } as Message;
function Harness() {
    const origin = useRef<HTMLElement | null>(null);
    const [target, setTarget] = useState<ReportTarget | null>(null);
    return <>
        <MessageActions message={message} timeLabel="12:00" onReport={() => { origin.current = document.activeElement as HTMLElement; setTarget({ type: 'MESSAGE', id: message.id }); }}>
            Synthetic message
        </MessageActions>
        <button>Next action</button>
        <ReportDialog target={target} onClose={() => setTarget(null)} onRestoreFocus={() => origin.current?.focus()} />
    </>;
}
it.each(['submit', 'cancel'] as const)('report_%sFromMessageMenu_restoresPointerInteraction', async mode => {
    vi.mocked(reportApi.create).mockResolvedValue(undefined);
    // Bound a broken pair of focus traps so the regression fails instead of overflowing.
    let focusTransitions = 0;
    const guard = (event: Event) => { if (++focusTransitions > 30) event.stopImmediatePropagation(); };
    document.addEventListener('focusin', guard, true);
    document.addEventListener('focusout', guard, true);
    removeFocusGuard = () => {
        document.removeEventListener('focusin', guard, true);
        document.removeEventListener('focusout', guard, true);
    };
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'More actions' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: 'Report message' }));
    await screen.findByRole('dialog');
    expect(focusTransitions).toBeLessThanOrEqual(30);
    if (mode === 'submit') {
        await user.click(screen.getByLabelText('Spam'));
        await user.click(screen.getByRole('button', { name: 'Send report' }));
    } else await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Next action' }));
    expect(document.body.style.pointerEvents).not.toBe('none');
});
