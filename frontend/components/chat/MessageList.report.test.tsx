import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    it('report_otherMembersMessage_callsOnReportWithThatMessage', async () => {
        const onReport = vi.fn();
        const target = message('m1');
        render(<MessageList {...props} messages={[target]} onReport={onReport} />);

        await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Report message' }));

        expect(onReport).toHaveBeenCalledWith(target);
    });

    it('render_otherMembersMessage_showsNoPermanentReportButton', () => {
        render(<MessageList {...props} messages={[message('m1')]} onReport={vi.fn()} />);
        expect(screen.queryByRole('button', { name: /^Report message/ })).toBeNull();
    });

    it('contextMenu_longPressOnBubble_opensActionsWithTime', async () => {
        render(<MessageList {...props} messages={[message('m1')]} onReport={vi.fn()} />);

        fireEvent.contextMenu(screen.getByRole('button', { name: 'More actions' }));

        expect(await screen.findByRole('menuitem', { name: 'Copy text' })).toBeInTheDocument();
        expect(screen.getByText('10:00', { selector: '[role="menu"] *' })).toBeInTheDocument();
    });

    it('menu_ownSentMessage_offersCopyButNotReport', async () => {
        render(
            <MessageList
                {...props}
                messages={[message('m1', { isOwn: true, senderId: 'me', senderName: 'Me' })]}
                onReport={vi.fn()}
            />
        );

        await userEvent.click(screen.getByRole('button', { name: 'More actions' }));

        expect(await screen.findByRole('menuitem', { name: 'Copy text' })).toBeInTheDocument();
        expect(screen.queryByRole('menuitem', { name: 'Report message' })).toBeNull();
    });

    it('menu_ownPendingMessage_hasNoActions', () => {
        render(
            <MessageList
                {...props}
                messages={[message('m1', { isOwn: true, senderId: 'me', status: 'sending', tempId: 't1' })]}
            />
        );
        expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
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
        expect(screen.queryByRole('menuitem', { name: 'Report message' })).toBeNull();
    });
});
