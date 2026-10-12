import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatRoomsStore } from './chatRoomsStore';
import { chatRoomApi } from '../api/chatRoomApi';
import { RoomType, RoomSettings, ChatRoomResponse } from '@/lib/types';

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
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

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
            loading: false, error: null, activeRoomId: null,
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
