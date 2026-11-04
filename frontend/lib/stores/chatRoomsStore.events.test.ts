import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatRoomsStore } from './chatRoomsStore';
import { chatRoomApi } from '../api/chatRoomApi';
import { RoomType, RoomSettings, ChatRoomResponse } from '@/lib/types';
import toast from 'react-hot-toast';
import { useAuthStore } from './authStore';

vi.mock('../api/chatRoomApi', () => ({
    chatRoomApi: {
        getChatRooms: vi.fn(),
        getChatRoomById: vi.fn(),
        markRoomRead: vi.fn(),
    },
}));
vi.mock('../api/userApi', () => ({ userApi: { getUserById: vi.fn() } }));
vi.mock('./authStore', () => ({
    useAuthStore: { getState: vi.fn(() => ({ user: { id: 'me' } })) },
}));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const room = (id: string, extra: Partial<ChatRoomResponse> = {}): ChatRoomResponse => ({
    id,
    roomName: id,
    roomType: RoomType.PUBLIC,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    maxUsers: 10,
    settings: {} as unknown as RoomSettings,
    participants: ['me', 'u1'],
    unreadCount: 0,
    ...extra,
});

const last = (senderId: string, createdAt = '2026-02-01T00:00:00Z') => ({
    id: 'm1', senderId, senderName: 'Alice', preview: 'hi', createdAt,
});

const setVisibility = (state: 'visible' | 'hidden') =>
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

const ids = () => useChatRoomsStore.getState().rooms.map(r => r.id);
const find = (id: string) => useChatRoomsStore.getState().rooms.find(r => r.id === id);

