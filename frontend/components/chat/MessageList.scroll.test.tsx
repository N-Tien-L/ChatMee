import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MessageList from './MessageList';
import { Message } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';

const scrollIntoView = vi.fn();

beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
});
beforeEach(() => {
    scrollIntoView.mockClear();
});
afterEach(cleanup);

const text = (id: string, overrides: Partial<Message> = {}): Message => ({
    id, chatRoomId: 'r1', senderId: 'u2', senderName: 'Bob', type: MessageType.TEXT, content: `text ${id}`,
    createdAt: '2026-10-09T10:00:00Z', updatedAt: '', isUpdated: false, isDeleted: false,
    isOwn: false, isOptimistic: false, status: 'sent', ...overrides,
});

const baseMessages = [text('m1'), text('m2')];
const props = {
    onlineUsers: new Set<string>(['u2']),
    formatDate: () => 'Today',
    formatTime: () => '10:00',
    messagesEndRef: createRef<HTMLDivElement>(),
};

/** Makes the scroll container look taller than its viewport, scrolled to the given offset. */
function scrollContainerAt(scrollTop: number) {
    const el = screen.getByTestId('message-scroll');
    let top = scrollTop;
    Object.defineProperties(el, {
        scrollHeight: { value: 1000, configurable: true },
        clientHeight: { value: 300, configurable: true },
        scrollTop: { configurable: true, get: () => top, set: (value: number) => { top = value; } },
    });
    fireEvent.scroll(el);
    return el;
}

describe('MessageList smart auto-scroll', () => {
    it('incomingMessage_readerAtBottom_scrollsToBottom', () => {
        const { rerender } = render(<MessageList {...props} messages={baseMessages} />);
        scrollIntoView.mockClear();
        rerender(<MessageList {...props} messages={[...baseMessages, text('m3')]} />);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: /new messages/i })).not.toBeInTheDocument();
    });

    it('incomingMessage_readerScrolledUp_doesNotScrollAndShowsNewMessagesButton', () => {
        const { rerender } = render(<MessageList {...props} messages={baseMessages} />);
        scrollContainerAt(0);
        scrollIntoView.mockClear();
        rerender(<MessageList {...props} messages={[...baseMessages, text('m3')]} />);
        expect(scrollIntoView).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /new messages/i })).toBeInTheDocument();
    });

    it('newMessagesButton_clicked_scrollsToBottomAndHidesButton', () => {
        const { rerender } = render(<MessageList {...props} messages={baseMessages} />);
        scrollContainerAt(0);
        rerender(<MessageList {...props} messages={[...baseMessages, text('m3')]} />);
        scrollIntoView.mockClear();
        fireEvent.click(screen.getByRole('button', { name: /new messages/i }));
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: /new messages/i })).not.toBeInTheDocument();
    });

    it('ownMessage_readerScrolledUp_alwaysScrollsToBottom', () => {
        const { rerender } = render(<MessageList {...props} messages={baseMessages} />);
        scrollContainerAt(0);
        scrollIntoView.mockClear();
        const own = text('o1', { isOwn: true, senderId: 'u1', senderName: 'Alice', status: 'sending', tempId: 't1' });
        rerender(<MessageList {...props} messages={[...baseMessages, own]} />);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: /new messages/i })).not.toBeInTheDocument();
    });

    it('readerScrollsBackToBottom_afterScrollingUp_followsNewMessagesAgain', () => {
        const { rerender } = render(<MessageList {...props} messages={baseMessages} />);
        scrollContainerAt(0);
        scrollContainerAt(700);
        scrollIntoView.mockClear();
        rerender(<MessageList {...props} messages={[...baseMessages, text('m3')]} />);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });
});
