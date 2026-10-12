import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ChatRoomListItem from './ChatRoomListItem';
import { useAuthStore } from '@/lib/stores/authStore';
import { ChatRoom, RoomSettings, RoomType } from '@/lib/types';

vi.mock('./RoomInfoDialog', () => ({ RoomInfoDialog: () => null }));
vi.mock('./RoomSettingsDialog', () => ({ RoomSettingsDialog: () => null }));

const base: ChatRoom = {
    id: 'r1',
    roomName: 'General',
    roomType: RoomType.PUBLIC,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    maxUsers: 10,
    settings: {} as unknown as RoomSettings,
    participants: ['me', 'u1'],
    lastActivityAt: '2026-02-01T00:00:00Z',
    unreadCount: 0,
};

const renderRow = (room: Partial<ChatRoom>) =>
    render(<ChatRoomListItem room={{ ...base, ...room }} onLeave={vi.fn()} onDelete={vi.fn()} />);

describe('ChatRoomListItem', () => {
    beforeEach(() => {
        useAuthStore.setState({ user: { id: 'me', name: 'Me' } as never });
    });
    afterEach(cleanup);

    it('render_ownLastMessage_showsYouPrefixedPreview', () => {
        renderRow({ lastMessage: { id: 'm', senderId: 'me', senderName: 'Me', preview: 'on my way', createdAt: '2026-02-01T00:00:00Z' } });
        expect(screen.getByText('You: on my way')).toBeTruthy();
    });

    it('render_otherUsersLastMessage_showsSenderNamePrefixedPreview', () => {
        renderRow({ lastMessage: { id: 'm', senderId: 'u1', senderName: 'Alice', preview: 'hello', createdAt: '2026-02-01T00:00:00Z' } });
        expect(screen.getByText('Alice: hello')).toBeTruthy();
    });

    it('render_unreadMessages_showsBadgeAndBoldName', () => {
        renderRow({ unreadCount: 3 });
        expect(screen.getByText('3')).toBeTruthy();
        expect(screen.getByText('General').closest('h3')?.className).toContain('font-semibold');
    });

    it('render_noUnread_showsNoBadge', () => {
        renderRow({ unreadCount: 0 });
        expect(screen.queryByText('0')).toBeNull();
    });

    it('render_requestedState_showsPendingChip', () => {
        renderRow({ state: 'REQUESTED' });
        expect(screen.getByText('Pending')).toBeTruthy();
    });

    it('render_missingState_showsNoPendingChip', () => {
        renderRow({});
        expect(screen.queryByText('Pending')).toBeNull();
    });

    it('render_privateRoom_showsLockIcon', () => {
        renderRow({ roomType: RoomType.PRIVATE });
        expect(screen.getByLabelText('Private room')).toBeTruthy();
    });
});