describe('chatRoomsStore user events', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(chatRoomApi.markRoomRead).mockResolvedValue(undefined);
        setVisibility('visible');
        useChatRoomsStore.setState({
            rooms: [], filteredRooms: [], searchQuery: '', roomTypeFilter: 'ALL',
            loading: false, error: null, activeRoomId: null, endedRooms: {},
        });
    });
    afterEach(() => setVisibility('visible'));

    it('upsertRoom_sameIdTwice_keepsOneRowAndReplacesIt', () => {
        const { upsertRoom } = useChatRoomsStore.getState();
        upsertRoom(room('r1', { roomName: 'Old' }));
        upsertRoom(room('r1', { roomName: 'New' }));
        expect(ids()).toEqual(['r1']);
        expect(find('r1')?.roomName).toBe('New');
    });

    it('addRoom_roomAlreadyAddedByEvent_keepsOneRow', () => {
        const { upsertRoom, addRoom } = useChatRoomsStore.getState();
        upsertRoom(room('r1'));
        addRoom(room('r1'));
        expect(ids()).toEqual(['r1']);
        expect(useChatRoomsStore.getState().filteredRooms.map(r => r.id)).toEqual(['r1']);
    });

    it('upsertRoom_directRoom_usesCounterpartNameAsDisplayName', () => {
        useChatRoomsStore.getState().upsertRoom(room('d1', {
            roomType: RoomType.DIRECT_MESSAGE,
            counterpart: { id: 'u2', name: 'Bob' } as never,
        }));
        expect(find('d1')?.displayName).toBe('Bob');
    });

    it('removeRoom_knownRoom_dropsItAndClearsActiveRoom', () => {
        useChatRoomsStore.setState({ rooms: [room('r1'), room('r2')], activeRoomId: 'r1' });
        useChatRoomsStore.getState().removeRoom('r1');
        expect(ids()).toEqual(['r2']);
        expect(useChatRoomsStore.getState().activeRoomId).toBeNull();
    });

    it('setRooms_unsortedInput_ordersByLastActivityDescending', () => {
        useChatRoomsStore.getState().setRooms([
            room('old', { lastActivityAt: '2026-01-02T00:00:00Z' }),
            room('new', { lastActivityAt: '2026-03-01T00:00:00Z' }),
            room('none'),
        ]);
        expect(useChatRoomsStore.getState().filteredRooms.map(r => r.id)).toEqual(['new', 'old', 'none']);
    });

    it('applyActivity_otherUsersMessage_incrementsUnreadAndMovesRoomToTop', () => {
        useChatRoomsStore.getState().setRooms([
            room('a', { lastActivityAt: '2026-02-01T00:00:00Z' }),
            room('b', { lastActivityAt: '2026-01-01T00:00:00Z' }),
        ]);
        useChatRoomsStore.getState().applyActivity('b', last('u1', '2026-04-01T00:00:00Z'));
        expect(find('b')?.unreadCount).toBe(1);
        expect(find('b')?.lastMessage?.preview).toBe('hi');
        expect(useChatRoomsStore.getState().filteredRooms[0].id).toBe('b');
    });

    it('applyActivity_ownMessage_doesNotIncrementUnread', () => {
        useChatRoomsStore.getState().setRooms([room('a')]);
        useChatRoomsStore.getState().applyActivity('a', last('me'));
        expect(find('a')?.unreadCount).toBe(0);
    });

    it('applyActivity_openRoomWhileVisible_keepsZeroUnreadAndMarksRead', () => {
        useChatRoomsStore.setState({ activeRoomId: 'a' });
        useChatRoomsStore.getState().setRooms([room('a')]);
        useChatRoomsStore.getState().applyActivity('a', last('u1'));
        expect(find('a')?.unreadCount).toBe(0);
        expect(chatRoomApi.markRoomRead).toHaveBeenCalledWith('a');
    });

    it('applyActivity_openRoomWhileTabHidden_incrementsUnreadWithoutMarkingRead', () => {
        setVisibility('hidden');
        useChatRoomsStore.setState({ activeRoomId: 'a' });
        useChatRoomsStore.getState().setRooms([room('a')]);
        useChatRoomsStore.getState().applyActivity('a', last('u1'));
        expect(find('a')?.unreadCount).toBe(1);
        expect(chatRoomApi.markRoomRead).not.toHaveBeenCalled();
    });

    it('markRoomRead_roomWithUnread_zeroesCountAndCallsApi', async () => {
        useChatRoomsStore.getState().setRooms([room('a', { unreadCount: 4 })]);
        await useChatRoomsStore.getState().markRoomRead('a');
        expect(find('a')?.unreadCount).toBe(0);
        expect(chatRoomApi.markRoomRead).toHaveBeenCalledWith('a');
    });

    it('handleUserEvent_roomAdded_upsertsRoom', async () => {
        await useChatRoomsStore.getState().handleUserEvent({
            type: 'ROOM_ADDED', payload: { room: room('r9') }, occurredAt: '2026-02-01T00:00:00Z',
        });
        expect(ids()).toEqual(['r9']);
    });

    it.each(['LEFT', 'REMOVED', 'DELETED', 'HIDDEN', 'DECLINED', 'EXPIRED'])(
        'handleUserEvent_roomRemovedReason%s_removesRoom', async reason => {
            useChatRoomsStore.setState({ rooms: [room('r1')] });
            await useChatRoomsStore.getState().handleUserEvent({
                type: 'ROOM_REMOVED', payload: { roomId: 'r1', reason }, occurredAt: '',
            });
            expect(ids()).toEqual([]);
            expect(useChatRoomsStore.getState().endedRooms).toEqual({ r1: reason });
        });

    it.each([
        ['DECLINED', 'Your message request to Bob was declined'],
        ['EXPIRED', 'Your message request to Bob expired'],
    ])('handleUserEvent_roomRemoved%s_toastsRequestOutcome', async (reason, message) => {
        useChatRoomsStore.setState({ rooms: [{ ...room('dm1', { roomType: RoomType.DIRECT_MESSAGE }), displayName: 'Bob' }] });
        await useChatRoomsStore.getState().handleUserEvent({
            type: 'ROOM_REMOVED', payload: { roomId: 'dm1', reason }, occurredAt: '',
        });
        expect(toast).toHaveBeenCalledWith(message, { id: 'dm-request-dm1' });
    });

    it.each(['LEFT', 'REMOVED', 'DELETED', 'HIDDEN'])('handleUserEvent_roomRemoved%s_noRequestToast', async reason => {
        useChatRoomsStore.setState({ rooms: [room('r1')] });
        await useChatRoomsStore.getState().handleUserEvent({
            type: 'ROOM_REMOVED', payload: { roomId: 'r1', reason }, occurredAt: '',
        });
        expect(toast).not.toHaveBeenCalled();
    });

    it('handleUserEvent_roomRemovedUnknownReason_removesRoomWithoutReason', async () => {
        useChatRoomsStore.setState({ rooms: [room('r1')] });
        await useChatRoomsStore.getState().handleUserEvent({
            type: 'ROOM_REMOVED', payload: { roomId: 'r1', reason: 'BOGUS' }, occurredAt: '',
        });
        expect(ids()).toEqual([]);
        expect(useChatRoomsStore.getState().endedRooms).toEqual({});
    });

    it('upsertRoom_afterRemoval_clearsEndedReason', async () => {
        useChatRoomsStore.setState({ rooms: [room('r1')] });
        await useChatRoomsStore.getState().handleUserEvent({
            type: 'ROOM_REMOVED', payload: { roomId: 'r1', reason: 'LEFT' }, occurredAt: '',
        });
        await useChatRoomsStore.getState().handleUserEvent({
            type: 'ROOM_ADDED', payload: { room: room('r1') }, occurredAt: '',
        });
        expect(ids()).toEqual(['r1']);
        expect(useChatRoomsStore.getState().endedRooms).toEqual({});
    });

    it('handleUserEvent_roomUpdated_replacesRoomWithoutDuplicate', async () => {
        useChatRoomsStore.getState().setRooms([room('r1', { roomName: 'Old', unreadCount: 2 })]);
        await useChatRoomsStore.getState().handleUserEvent({
            type: 'ROOM_UPDATED', payload: { room: room('r1', { roomName: 'New', unreadCount: 2 }) }, occurredAt: '',
        });
        expect(ids()).toEqual(['r1']);
        expect(find('r1')?.roomName).toBe('New');
    });

    it('handleUserEvent_activityForKnownRoom_appliesActivity', async () => {
        useChatRoomsStore.getState().setRooms([room('r1')]);
        await useChatRoomsStore.getState().handleUserEvent({
            type: 'ROOM_ACTIVITY', payload: { roomId: 'r1', lastMessage: last('u1') }, occurredAt: '',
        });
        expect(find('r1')?.unreadCount).toBe(1);
        expect(chatRoomApi.getChatRoomById).not.toHaveBeenCalled();
    });

    it('handleUserEvent_activityForUnknownRoomTwice_fetchesRoomOnceAndInsertsIt', async () => {
        let resolve: (v: { success: boolean; data: ChatRoomResponse }) => void = () => {};
        vi.mocked(chatRoomApi.getChatRoomById).mockReturnValue(
            new Promise(r => { resolve = r; }) as never);
        const event = { type: 'ROOM_ACTIVITY', payload: { roomId: 'new1', lastMessage: last('u1') }, occurredAt: '' };
        const first = useChatRoomsStore.getState().handleUserEvent(event);
        const second = useChatRoomsStore.getState().handleUserEvent(event);
        resolve({ success: true, data: room('new1') });
        await Promise.all([first, second]);
        expect(chatRoomApi.getChatRoomById).toHaveBeenCalledTimes(1);
        expect(ids()).toEqual(['new1']);
    });

    it('handleUserEvent_unknownTypeOrMalformedPayload_isIgnored', async () => {
        useChatRoomsStore.setState({ rooms: [room('r1')] });
        await useChatRoomsStore.getState().handleUserEvent({ type: 'SOMETHING_NEW', payload: {}, occurredAt: '' });
        await useChatRoomsStore.getState().handleUserEvent({ type: 'ROOM_ADDED', payload: null, occurredAt: '' });
        await useChatRoomsStore.getState().handleUserEvent('garbage');
        expect(ids()).toEqual(['r1']);
    });

    it('getUnreadTotal_manyRooms_sumsUnreadCounts', () => {
        useChatRoomsStore.getState().setRooms([room('a', { unreadCount: 2 }), room('b', { unreadCount: 3 }), room('c')]);
        expect(useChatRoomsStore.getState().getUnreadTotal()).toBe(5);
    });
});

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

