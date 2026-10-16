import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useUsersStore } from './usersStore';
import { userApi } from '../api/userApi';
import { UserSummaryResponse, PagedResponse } from "@/lib/types";

vi.mock('../api/userApi', () => ({
    userApi: {
        searchUsers: vi.fn(),
        getUserById: vi.fn(),
        blockUser: vi.fn(),
        unblockUser: vi.fn(),
    }
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const mockUser: UserSummaryResponse = {
    id: 'user1',
    name: 'Test User',
    avatarUrl: 'test-url'
};

const mockPage: PagedResponse<UserSummaryResponse> = {
    content: [mockUser],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1
};

describe('usersStore', () => {
    beforeEach(() => {
        useUsersStore.setState({
            users: [],
            filteredUsers: [],
            loading: false,
            searchQuery: ''
        });
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('setSearchQuery updates query and calls API after debounce', async () => {
        vi.mocked(userApi.searchUsers).mockResolvedValue({
            success: true,
            data: mockPage
        });

        // Use the store function
        useUsersStore.getState().setSearchQuery('test');
        
        // Immediately, query should be set, but API not called
        expect(useUsersStore.getState().searchQuery).toBe('test');
        expect(userApi.searchUsers).not.toHaveBeenCalled();

        // Advance timers to trigger debounce
        vi.advanceTimersByTime(300);

        // API should be called
        expect(userApi.searchUsers).toHaveBeenCalledWith('test', 0, 50);

        // Wait for microtasks so promise resolves
        await vi.runAllTimersAsync();

        // Check if users were stored
        expect(useUsersStore.getState().users).toEqual([mockUser]);
        expect(useUsersStore.getState().filteredUsers).toEqual([mockUser]);
    });

    it('setSearchQuery typed rapidly only searches the last query', async () => {
        vi.mocked(userApi.searchUsers).mockResolvedValue({ success: true, data: mockPage });

        useUsersStore.getState().setSearchQuery('te');
        vi.advanceTimersByTime(100);
        useUsersStore.getState().setSearchQuery('test');
        await vi.runAllTimersAsync();

        expect(userApi.searchUsers).toHaveBeenCalledTimes(1);
        expect(userApi.searchUsers).toHaveBeenCalledWith('test', 0, 50);
    });

    it('fetchUsers response for an outdated query is ignored', async () => {
        vi.mocked(userApi.searchUsers).mockResolvedValue({ success: true, data: mockPage });
        useUsersStore.setState({ searchQuery: 'newer' });

        await useUsersStore.getState().fetchUsers('older');

        expect(useUsersStore.getState().users).toEqual([]);
        expect(useUsersStore.getState().loading).toBe(false);
    });
});

describe('usersStore blocks', () => {
    it('blockUser_success_dropsUserFromResultsAndFlagsTheirDm', async () => {
        const { useChatRoomsStore } = await import('./chatRoomsStore');
        const { RoomType } = await import('@/lib/types');
        useChatRoomsStore.setState({
            rooms: [{ id: 'dm1', roomType: RoomType.DIRECT_MESSAGE, counterpart: { id: 'user1', name: 'Test User', avatarUrl: '' } }],
        } as never);
        useUsersStore.setState({ users: [mockUser], filteredUsers: [mockUser], blockedUsers: [] });
        vi.mocked(userApi.blockUser).mockResolvedValue(undefined);

        expect(await useUsersStore.getState().blockUser(mockUser)).toBe(true);

        expect(userApi.blockUser).toHaveBeenCalledWith('user1');
        expect(useUsersStore.getState().filteredUsers).toEqual([]);
        expect(useUsersStore.getState().blockedUsers?.map((b) => b.id)).toEqual(['user1']);
        expect(useChatRoomsStore.getState().rooms[0].blocked).toBe(true);
    });

    it('blockUser_failure_keepsStateAndReturnsFalse', async () => {
        useUsersStore.setState({ users: [mockUser], filteredUsers: [mockUser], blockedUsers: [] });
        vi.mocked(userApi.blockUser).mockRejectedValue(new Error('Not found'));

        expect(await useUsersStore.getState().blockUser(mockUser)).toBe(false);
        expect(useUsersStore.getState().filteredUsers).toHaveLength(1);
        expect(useUsersStore.getState().blockedUsers).toEqual([]);
    });
});
