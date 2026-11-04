import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageActions, SWIPE_REPLY_PX } from './MessageActions';
import { Message, MessageType } from '@/lib/types';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const message: Message = {
    id: 'm1', chatRoomId: 'r1', senderId: 'bob', senderName: 'Bob', type: MessageType.TEXT, content: 'hello',
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', isUpdated: false, isDeleted: false,
};

function renderBubble(onReply = vi.fn()) {
    render(<MessageActions message={message} timeLabel="12:00" onReply={onReply}><p>hello</p></MessageActions>);
    return { onReply, bubble: screen.getByRole('button', { name: 'More actions' }) };
}

const touch = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', el: Element, x: number, y: number) =>
    fireEvent[type](el, { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, button: 0 });

afterEach(() => cleanup());

describe('MessageActions reply (SPEC-014 AC-014-10)', () => {
    it('reply_swipeRight_startsReply', () => {
        const { onReply, bubble } = renderBubble();
        touch('pointerDown', bubble, 100, 100);
        touch('pointerMove', bubble, 120, 102);
        touch('pointerMove', bubble, 100 + SWIPE_REPLY_PX + 4, 103);
        expect(bubble.style.transform).toMatch(/translateX\(\d+px\)/);
        touch('pointerUp', bubble, 100 + SWIPE_REPLY_PX + 4, 103);

        expect(onReply).toHaveBeenCalledWith(message);
        expect(bubble.style.transform).toBe('');
        // A swipe is not a tap: the menu stays closed.
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('reply_shortSwipe_doesNotTrigger', () => {
        const { onReply, bubble } = renderBubble();
        touch('pointerDown', bubble, 100, 100);
        touch('pointerMove', bubble, 130, 100);
        touch('pointerUp', bubble, 130, 100);
        expect(onReply).not.toHaveBeenCalled();
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('reply_verticalScroll_doesNotTrigger', () => {
        const { onReply, bubble } = renderBubble();
        touch('pointerDown', bubble, 100, 100);
        touch('pointerMove', bubble, 104, 130);
        // Even a later sideways drift stays a scroll once the vertical axis won.
        touch('pointerMove', bubble, 100 + SWIPE_REPLY_PX + 20, 140);
        touch('pointerUp', bubble, 100 + SWIPE_REPLY_PX + 20, 140);
        expect(onReply).not.toHaveBeenCalled();
        expect(bubble.style.transform).toBe('');
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('reply_touchCancelled_resetsWithoutAction', () => {
        const { onReply, bubble } = renderBubble();
        touch('pointerDown', bubble, 100, 100);
        touch('pointerMove', bubble, 140, 100);
        fireEvent.pointerCancel(bubble, { pointerType: 'touch', pointerId: 7 });
        expect(bubble.style.transform).toBe('');
        expect(onReply).not.toHaveBeenCalled();
    });

    it('reply_tap_opensMenuOnRelease', () => {
        const { bubble } = renderBubble();
        touch('pointerDown', bubble, 100, 100);
        expect(screen.queryByRole('menu')).toBeNull();
        touch('pointerUp', bubble, 102, 101);
        expect(screen.getByRole('menuitem', { name: 'Reply' })).toBeInTheDocument();
    });

    it('reply_menuItem_startsReplyForKeyboardUsers', async () => {
        const user = userEvent.setup();
        const { onReply, bubble } = renderBubble();
        bubble.focus();
        await user.keyboard('{Enter}');
        await user.click(screen.getByRole('menuitem', { name: 'Reply' }));
        expect(onReply).toHaveBeenCalledWith(message);
    });

    it('reply_withoutHandler_offersNoReply', async () => {
        const user = userEvent.setup();
        render(<MessageActions message={message} timeLabel="12:00"><p>hello</p></MessageActions>);
        const bubble = screen.getByRole('button', { name: 'More actions' });
        bubble.focus();
        await user.keyboard('{Enter}');
        expect(screen.queryByRole('menuitem', { name: 'Reply' })).toBeNull();
    });
});