describe('CM-096 unread reconciliation', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'me' } } as never);
        setVisibility('hidden');
        useChatRoomsStore.setState({ rooms: [], filteredRooms: [], activeRoomId: null, endedRooms: {} });
        vi.mocked(chatRoomApi.markRoomRead).mockResolvedValue(undefined);
    });
    afterEach(() => setVisibility('visible'));

    it('activity_duplicateMessage_doesNotIncrementUnreadTwice', () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a')]);
        store.applyActivity('a', last('u1'));
        store.applyActivity('a', last('u1'));
        expect(find('a')?.unreadCount).toBe(1);
    });

    it('activity_olderMessage_doesNotRegressSummary', async () => {
        const store = useChatRoomsStore.getState();
        const newest = { ...last('u1', '2026-03-01T00:00:00Z'), id: 'new' };
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValue({ success: true, data: [room('a', { lastMessage: newest, lastActivityAt: newest.createdAt, unreadCount: 2 })] } as never);
        store.setRooms([room('a')]);
        store.applyActivity('a', newest);
        store.applyActivity('a', last('u1'));
        expect(find('a')?.lastMessage?.id).toBe('new');
        await vi.waitFor(() => expect(chatRoomApi.getChatRooms).toHaveBeenCalled());
        await vi.waitFor(() => expect(find('a')?.unreadCount).toBe(2));
    });

    it('markRead_failedRequest_reconcilesServerCount', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a', { unreadCount: 4 })]);
        const read = deferred<void>();
        vi.mocked(chatRoomApi.markRoomRead).mockReturnValueOnce(read.promise);
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValue({ success: true, data: [room('a', { lastMessage: last('u1'), lastActivityAt: last('u1').createdAt, unreadCount: 5 })] } as never);
        const pending = store.markRoomRead('a');
        store.applyActivity('a', last('u1'));
        read.reject(new Error('offline'));
        await pending;
        await vi.waitFor(() => expect(find('a')?.unreadCount).toBe(5));
    });

    it('refetch_overlappingActivity_preservesUnread', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a')]);
        const snapshot = deferred<Awaited<ReturnType<typeof chatRoomApi.getChatRooms>>>();
        vi.mocked(chatRoomApi.getChatRooms).mockReturnValueOnce(snapshot.promise)
            .mockResolvedValue({ success: true, data: [room('a', { unreadCount: 1, lastMessage: last('u1'), lastActivityAt: last('u1').createdAt })] } as never);
        const pending = store.fetchRooms();
        store.applyActivity('a', last('u1'));
        snapshot.resolve({ success: true, data: [room('a')] } as never);
        await pending;
        expect(find('a')?.unreadCount).toBe(1);
        expect(find('a')?.lastMessage?.id).toBe('m1');
        expect(chatRoomApi.getChatRooms).toHaveBeenCalledTimes(2);
    });

    it('markRead_concurrentCalls_serializesAndCoalesces', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a', { unreadCount: 1 })]);
        const read = deferred<void>();
        vi.mocked(chatRoomApi.markRoomRead).mockReturnValueOnce(read.promise);
        const first = store.markRoomRead('a');
        const second = store.markRoomRead('a');
        expect(chatRoomApi.markRoomRead).toHaveBeenCalledTimes(1);
        read.resolve();
        await Promise.all([first, second]);
        expect(chatRoomApi.markRoomRead).toHaveBeenCalledTimes(1);
    });
});


