import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import MessageList from './MessageList';
import { Message } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';

beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const props = {
    onlineUsers: new Set<string>(),
    formatDate: () => 'Today',
    formatTime: (d: Date) => d.toISOString().slice(11, 16),
    messagesEndRef: createRef<HTMLDivElement>(),
};

const message = (id: string, createdAt: string, overrides: Partial<Message> = {}): Message => ({
    id, chatRoomId: 'r1', senderId: 'u2', senderName: 'Bob', type: MessageType.TEXT, content: `text ${id}`,
    createdAt, updatedAt: createdAt, isUpdated: false, isDeleted: false,
    isOwn: false, isOptimistic: false, status: 'sent', ...overrides,
});
const own = (id: string, createdAt: string) =>
    message(id, createdAt, { isOwn: true, senderId: 'me', senderName: 'Me' });

const markers = (container: HTMLElement) => Array.from(container.querySelectorAll('span.uppercase')).map((el) => el.textContent);

describe('MessageList time markers', () => {
    it('render_gapOfSeveralHoursInOneDay_showsTimeMarkerBeforeTheLaterMessage', () => {
        const { container } = render(
            <MessageList {...props} messages={[message('m1', '2026-10-09T10:00:00Z'), message('m2', '2026-10-09T13:30:00Z')]} />
        );
        expect(markers(container)).toEqual(['Today', '13:30']);
    });

    it('render_gapUnderAnHour_showsNoTimeMarker', () => {
        const { container } = render(
            <MessageList {...props} messages={[message('m1', '2026-10-09T10:00:00Z'), message('m2', '2026-10-09T10:40:00Z')]} />
        );
        expect(markers(container)).toEqual(['Today']);
    });
});

describe('MessageList own sent mark', () => {
    it('render_severalSentOwnMessages_keepsSentMarkOnlyOnTheLatest', () => {
        render(<MessageList {...props} messages={[own('o1', '2026-10-09T10:00:00Z'), own('o2', '2026-10-09T10:01:00Z')]} />);
        expect(screen.getAllByRole('img', { name: 'Sent' })).toHaveLength(1);
    });

    it('render_earlierOwnMessage_showsPlainTimeOnHoverLikeTheOtherSide', () => {
        const { container } = render(
            <MessageList {...props} messages={[own('o1', '2026-10-09T10:00:00Z'), own('o2', '2026-10-09T10:01:00Z')]} />
        );
        const hoverTime = Array.from(container.querySelectorAll('time')).find((el) => el.classList.contains('group-hover:opacity-100'));
        expect(hoverTime).toBeDefined();
        expect(hoverTime).toHaveTextContent('10:00');
        expect(hoverTime).toHaveClass('opacity-0');
    });
});
