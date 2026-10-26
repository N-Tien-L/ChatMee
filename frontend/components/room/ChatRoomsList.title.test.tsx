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
    chatRoomApi: { getChatRooms: vi.fn(), markRoomRead: vi.fn(), getChatRoomById: vi.fn(), getMembers: vi.fn() },
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


it('refetch_overlappingActivity_keepsBadgeOrderAndTitleInSync', async () => {
    useChatRoomsStore.setState({ rooms: [], filteredRooms: [], loading: false, error: null });
    const store = useChatRoomsStore.getState();
    const recent = { ...room('r2', 0), lastActivityAt: '2026-10-02T00:00:00Z' };
    store.setRooms([room('r1', 0), recent]);
    const view = render(<ChatRoomsList />);
    let resolve!: (value: Awaited<ReturnType<typeof chatRoomApi.getChatRooms>>) => void;
    vi.mocked(chatRoomApi.getChatRooms).mockReturnValueOnce(new Promise(done => { resolve = done; }))
        .mockResolvedValue({ success: true, data: [{ ...room('r1', 1), lastActivityAt: '2026-10-03T00:00:00Z' }, recent] } as never);
    let pending!: Promise<void>;
    act(() => {
        pending = store.fetchRooms();
        store.applyActivity('r1', { id: 'new-message', senderId: 'other', senderName: 'Bob', preview: 'New', createdAt: '2026-10-03T00:00:00Z' });
    });
    expect(document.title).toBe('(1) ChatMee');
    await act(async () => {
        resolve({ success: true, data: [room('r1', 0), recent] } as never);
        await pending;
    });
    expect(document.title).toBe('(1) ChatMee');
    expect(view.getByLabelText('1 unread messages')).toBeInTheDocument();
    expect(useChatRoomsStore.getState().filteredRooms.map(row => row.id)).toEqual(['r1', 'r2']);
});