describe('CM-096 session and retention boundaries', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'me' } } as never);
        setVisibility('hidden');
        useChatRoomsStore.setState({ rooms: [], filteredRooms: [], activeRoomId: null, endedRooms: {}, loading: false });
        vi.mocked(chatRoomApi.markRoomRead).mockResolvedValue(undefined);
    });
    afterEach(() => setVisibility('visible'));

    it('activity_evictedId_reconcilesWithoutIncrementingAgain', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a')]);
        const message = (n: number) => ({ ...last('u1', new Date(1800000000000 + n * 1000).toISOString()), id: `m${n}` });
        for (let n = 0; n < 520; n++) store.applyActivity('a', message(n));
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValue({ success: true, data: [room('a', { lastMessage: message(519), lastActivityAt: message(519).createdAt, unreadCount: 520 })] } as never);
        store.applyActivity('a', message(0));
        expect(find('a')?.unreadCount).toBe(520);
        await vi.waitFor(() => expect(chatRoomApi.getChatRooms).toHaveBeenCalledTimes(1));
        await store.fetchRooms();
        expect(find('a')?.unreadCount).toBe(520);
    });

    it('activity_accountChange_resetsLedgerAndRejectsPreviousSnapshot', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a')]);
        store.applyActivity('a', last('u1'));
        const old = deferred<Awaited<ReturnType<typeof chatRoomApi.getChatRooms>>>();
        vi.mocked(chatRoomApi.getChatRooms).mockReturnValueOnce(old.promise);
        const pending = store.fetchRooms();
        vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'second' } } as never);
        store.setRooms([room('a')]);
        store.applyActivity('a', last('u1'));
        old.resolve({ success: true, data: [room('private-old-account', { unreadCount: 99 })] } as never);
        await pending;
        expect(ids()).toEqual(['a']);
        expect(find('a')?.unreadCount).toBe(1);
    });

    it('markRead_newVisibleActivity_queuesOneTrailingRead', async () => {
        const store = useChatRoomsStore.getState();
        setVisibility('visible');
        store.setRooms([room('a', { unreadCount: 3 })]);
        store.setActiveRoom('a');
        const first = deferred<void>();
        const second = deferred<void>();
        vi.mocked(chatRoomApi.markRoomRead).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const pending = store.markRoomRead('a');
        store.applyActivity('a', last('u1'));
        store.applyActivity('a', { ...last('u1', '2026-03-01T00:00:00Z'), id: 'm2' });
        expect(chatRoomApi.markRoomRead).toHaveBeenCalledTimes(1);
        first.resolve();
        await vi.waitFor(() => expect(chatRoomApi.markRoomRead).toHaveBeenCalledTimes(2));
        second.resolve();
        await pending;
        expect(find('a')?.unreadCount).toBe(0);
    });

    it('markRead_failureThenReconnect_retriesVisibleRoom', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a', { unreadCount: 3 })]);
        setVisibility('visible');
        store.setActiveRoom('a');
        vi.mocked(chatRoomApi.markRoomRead).mockRejectedValueOnce(new Error('offline'));
        vi.mocked(chatRoomApi.getChatRooms).mockRejectedValueOnce(new Error('offline'));
        await store.markRoomRead('a');
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValue({ success: true, data: [room('a')] } as never);
        await store.fetchRooms();
        expect(chatRoomApi.markRoomRead).toHaveBeenCalledTimes(2);
        expect(find('a')?.unreadCount).toBe(0);
    });

    it('snapshot_roomUpdatedLate_preservesActivityAndUnreadUntilReconciled', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a')]);
        store.applyActivity('a', last('u1'));
        const server = deferred<Awaited<ReturnType<typeof chatRoomApi.getChatRooms>>>();
        vi.mocked(chatRoomApi.getChatRooms).mockReturnValueOnce(server.promise);
        store.upsertRoom(room('a', { roomName: 'Updated' }));
        expect(find('a')?.unreadCount).toBe(1);
        expect(find('a')?.lastMessage?.id).toBe('m1');
        server.resolve({ success: true, data: [room('a', { roomName: 'Updated', lastMessage: last('u1'), lastActivityAt: last('u1').createdAt, unreadCount: 1 })] } as never);
        await store.fetchRooms();
        expect(find('a')?.unreadCount).toBe(1);
    });

    it('snapshot_removedWhileFetching_doesNotResurrectRoom', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a'), room('b')]);
        const old = deferred<Awaited<ReturnType<typeof chatRoomApi.getChatRooms>>>();
        vi.mocked(chatRoomApi.getChatRooms).mockReturnValueOnce(old.promise)
            .mockResolvedValue({ success: true, data: [room('b')] } as never);
        const pending = store.fetchRooms();
        store.removeRoom('a', 'HIDDEN');
        old.resolve({ success: true, data: [room('a'), room('b')] } as never);
        await pending;
        expect(ids()).toEqual(['b']);
    });
});

