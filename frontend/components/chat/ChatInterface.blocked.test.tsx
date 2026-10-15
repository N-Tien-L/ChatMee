import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatInterface from './ChatInterface';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { useUsersStore } from '@/lib/stores/usersStore';
import { userApi } from '@/lib/api/userApi';
import { ChatRoom, RoomSettings, RoomType } from '@/lib/types';

const sendMessage = vi.fn();

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/api/userApi', () => ({ userApi: { unblockUser: vi.fn(), blockUser: vi.fn(), getUserById: vi.fn() } }));
vi.mock('@/hooks/useRoomMessage', () => ({
    useRoomMessages: () => ({
        messages: [], connected: true, sendMessage, resendMessage: vi.fn(), discardMessage: vi.fn(),
        reload: vi.fn(), loadOlder: vi.fn(), loading: false, error: null, hasMoreMessages: false,
        loadingOlder: false, olderError: null,
    }),
    useRoomMemberNames: () => ({}),
}));
vi.mock('@/hooks/useWebSocket', () => ({
    useWebSocket: () => ({ sendTyping: vi.fn(), subscribeTyping: () => () => {}, connected: true }),
}));
vi.mock('./ChatHeader', () => ({ default: () => null }));
vi.mock('./MessageList', () => ({ default: () => null }));
vi.mock('./TypingIndicator', () => ({ default: () => null }));
vi.mock('@/components/room/RoomPanel', () => ({ RoomPanel: () => null }));

const dm = (blocked: boolean): ChatRoom => ({
    id: 'dm1',
    roomName: '',
    roomType: RoomType.DIRECT_MESSAGE,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'me',
    maxUsers: 2,
    settings: {} as unknown as RoomSettings,
    participants: ['me', 'bob'],
    counterpart: { id: 'bob', name: 'Bob', avatarUrl: '' },
    unreadCount: 0,
    blocked,
});

beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 'me', name: 'Me', avatarUrl: '' } } as never);
    useUsersStore.setState({ blockedUsers: [{ id: 'bob', name: 'Bob', blockedAt: '2026-10-01T00:00:00Z' }] });
});
afterEach(cleanup);

const field = () => screen.getByRole('textbox');

describe('ChatInterface blocked DM', () => {
    it('render_blockerOfDm_showsBannerAndDisablesComposer', () => {
        useChatRoomsStore.setState({ rooms: [dm(true)], filteredRooms: [], endedRooms: {} });
        render(<ChatInterface roomId="dm1" />);

        expect(screen.getByText('You blocked Bob. Unblock them to send messages.')).toBeInTheDocument();
        expect(field()).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    });

    it('unblock_fromBanner_callsApiAndRestoresSending', async () => {
        vi.mocked(userApi.unblockUser).mockResolvedValue(undefined);
        useChatRoomsStore.setState({ rooms: [dm(true)], filteredRooms: [], endedRooms: {} });
        render(<ChatInterface roomId="dm1" />);

        fireEvent.click(screen.getByRole('button', { name: 'Unblock' }));

        await waitFor(() => expect(userApi.unblockUser).toHaveBeenCalledWith('bob'));
        await waitFor(() => expect(screen.queryByText(/You blocked Bob/)).toBeNull());
        expect(field()).not.toBeDisabled();
        expect(useChatRoomsStore.getState().rooms[0].blocked).toBe(false);
        expect(useUsersStore.getState().blockedUsers).toEqual([]);
    });

    it('render_notBlocked_composerEnabledWithoutBanner', () => {
        useChatRoomsStore.setState({ rooms: [dm(false)], filteredRooms: [], endedRooms: {} });
        render(<ChatInterface roomId="dm1" />);

        expect(screen.queryByText(/You blocked/)).toBeNull();
        expect(field()).not.toBeDisabled();
    });
});
