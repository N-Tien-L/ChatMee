import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatRoomsList from './ChatRoomsList';
import { RoomInfoDialog } from './RoomInfoDialog';
import UserSearchList from '../user/UserSearchList';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useUsersStore } from '@/lib/stores/usersStore';
import { chatRoomApi } from '@/lib/api/chatRoomApi';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/api/chatRoomApi', () => ({
    chatRoomApi: { getChatRoomById: vi.fn() },
}));

afterEach(cleanup);

describe('ChatRoomsList states', () => {
    it('render_loading_showsSkeletonStatus', () => {
        useChatRoomsStore.setState({ loading: true, error: null, filteredRooms: [] });
        render(<ChatRoomsList />);
        expect(screen.getByRole('status', { name: 'Loading chat rooms' })).toBeInTheDocument();
    });

    it('render_error_retryRefetchesRooms', () => {
        const fetchRooms = vi.fn().mockResolvedValue(undefined);
        useChatRoomsStore.setState({ loading: false, error: 'Failed to fetch chat rooms', filteredRooms: [], fetchRooms });
        render(<ChatRoomsList />);
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch chat rooms');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(fetchRooms).toHaveBeenCalledTimes(1);
    });

    it('render_iconOnlyControls_haveAccessibleNames', () => {
        useChatRoomsStore.setState({ loading: false, error: null, filteredRooms: [] });
        render(<ChatRoomsList />);
        expect(screen.getByRole('button', { name: 'Create new chat room' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Public', pressed: false })).toBeInTheDocument();
        expect(screen.getByRole('searchbox', { name: 'Search chats' })).toBeInTheDocument();
    });
});

describe('UserSearchList states', () => {
    it('render_searchError_retrySearchesAgain', () => {
        const fetchUsers = vi.fn().mockResolvedValue(undefined);
        useUsersStore.setState({
            users: [{ id: 'u1', name: 'Bob', avatarUrl: '' }], loading: false, error: 'Failed to fetch users',
            searchQuery: 'bo', filteredUsers: [], fetchUsers,
        });
        render(<UserSearchList onUserAdd={vi.fn()} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch users');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(fetchUsers).toHaveBeenCalledWith('bo');
    });
});

describe('RoomInfoDialog states', () => {
    it('render_loadFailure_showsErrorAndRetryLoadsAgain', async () => {
        vi.mocked(chatRoomApi.getChatRoomById).mockRejectedValue(new Error('Network Error'));
        render(<RoomInfoDialog roomId="r1" isOpen onClose={vi.fn()} />);
        expect(await screen.findByText('Could not load room information')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(chatRoomApi.getChatRoomById).toHaveBeenCalledTimes(2));
    });
});