it('snapshot_logoutDuringFetchAndSameAccountLogin_rejectsOldSession', async () => {
    vi.resetAllMocks();
    vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'me' } } as never);
    useChatRoomsStore.setState({ rooms: [], loading: false });
    const store = useChatRoomsStore.getState();
    store.setRooms([room('old')]);
    const old = deferred<Awaited<ReturnType<typeof chatRoomApi.getChatRooms>>>();
    vi.mocked(chatRoomApi.getChatRooms).mockReturnValueOnce(old.promise);
    const pending = store.fetchRooms();
    // Confirmed logout clears rooms while the old list request is still loading.
    vi.mocked(useAuthStore.getState).mockReturnValue({ user: null } as never);
    useChatRoomsStore.setState({ rooms: [], filteredRooms: [] });
    vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'me' } } as never);
    store.setRooms([room('new-session')]);
    old.resolve({ success: true, data: [room('old', { unreadCount: 8 })] } as never);
    await pending;
    expect(ids()).toEqual(['new-session']);
});


describe('CM-096 visibility and snapshot completion', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'me' } } as never);
        useChatRoomsStore.setState({ rooms: [], filteredRooms: [], activeRoomId: null, endedRooms: {}, loading: false });
        setVisibility('hidden');
        vi.mocked(chatRoomApi.markRoomRead).mockResolvedValue(undefined);
    });
    afterEach(() => setVisibility('visible'));

    it('markRead_tabHiddenDuringRequest_reconcilesWithoutTrailingRead', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a', { unreadCount: 3 })]);
        store.setActiveRoom('a');
        setVisibility('visible');
        const read = deferred<void>();
        vi.mocked(chatRoomApi.markRoomRead).mockReturnValueOnce(read.promise);
        const pending = store.markRoomRead('a');
        setVisibility('hidden');
        store.applyActivity('a', last('u1'));
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValue({ success: true, data: [room('a', { lastMessage: last('u1'), lastActivityAt: last('u1').createdAt, unreadCount: 1 })] } as never);
        read.resolve();
        await pending;
        expect(chatRoomApi.markRoomRead).toHaveBeenCalledTimes(1);
        expect(find('a')?.unreadCount).toBe(1);
    });

    it('snapshot_hiddenDmActivity_restoresServerUnreadWithoutDoubleIncrement', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a', { roomType: RoomType.DIRECT_MESSAGE })]);
        store.removeRoom('a', 'HIDDEN');
        vi.mocked(chatRoomApi.getChatRoomById).mockResolvedValue({ success: true, data: room('a', { roomType: RoomType.DIRECT_MESSAGE, lastMessage: last('u1'), lastActivityAt: last('u1').createdAt, unreadCount: 1 }) } as never);
        await store.handleUserEvent({ type: 'ROOM_ACTIVITY', payload: { roomId: 'a', lastMessage: last('u1') } });
        store.applyActivity('a', last('u1'));
        expect(find('a')?.unreadCount).toBe(1);
        expect(useChatRoomsStore.getState().endedRooms).toEqual({});
    });

    it('snapshot_continuousActivity_boundsRequestsAndExposesRetry', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a')]);
        let number = 0;
        vi.mocked(chatRoomApi.getChatRooms).mockImplementation(async () => {
            number++;
            store.applyActivity('a', { ...last('u1', new Date(1800000000000 + number * 1000).toISOString()), id: `burst${number}` });
            return { success: true, data: [room('a')] } as never;
        });
        await store.fetchRooms();
        expect(chatRoomApi.getChatRooms).toHaveBeenCalledTimes(3);
        expect(find('a')?.unreadCount).toBe(3);
        expect(useChatRoomsStore.getState().error).toContain('retry');
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValue({ success: true, data: [room('a', { unreadCount: 3 })] } as never);
        await store.fetchRooms();
        expect(useChatRoomsStore.getState().error).toBeNull();
    });

    it('snapshot_pendingRead_cannotReplaceNewUnreadWithStaleZero', async () => {
        const store = useChatRoomsStore.getState();
        store.setRooms([room('a', { unreadCount: 2 })]);
        const read = deferred<void>();
        vi.mocked(chatRoomApi.markRoomRead).mockReturnValueOnce(read.promise);
        const pending = store.markRoomRead('a');
        store.applyActivity('a', last('u1'));
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValue({ success: true, data: [room('a', { lastMessage: last('u1'), lastActivityAt: last('u1').createdAt })] } as never);
        await store.fetchRooms();
        expect(find('a')?.unreadCount).toBe(1);
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValue({ success: true, data: [room('a', { unreadCount: 1, lastMessage: last('u1'), lastActivityAt: last('u1').createdAt })] } as never);
        read.resolve();
        await pending;
        expect(find('a')?.unreadCount).toBe(1);
    });
});

