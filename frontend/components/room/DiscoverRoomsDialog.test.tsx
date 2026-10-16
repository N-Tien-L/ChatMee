import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DiscoverRoomsDialog } from './DiscoverRoomsDialog';
import { useDiscoverRoomsStore } from '@/lib/stores/discoverRoomsStore';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/api/chatRoomApi', () => ({
    chatRoomApi: { discoverRooms: vi.fn(), joinChatRoom: vi.fn(), getChatRooms: vi.fn() },
}));
vi.mock('@/lib/api/userApi', () => ({ userApi: { getUserById: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const base = {
    isOpen: true, query: '', results: [], page: 0, hasMore: false, loading: false, loadingMore: false,
    error: null, joinError: null, joiningId: null,
};

beforeEach(() => {
    push.mockReset();
    useDiscoverRoomsStore.setState({
        ...base,
        search: vi.fn().mockResolvedValue(undefined),
        loadMore: vi.fn().mockResolvedValue(undefined),
        join: vi.fn().mockResolvedValue(true),
        setQuery: vi.fn(),
    });
});
afterEach(cleanup);

describe('DiscoverRoomsDialog', () => {
    it('search_refresh_keepsExistingRowMountedWithoutFlashingSkeletons', () => {
        useDiscoverRoomsStore.setState({
            results: [{ id: 'r1', name: 'General', memberCount: 3, maxMembers: 10 }],
        });
        const { container } = render(<DiscoverRoomsDialog />);
        const row = screen.getByRole('button', { name: 'Join General' });

        act(() => useDiscoverRoomsStore.setState({ query: 'gen', loading: true }));

        expect(screen.getByRole('button', { name: 'Join General' })).toBe(row);
        expect(row).toBeDisabled();
        expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
        expect(screen.getByRole('status', { name: 'Loading public rooms' })).toBeInTheDocument();

        act(() => useDiscoverRoomsStore.setState({ loading: false }));
        expect(screen.getByRole('button', { name: 'Join General' })).toBe(row);
        expect(row).toBeEnabled();
    });

    it('search_emptyResults_doesNotFlashSkeletonsDuringEachRequest', () => {
        useDiscoverRoomsStore.setState({ loading: true });
        render(<DiscoverRoomsDialog />);
        expect(screen.getByRole('dialog').querySelector('.animate-pulse')).not.toBeInTheDocument();
        expect(screen.getByText('No public rooms found')).toBeInTheDocument();
    });

    it('render_loading_showsSearchStatus', () => {
        useDiscoverRoomsStore.setState({ loading: true });
        render(<DiscoverRoomsDialog />);
        expect(screen.getByRole('status', { name: 'Loading public rooms' })).toBeInTheDocument();
    });

    it('render_noResults_showsEmptyState', () => {
        render(<DiscoverRoomsDialog />);
        expect(screen.getByText('No public rooms found')).toBeInTheDocument();
        expect(screen.getByRole('searchbox', { name: 'Search public rooms' })).toBeInTheDocument();
    });

    it('render_error_retrySearchesAgain', () => {
        const search = vi.fn().mockResolvedValue(undefined);
        useDiscoverRoomsStore.setState({ error: 'Failed to load rooms', search });
        render(<DiscoverRoomsDialog />);
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to load rooms');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(search).toHaveBeenCalledTimes(1);
    });

    it('render_results_joinButtonJoinsThatRoom', () => {
        const join = vi.fn().mockResolvedValue(true);
        useDiscoverRoomsStore.setState({
            results: [{ id: 'r1', name: 'General', memberCount: 3, maxMembers: 10 }], join,
        });
        render(<DiscoverRoomsDialog />);
        expect(screen.getByText('3 / 10 members')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Join General' }));
        expect(join).toHaveBeenCalledWith('r1');
    });

    it('render_joinError_showsAlertAndTypingForwardsToStore', () => {
        const setQuery = vi.fn();
        useDiscoverRoomsStore.setState({
            joinError: 'This room is full.', setQuery,
            results: [{ id: 'r1', name: 'General', memberCount: 10, maxMembers: 10 }],
        });
        render(<DiscoverRoomsDialog />);
        expect(screen.getByRole('alert')).toHaveTextContent('This room is full.');
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search public rooms' }), { target: { value: 'gen' } });
        expect(setQuery).toHaveBeenCalledWith('gen');
    });

    it('join_success_closesDialogAndOpensTheJoinedRoom', async () => {
        const close = vi.fn();
        useDiscoverRoomsStore.setState({
            results: [{ id: 'r1', name: 'General', memberCount: 3, maxMembers: 10 }],
            join: vi.fn().mockResolvedValue(true), close,
        });
        render(<DiscoverRoomsDialog />);
        fireEvent.click(screen.getByRole('button', { name: 'Join General' }));
        await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard?roomId=r1', { scroll: false }));
        expect(close).toHaveBeenCalled();
    });

    it('join_failure_keepsDialogOpen', async () => {
        const close = vi.fn();
        useDiscoverRoomsStore.setState({
            results: [{ id: 'r1', name: 'General', memberCount: 10, maxMembers: 10 }],
            join: vi.fn().mockResolvedValue(false), close,
        });
        render(<DiscoverRoomsDialog />);
        fireEvent.click(screen.getByRole('button', { name: 'Join General' }));
        await Promise.resolve();
        expect(close).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
    });
});
