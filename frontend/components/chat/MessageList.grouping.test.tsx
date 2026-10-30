import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React, { createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import MessageList from './MessageList';
import { Message } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';

beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const props = {
    onlineUsers: new Set<string>(['u2']),
    formatDate: () => 'Today',
    formatTime: () => '10:00',
    messagesEndRef: createRef<HTMLDivElement>(),
};

const text = (id: string, createdAt: string, overrides: Partial<Message> = {}): Message => ({
    id, chatRoomId: 'r1', senderId: 'u2', senderName: 'Bob', type: MessageType.TEXT, content: `text ${id}`,
    createdAt, updatedAt: createdAt, isUpdated: false, isDeleted: false, isOwn: false, isOptimistic: false,
    status: 'sent', ...overrides,
});

describe('MessageList grouping and system rows', () => {
    it('render_sameSenderWithinFiveMinutes_showsNameAndAvatarOnce', () => {
        const messages = [
            text('m1', '2026-10-09T10:00:00Z'),
            text('m2', '2026-10-09T10:02:00Z'),
        ];
        render(<MessageList {...props} messages={messages} />);
        expect(screen.getAllByText('Bob')).toHaveLength(1);
        expect(screen.getAllByRole('img', { name: 'Bob' })).toHaveLength(1);
    });

    it('render_sameSenderAfterFiveMinutes_startsNewGroupWithNameAndAvatar', () => {
        const messages = [
            text('m1', '2026-10-09T10:00:00Z'),
            text('m2', '2026-10-09T10:06:00Z'),
        ];
        render(<MessageList {...props} messages={messages} />);
        expect(screen.getAllByText('Bob')).toHaveLength(2);
        expect(screen.getAllByRole('img', { name: 'Bob' })).toHaveLength(2);
    });

    it('render_differentSenderInBetween_breaksTheGroup', () => {
        const messages = [
            text('m1', '2026-10-09T10:00:00Z'),
            text('m2', '2026-10-09T10:01:00Z', { senderId: 'u3', senderName: 'Carol' }),
            text('m3', '2026-10-09T10:02:00Z'),
        ];
        render(<MessageList {...props} messages={messages} />);
        expect(screen.getAllByText('Bob')).toHaveLength(2);
    });

    it('render_systemMessage_rendersCenteredSystemRowWithoutSenderName', () => {
        const messages = [
            text('s1', '2026-10-09T10:00:00Z', {
                type: MessageType.SYSTEM, senderId: 'u1', senderName: undefined, content: 'Carol joined the room',
            }),
        ];
        render(<MessageList {...props} messages={messages} />);
        const row = screen.getByText('Carol joined the room').closest('[data-message-type]');
        expect(row).toHaveAttribute('data-message-type', 'SYSTEM');
        expect(row).toHaveClass('justify-center');
    });

    it('render_ownMessagesWithEachStatus_showsLucideStatusIcons', () => {
        const messages = [
            text('o1', '2026-10-09T10:00:00Z', { isOwn: true, senderId: 'u1', senderName: 'Alice', status: 'sending', tempId: 't1' }),
            text('o2', '2026-10-09T10:00:10Z', { isOwn: true, senderId: 'u1', senderName: 'Alice', status: 'failed', tempId: 't3' }),
            text('o3', '2026-10-09T10:00:20Z', { isOwn: true, senderId: 'u1', senderName: 'Alice', status: 'sent' }),
        ];
        render(<MessageList {...props} messages={messages} />);
        expect(screen.getByRole('img', { name: 'Sending' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Sent' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Failed to send' })).toBeInTheDocument();
        expect(screen.queryByText('⏳')).not.toBeInTheDocument();
        expect(screen.queryByText('✓')).not.toBeInTheDocument();
    });

    it('render_presenceNotLoaded_showsNeutralDotNotOffline', () => {
        const messages = [text('m1', '2026-10-09T10:00:00Z', { senderId: 'u9', senderName: 'Dan' })];
        render(<MessageList {...props} presenceKnown={false} messages={messages} />);
        expect(screen.getByRole('img', { name: 'Status unknown' })).toBeInTheDocument();
        expect(screen.queryByRole('img', { name: 'Offline' })).not.toBeInTheDocument();
    });
});

describe('MessageList deleted sender', () => {
    it('render_deletedUserSender_showsNeutralAvatarAndNoAction', () => {
        const messages = [text('m1', '2026-10-09T10:00:00Z', { senderId: 'gone', senderName: 'Deleted user' })];
        render(<MessageList {...props} messages={messages} />);
        const avatar = screen.getByRole('img', { name: 'Deleted user' });
        expect(screen.getByText('Deleted user')).toBeInTheDocument();
        expect(avatar.querySelector('.bg-muted')).not.toBeNull();
        expect(screen.queryByText('DU')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /message|profile/i })).not.toBeInTheDocument();
    });
});