it('upsertRoom_lateSnapshotAfterHide_doesNotResurrectRoom', () => {
    vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'me' } } as never);
    useChatRoomsStore.setState({ rooms: [], loading: false, endedRooms: {} });
    const store = useChatRoomsStore.getState();
    store.setRooms([room('hidden-dm', { roomType: RoomType.DIRECT_MESSAGE })]);
    store.removeRoom('hidden-dm', 'HIDDEN');
    store.upsertRoom(room('hidden-dm', { roomType: RoomType.DIRECT_MESSAGE, unreadCount: 4 }));
    expect(ids()).toEqual([]);
    expect(useChatRoomsStore.getState().endedRooms['hidden-dm']).toBe('HIDDEN');
});


it('fetchRooms_concurrentColdEntryCall_doesNotRestartReadDuringSnapshot', async () => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'me' } } as never);
    setVisibility('visible');
    useChatRoomsStore.setState({ rooms: [], filteredRooms: [], loading: false, error: null, endedRooms: {}, activeRoomId: 'cold' });
    const store = useChatRoomsStore.getState();
    const initialRead = deferred<void>();
    const first = deferred<Awaited<ReturnType<typeof chatRoomApi.getChatRooms>>>();
    const second = deferred<Awaited<ReturnType<typeof chatRoomApi.getChatRooms>>>();
    vi.mocked(chatRoomApi.markRoomRead).mockReturnValueOnce(initialRead.promise).mockResolvedValue(undefined);
    vi.mocked(chatRoomApi.getChatRooms).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
        .mockResolvedValue({ success: true, data: [room('cold')] } as never);
    // ChatRoomsList's mount marks the selected room, Dashboard starts the list fetch.
    const read = store.markRoomRead('cold');
    const dashboard = store.fetchRooms();
    initialRead.resolve();
    await read;
    first.resolve({ success: true, data: [room('cold')] } as never);
    await vi.waitFor(() => expect(chatRoomApi.getChatRooms).toHaveBeenCalledTimes(2));
    // StompProvider's first onConnected arrives while the retry is in flight.
    const connected = store.fetchRooms();
    second.resolve({ success: true, data: [room('cold')] } as never);
    await Promise.all([dashboard, connected]);
    expect(chatRoomApi.markRoomRead).toHaveBeenCalledTimes(1);
    expect(chatRoomApi.getChatRooms).toHaveBeenCalledTimes(2);
    expect(find('cold')).toBeDefined();
    expect(useChatRoomsStore.getState().error).toBeNull();
});
