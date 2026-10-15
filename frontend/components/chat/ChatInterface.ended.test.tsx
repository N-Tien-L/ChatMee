import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import ChatInterface from './ChatInterface';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { ChatRoom, RoomSettings, RoomType } from '@/lib/types';

let onRoomDeleted: (() => void) | undefined;

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/useRoomMessage', () => ({
    useRoomMessages: (_roomId: string, options?: { onRoomDeleted?: () => void }) => {
        onRoomDeleted = options?.onRoomDeleted;
        return {
            messages: [], connected: true, sendMessage: vi.fn(), resendMessage: vi.fn(), discardMessage: vi.fn(),
            reload: vi.fn(), loadOlder: vi.fn(), loading: false, error: null, hasMoreMessages: false,
            loadingOlder: false, olderError: null,
        };
    },
    useRoomMemberNames: () => ({}),
}));
vi.mock('@/hooks/useWebSocket', () => ({
    useWebSocket: () => ({ sendTyping: vi.fn(), subscribeTyping: () => () => {}, connected: true }),
}));
vi.mock('./ChatHeader', () => ({ default: () => <div>conversation header</div> }));
vi.mock('./MessageList', () => ({ default: () => null }));
vi.mock('./TypingIndicator', () => ({ default: () => null }));
vi.mock('./MessageInput', () => ({ default: () => null }));
vi.mock('@/components/room/RoomPanel', () => ({ RoomPanel: () => null }));

const room = (id: string, roomType = RoomType.PUBLIC): ChatRoom => ({
    id,
    roomName: id,
    roomType,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    maxUsers: 10,
    settings: {} as unknown as RoomSettings,
    participants: ['me', 'u1'],
    unreadCount: 0,
});

const removed = (reason: string) =>
    act(() =>
        useChatRoomsStore.getState().handleUserEvent({
            type: 'ROOM_REMOVED', payload: { roomId: 'r1', reason }, occurredAt: '',
        })
    );

beforeEach(() => {
    onRoomDeleted = undefined;
    useAuthStore.setState({ user: { id: 'me', name: 'Me', avatarUrl: '' } } as never);
    useChatRoomsStore.setState({ rooms: [room('r1')], filteredRooms: [], endedRooms: {}, activeRoomId: 'r1' });
});
afterEach(cleanup);

describe('ChatInterface ended state', () => {
    it.each([
        ['DELETED', 'This room was deleted'],
        ['REMOVED', 'You are no longer a member'],
        ['LEFT', 'You left this room'],
        ['HIDDEN', 'You hid this conversation'],
        ['DECLINED', 'Your message request was declined'],
        ['EXPIRED', 'Your message request expired without an answer'],
    ])('userEvent_roomRemoved%s_showsMatchingEndedView', async (reason, copy) => {
        render(<ChatInterface roomId="r1" />);
        expect(screen.getByText('conversation header')).toBeInTheDocument();

        // Only the user event arrives: no room-topic deletion frame first.
        await removed(reason);

        expect(screen.getByRole('status')).toHaveTextContent(copy);
        expect(screen.queryByText('conversation header')).toBeNull();
    });

    it('userEvent_unknownReason_fallsBackToNoLongerMember', async () => {
        render(<ChatInterface roomId="r1" />);
        await removed('SOMETHING_NEW');
        expect(screen.getByRole('status')).toHaveTextContent('You are no longer a member');
    });

    it('roomTopicDeletion_beforeUserEvent_showsDeleted', async () => {
        render(<ChatInterface roomId="r1" />);
        act(() => onRoomDeleted?.());
        expect(screen.getByRole('status')).toHaveTextContent('This room was deleted');
        await removed('DELETED');
        expect(screen.getByRole('status')).toHaveTextContent('This room was deleted');
    });

    it('render_roomNeverListed_showsNotFound', () => {
        useChatRoomsStore.setState({ rooms: [] });
        render(<ChatInterface roomId="r1" />);
        expect(screen.getByText('Room not found')).toBeInTheDocument();
    });
});
