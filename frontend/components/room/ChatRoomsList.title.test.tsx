import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import ChatRoomsList from './ChatRoomsList';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { chatRoomApi } from '@/lib/api/chatRoomApi';
import { ChatRoom, RoomSettings, RoomType } from '@/lib/types';

// SPEC-008 AC-008-4 (CM-067): the document title shows the total unread count.
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/api/chatRoomApi', () => ({
    chatRoomApi: { markRoomRead: vi.fn(), getChatRoomById: vi.fn(), getMembers: vi.fn() },
}));
vi.mock('@/lib/api/userApi', () => ({ userApi: { searchUsers: vi.fn(), getUserById: vi.fn() } }));

const room = (id: string, unreadCount: number): ChatRoom => ({
    id,
    roomName: `Room ${id}`,
    roomType: RoomType.PUBLIC,
    createdAt: '2026-10-01T00:00:00Z',
    createdBy: 'me',
    maxUsers: 10,
    settings: {} as unknown as RoomSettings,
    participants: ['me'],
    unreadCount,
});

afterEach(() => {
    cleanup();
    document.title = '';
});

describe('ChatRoomsList document title', () => {
    it('render_unreadRooms_showsTotalInTitleAndClearsWhenRead', async () => {
        vi.mocked(chatRoomApi.markRoomRead).mockResolvedValue(undefined);
        useChatRoomsStore.setState({ rooms: [room('r1', 2), room('r2', 3)], filteredRooms: [], loading: false, error: null });

        render(<ChatRoomsList />);
        expect(document.title).toBe('(5) ChatMee');

        await act(() => useChatRoomsStore.getState().markRoomRead('r1'));
        await waitFor(() => expect(document.title).toBe('(3) ChatMee'));

        await act(() => useChatRoomsStore.getState().markRoomRead('r2'));
        await waitFor(() => expect(document.title).toBe('ChatMee'));
        expect(chatRoomApi.markRoomRead).toHaveBeenCalledWith('r2');
    });

    it('render_noUnread_showsPlainTitle', () => {
        useChatRoomsStore.setState({ rooms: [room('r1', 0)], filteredRooms: [], loading: false, error: null });
        render(<ChatRoomsList />);
        expect(document.title).toBe('ChatMee');
    });
});
