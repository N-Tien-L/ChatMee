import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockedUsersList } from './BlockedUsersList';
import { userApi } from '@/lib/api/userApi';
import { useUsersStore } from '@/lib/stores/usersStore';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { RoomType } from '@/lib/types';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api/userApi', () => ({
    userApi: { listBlocks: vi.fn(), unblockUser: vi.fn(), blockUser: vi.fn(), getUserById: vi.fn() },
}));

beforeEach(() => {
    vi.clearAllMocks();
    useUsersStore.setState({ blockedUsers: null, blocksError: null });
});
afterEach(cleanup);

describe('BlockedUsersList', () => {
    it('render_blocks_listsThemAndUnblockRemovesRowAndRestoresDm', async () => {
        vi.mocked(userApi.listBlocks).mockResolvedValue({
            success: true, data: [{ id: 'bob', name: 'Bob', avatarUrl: null, blockedAt: '2026-10-01T00:00:00Z' }],
        } as never);
        vi.mocked(userApi.unblockUser).mockResolvedValue(undefined);
        useChatRoomsStore.setState({
            rooms: [{ id: 'dm1', roomType: RoomType.DIRECT_MESSAGE, counterpart: { id: 'bob', name: 'Bob', avatarUrl: '' }, blocked: true }],
        } as never);
        render(<BlockedUsersList />);

        fireEvent.click(await screen.findByRole('button', { name: 'Unblock Bob' }));

        await waitFor(() => expect(userApi.unblockUser).toHaveBeenCalledWith('bob'));
        expect(await screen.findByText('You have not blocked anyone.')).toBeInTheDocument();
        expect(useChatRoomsStore.getState().rooms[0].blocked).toBe(false);
    });

    it('render_loadFailure_showsRetry', async () => {
        vi.mocked(userApi.listBlocks).mockRejectedValue(new Error('Network Error'));
        render(<BlockedUsersList />);
        expect(await screen.findByRole('alert')).toHaveTextContent('Network Error');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(userApi.listBlocks).toHaveBeenCalledTimes(2));
    });
});
