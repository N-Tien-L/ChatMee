import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import MessageList from './MessageList';
import { Message, MessageType } from '@/lib/types';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const msg = (id: string, extra: Partial<Message> = {}): Message => ({
    id, chatRoomId: 'r1', senderId: 'bob', senderName: 'Bob', type: MessageType.TEXT, content: `text ${id}`,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', isUpdated: false, isDeleted: false,
    status: 'sent', ...extra,
});
const quote = (preview: string | null, type = MessageType.TEXT) =>
    ({ messageId: 'm1', senderId: 'alice', senderName: 'Alice', preview, type });

function List(props: Partial<React.ComponentProps<typeof MessageList>> & { messages: Message[] }) {
    const end = React.useRef<HTMLDivElement>(null);
    return <MessageList onlineUsers={new Set()} formatDate={() => 'Today'} formatTime={() => '12:00'}
        messagesEndRef={end} {...props} />;
}

// jsdom has no layout: the list scrolls with scrollIntoView.
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => cleanup());

describe('MessageList reply quotes (SPEC-014)', () => {
    it('quote_tap_jumpsToOriginal', () => {
        const onJump = vi.fn();
        render(<List messages={[msg('m1'), msg('m2', { replyTo: quote('the original') })]} onJumpToOriginal={onJump} />);
        const button = screen.getByRole('button', { name: 'Jump to the message from Alice this replies to' });
        expect(button).toHaveTextContent('the original');
        fireEvent.click(button);
        expect(onJump).toHaveBeenCalledWith('m1');
        // The bubble's own menu does not open from the quote.
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('quote_deletedOriginal_showsUnavailableWithoutJump', () => {
        render(<List messages={[msg('m2', { replyTo: quote(null) })]} onJumpToOriginal={vi.fn()} />);
        expect(screen.getByText('Original message unavailable')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Jump to the message/ })).toBeNull();
    });

    it('quote_nonTextOriginal_showsTypeLabel', () => {
        render(<List messages={[msg('m2', { replyTo: quote('', MessageType.SYSTEM) })]} onJumpToOriginal={vi.fn()} />);
        expect(screen.getByTestId('reply-quote')).toHaveTextContent('System message');
    });

    it('quote_pendingOwnReply_isNotALinkYet', () => {
        render(<List messages={[msg('optimistic-t', { isOwn: true, isOptimistic: true, status: 'sending',
            senderId: 'me', replyTo: quote('the original') })]} onJumpToOriginal={vi.fn()} />);
        expect(screen.getByTestId('reply-quote')).toHaveTextContent('the original');
        expect(screen.queryByRole('button', { name: /Jump to the message/ })).toBeNull();
    });

    it('focusRequest_loadedOriginal_scrollsAndHighlights', () => {
        const scrolled = vi.fn();
        Element.prototype.scrollIntoView = scrolled;
        const messages = [msg('m1'), msg('m2')];
        const view = render(<List messages={messages} />);
        view.rerender(<List messages={messages} focusRequest={{ id: 'm1', nonce: 1 }} />);
        const row = document.querySelector('[data-message-id="m1"]') as HTMLElement;
        expect(row.dataset.highlighted).toBe('true');
        expect(scrolled).toHaveBeenCalledWith({ block: 'center' });
    });
});
