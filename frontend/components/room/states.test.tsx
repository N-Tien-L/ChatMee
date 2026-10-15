import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatRoomsList from './ChatRoomsList';
import { RoomPanel } from './RoomPanel';
import { userApi } from '@/lib/api/userApi';
import UserSearchList from '../user/UserSearchList';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useUsersStore } from '@/lib/stores/usersStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { chatRoomApi } from '@/lib/api/chatRoomApi';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/api/chatRoomApi', () => ({
    chatRoomApi: { getChatRoomById: vi.fn(), getMembers: vi.fn() },
}));
vi.mock('@/lib/api/userApi', () => ({
    userApi: { searchUsers: vi.fn(), getUserById: vi.fn() },
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
        expect(screen.getByRole('button', { name: 'New message' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New room' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Direct', pressed: false })).toBeInTheDocument();
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

describe('UserSearchList loading', () => {
    it('render_searching_showsBusyStatus', () => {
        useUsersStore.setState({ users: [], loading: true, error: null, searchQuery: 'bo', filteredUsers: [] });
        render(<UserSearchList onUserAdd={vi.fn()} />);
        expect(screen.getByRole('status', { name: 'Searching users' })).toHaveAttribute('aria-busy', 'true');
    });
});

describe('RoomPanel states', () => {
    beforeEach(() => {
        vi.mocked(chatRoomApi.getChatRoomById).mockReset();
        vi.mocked(chatRoomApi.getMembers).mockReset();
    });

    it('render_loading_showsBusyStatus', () => {
        vi.mocked(chatRoomApi.getChatRoomById).mockReturnValue(new Promise(() => {}));
        render(<RoomPanel roomId="r1" isOpen onClose={vi.fn()} />);
        expect(screen.getByRole('status', { name: 'Loading room information' })).toHaveAttribute('aria-busy', 'true');
    });

    it('render_loadFailure_showsErrorAndRetryLoadsAgain', async () => {
        vi.mocked(chatRoomApi.getChatRoomById).mockRejectedValue(new Error('Network Error'));
        render(<RoomPanel roomId="r1" isOpen onClose={vi.fn()} />);
        expect(await screen.findByText('Could not load room information')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(chatRoomApi.getChatRoomById).toHaveBeenCalledTimes(2));
    });

    it('render_membersLoadFailure_showsMembersErrorAndRetryLoadsMembersAgain', async () => {
        vi.mocked(chatRoomApi.getChatRoomById).mockResolvedValue({
            success: true,
            data: { id: 'r1', roomName: 'Room', roomType: 'PUBLIC', createdAt: '2026-10-09T10:00:00Z', participants: ['u1'], myRole: 'MEMBER' },
        } as never);
        vi.mocked(chatRoomApi.getMembers).mockRejectedValue(new Error('Network Error'));
        useAuthStore.setState({ user: { id: 'u1', name: 'Alice' } } as never);
        render(<RoomPanel roomId="r1" isOpen onClose={vi.fn()} />);
        expect(await screen.findByText('Could not load the members.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(chatRoomApi.getMembers).toHaveBeenCalledTimes(2));
    });
});
