import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import MessageList from './MessageList';
import { Message, MessageType } from '@/lib/types';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const msg = (id: string, extra: Partial<Message> = {}): Message => ({
    id, chatRoomId: 'r1', senderId: 'bob', senderName: 'Bob', type: MessageType.TEXT, content: `text ${id}`,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', isUpdated: false, isDeleted: false,
    status: 'sent', ...extra,
});

function List(props: Partial<React.ComponentProps<typeof MessageList>> & { messages: Message[] }) {
    const end = React.useRef<HTMLDivElement>(null);
    return <MessageList onlineUsers={new Set()} formatDate={() => 'Today'} formatTime={() => '12:00'}
        messagesEndRef={end} {...props} />;
}

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => cleanup());

describe('MessageList reactions (SPEC-015 AC-015-10)', () => {
    it('reactions_chips_showCountsAndOpenWhoReacted', () => {
        const onShow = vi.fn();
        const message = msg('m1', { reactions: [{ emoji: '👍', count: 2, reactedByMe: true }, { emoji: '😂', count: 1, reactedByMe: false }] });
        render(<List messages={[message]} onShowReactors={onShow} />);

        const mine = screen.getByRole('button', { name: '👍 2, including you. Show who reacted' });
        expect(screen.getByRole('button', { name: '😂 1. Show who reacted' })).toBeInTheDocument();
        fireEvent.click(mine);
        expect(onShow).toHaveBeenCalledWith(message, '👍');
    });

    it('reactions_quickBar_reactsAndMarksCurrentPick', async () => {
        const onReact = vi.fn();
        const message = msg('m1', { reactions: [{ emoji: '❤️', count: 1, reactedByMe: true }] });
        render(<List messages={[message]} onReact={onReact} onPickReaction={vi.fn()} />);

        await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
        // The current pick offers to undo itself (AC-015-1); the client sends DELETE for it.
        expect(screen.getByRole('menuitem', { name: 'Remove reaction ❤️' })).toBeInTheDocument();
        await userEvent.click(screen.getByRole('menuitem', { name: 'React with 😂' }));
        expect(onReact).toHaveBeenCalledWith(message, '😂');
    });

    it('reactions_plus_opensPickerAfterMenuCloses', async () => {
        const onPick = vi.fn();
        const message = msg('m1');
        render(<List messages={[message]} onReact={vi.fn()} onPickReaction={onPick} />);

        await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
        await userEvent.click(screen.getByRole('menuitem', { name: 'More reactions' }));
        await waitFor(() => expect(onPick).toHaveBeenCalledWith(message));
    });

    it('reactions_withoutHandler_hidesQuickBar', async () => {
        render(<List messages={[msg('m1')]} />);
        await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
        expect(screen.queryByRole('menuitem', { name: /React with/ })).toBeNull();
        expect(screen.queryByRole('list', { name: 'Reactions' })).toBeNull();
    });
});
