import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    formatTime: () => '10:00',
    messagesEndRef: createRef<HTMLDivElement>(),
};

const message = (id: string, overrides: Partial<Message> = {}): Message => ({
    id, chatRoomId: 'r1', senderId: 'u2', senderName: 'Bob', type: MessageType.TEXT, content: `text ${id}`,
    createdAt: '2026-10-09T10:00:00Z', updatedAt: '2026-10-09T10:00:00Z', isUpdated: false, isDeleted: false,
    isOwn: false, isOptimistic: false, status: 'sent', ...overrides,
});

describe('MessageList report', () => {
    it('report_otherMembersMessage_callsOnReportWithThatMessage', () => {
        const onReport = vi.fn();
        const target = message('m1');
        render(<MessageList {...props} messages={[target]} onReport={onReport} />);

        fireEvent.click(screen.getByRole('button', { name: 'Report message from Bob' }));

        expect(onReport).toHaveBeenCalledWith(target);
    });

    it('render_ownAndSystemMessages_haveNoReportAction', () => {
        render(
            <MessageList
                {...props}
                messages={[
                    message('m1', { isOwn: true, senderId: 'me', senderName: 'Me' }),
                    message('m2', { type: MessageType.SYSTEM, content: 'Bob joined' }),
                ]}
                onReport={vi.fn()}
            />
        );
        expect(screen.queryByRole('button', { name: /^Report message/ })).toBeNull();
    });
});
