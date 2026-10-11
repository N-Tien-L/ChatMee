import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { useDiscoverRoomsStore } from './discoverRoomsStore';
import { chatRoomApi } from '../api/chatRoomApi';
import { PublicRoomSummary } from '@/lib/types';

vi.mock('../api/chatRoomApi', () => ({
    chatRoomApi: {
        discoverRooms: vi.fn(),
        joinChatRoom: vi.fn(),
        getChatRooms: vi.fn(),
    },
}));
vi.mock('../api/userApi', () => ({ userApi: { getUserById: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const room = (id: string): PublicRoomSummary => ({ id, name: `Room ${id}`, memberCount: 1, maxMembers: 10 });
const pageOf = (content: PublicRoomSummary[], page: number, totalPages: number) => ({
    success: true,
    data: { content, page, size: 20, totalElements: content.length, totalPages },
});

describe('discoverRoomsStore', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        useDiscoverRoomsStore.setState({
            isOpen: false, query: '', results: [], page: 0, hasMore: false, loading: false,
            loadingMore: false, error: null, joinError: null, joiningId: null,
        });
    });
    afterEach(() => {
        useDiscoverRoomsStore.getState().close();
        vi.useRealTimers();
    });

    it('setQuery_typingQuickly_searchesOnceAfter300ms', async () => {
        vi.mocked(chatRoomApi.discoverRooms).mockResolvedValue(pageOf([room('a')], 0, 1));
        const store = useDiscoverRoomsStore.getState();

        store.setQuery('g');
        store.setQuery('ge');
        store.setQuery('gen');
        await vi.advanceTimersByTimeAsync(299);
        expect(chatRoomApi.discoverRooms).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);

        expect(chatRoomApi.discoverRooms).toHaveBeenCalledTimes(1);
        expect(chatRoomApi.discoverRooms).toHaveBeenCalledWith('gen', 0, 20);
        expect(useDiscoverRoomsStore.getState().results).toEqual([room('a')]);
    });

    it('loadMore_hasMorePages_appendsNextPageWithoutDuplicates', async () => {
        vi.mocked(chatRoomApi.discoverRooms)
            .mockResolvedValueOnce(pageOf([room('a'), room('b')], 0, 2))
            .mockResolvedValueOnce(pageOf([room('b'), room('c')], 1, 2));

        await useDiscoverRoomsStore.getState().search('');
        expect(useDiscoverRoomsStore.getState().hasMore).toBe(true);
        await useDiscoverRoomsStore.getState().loadMore();

        const state = useDiscoverRoomsStore.getState();
        expect(chatRoomApi.discoverRooms).toHaveBeenLastCalledWith('', 1, 20);
        expect(state.results.map((r) => r.id)).toEqual(['a', 'b', 'c']);
        expect(state.hasMore).toBe(false);
    });

    it('search_requestFails_setsErrorForRetry', async () => {
        vi.mocked(chatRoomApi.discoverRooms).mockRejectedValueOnce(new Error('boom'));

        await useDiscoverRoomsStore.getState().search('');

        const state = useDiscoverRoomsStore.getState();
        expect(state.error).toBe('Failed to load rooms');
        expect(state.loading).toBe(false);
    });

    it('join_success_removesResultAndRefreshesRoomList', async () => {
        useDiscoverRoomsStore.setState({ results: [room('a'), room('b')] });
        vi.mocked(chatRoomApi.joinChatRoom).mockResolvedValueOnce(undefined);
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValueOnce({ success: true, data: [] });

        const joined = await useDiscoverRoomsStore.getState().join('a');

        expect(joined).toBe(true);
        expect(chatRoomApi.joinChatRoom).toHaveBeenCalledWith('a');
        expect(chatRoomApi.getChatRooms).toHaveBeenCalledTimes(1);
        expect(useDiscoverRoomsStore.getState().results.map((r) => r.id)).toEqual(['b']);
    });

    it('join_roomFull_keepsResultAndShowsReadableError', async () => {
        useDiscoverRoomsStore.setState({ results: [room('a')] });
        const cause = new AxiosError('conflict', '409', undefined, undefined, {
            status: 409, statusText: 'Conflict', headers: {}, config: { headers: new AxiosHeaders() },
            data: { code: 'ROOM_FULL', detail: 'Room has reached maximum capacity' },
        });
        vi.mocked(chatRoomApi.joinChatRoom).mockRejectedValueOnce(
            new Error('Room has reached maximum capacity', { cause }));

        const joined = await useDiscoverRoomsStore.getState().join('a');

        const state = useDiscoverRoomsStore.getState();
        expect(joined).toBe(false);
        expect(state.joinError).toBe('This room is full.');
        expect(state.results.map((r) => r.id)).toEqual(['a']);
        expect(chatRoomApi.getChatRooms).not.toHaveBeenCalled();
    });
});
