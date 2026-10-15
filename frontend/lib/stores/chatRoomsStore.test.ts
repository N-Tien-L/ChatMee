import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatRoomsStore } from './chatRoomsStore';
import { chatRoomApi } from '../api/chatRoomApi';
import { userApi } from '../api/userApi';
import toast from 'react-hot-toast';
import { RoomType, RoomSettings } from "@/lib/types";
import { ChatRoomResponse } from "@/lib/types";

// Mock dependencies
vi.mock('../api/chatRoomApi', () => ({
    chatRoomApi: {
        getChatRooms: vi.fn(),
        createChatRoom: vi.fn(),
        joinChatRoom: vi.fn(),
        leaveChatRoom: vi.fn(),
        deleteChatRoom: vi.fn(),
        hideRoom: vi.fn(),
    }
}));

vi.mock('../api/userApi', () => ({
    userApi: {
        getUserById: vi.fn(),
    }
}));

vi.mock('./authStore', () => ({
    useAuthStore: {
        getState: vi.fn(() => ({ user: { id: 'currentUser' } }))
    }
}));

vi.mock('react-hot-toast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    }
}));

const mockRoom: ChatRoomResponse = {
    id: 'r1',
    roomName: 'General',
    roomType: RoomType.PUBLIC,
    createdAt: '',
    createdBy: 'u1',
    maxUsers: 10,
    settings: {} as unknown as RoomSettings,
    participants: ['u1', 'u2']
};

describe('chatRoomsStore', () => {
    beforeEach(() => {
        // Reset state
        useChatRoomsStore.setState({
            rooms: [],
            filteredRooms: [],
            searchQuery: "",
            roomTypeFilter: "ALL",
            loading: false,
            error: null,
            usersCache: new Map(),
            isCreateRoomModalOpen: false,
        });
        vi.clearAllMocks();
    });

    it('setRooms, addRoom, updateRoom, deleteRoom modify state and apply filters', () => {
        const store = useChatRoomsStore.getState();
        
        // setRooms
        store.setRooms([mockRoom]);
        expect(useChatRoomsStore.getState().rooms).toHaveLength(1);
        expect(useChatRoomsStore.getState().filteredRooms).toHaveLength(1);
        
        // addRoom
        const room2: ChatRoomResponse = { ...mockRoom, id: 'r2', roomName: 'Random' };
        useChatRoomsStore.getState().addRoom(room2);
        expect(useChatRoomsStore.getState().rooms).toHaveLength(2);
        
        // updateRoom
        useChatRoomsStore.getState().updateRoom('r1', { roomName: 'General Updated' });
        expect(useChatRoomsStore.getState().rooms.find(r => r.id === 'r1')?.roomName).toBe('General Updated');
        
        // deleteRoom
        useChatRoomsStore.getState().deleteRoom('r1');
        expect(useChatRoomsStore.getState().rooms).toHaveLength(1);
        expect(useChatRoomsStore.getState().rooms[0].id).toBe('r2');
    });

    it('applyFilters applies search query and room type filter', () => {
        useChatRoomsStore.setState({
            rooms: [mockRoom, { ...mockRoom, id: 'r2', roomName: 'Test Room', roomType: RoomType.PRIVATE }]
        });
        
        useChatRoomsStore.getState().setRoomTypeFilter(RoomType.PUBLIC);
        expect(useChatRoomsStore.getState().filteredRooms).toHaveLength(1);
        expect(useChatRoomsStore.getState().filteredRooms[0].id).toBe('r1');
        
        useChatRoomsStore.getState().setRoomTypeFilter('ALL');
        useChatRoomsStore.getState().setSearchQuery('Test');
        expect(useChatRoomsStore.getState().filteredRooms).toHaveLength(1);
        expect(useChatRoomsStore.getState().filteredRooms[0].id).toBe('r2');
    });

    it('fetchRooms success sets rooms and loading flags', async () => {
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValueOnce({ success: true, data: [mockRoom] });
        
        const promise = useChatRoomsStore.getState().fetchRooms();
        expect(useChatRoomsStore.getState().loading).toBe(true);
        expect(useChatRoomsStore.getState().error).toBeNull();
        
        await promise;
        
        expect(useChatRoomsStore.getState().loading).toBe(false);
        expect(useChatRoomsStore.getState().rooms).toHaveLength(1);
        expect(useChatRoomsStore.getState().rooms[0]).toEqual(mockRoom);
    });

    it('fetchRooms failure sets an error state', async () => {
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValueOnce({ success: false, message: 'Server error', data: [] });
        
        await useChatRoomsStore.getState().fetchRooms();
        
        expect(useChatRoomsStore.getState().loading).toBe(false);
        expect(useChatRoomsStore.getState().error).toBeDefined();
        expect(useChatRoomsStore.getState().error).not.toBeNull();
    });

    it('joinRoom, leaveRoom, deleteRoomById, createRoom return true/false and update state as implemented', async () => {
        // createRoom success
        vi.mocked(chatRoomApi.createChatRoom).mockResolvedValueOnce({ success: true, data: mockRoom });
        let result: unknown = await useChatRoomsStore.getState().createRoom({ roomName: 'General', roomType: RoomType.PUBLIC, maxUsers: 10 });
        expect(result).toMatchObject({ id: mockRoom.id });
        expect(useChatRoomsStore.getState().rooms).toHaveLength(1);
        
        // createRoom failure
        vi.mocked(chatRoomApi.createChatRoom).mockResolvedValueOnce({ success: false, message: 'error', data: mockRoom });
        const failed = await useChatRoomsStore.getState().createRoom({ roomName: 'General', roomType: RoomType.PUBLIC, maxUsers: 10 });
        expect(failed).toBeNull();
        
        // joinRoom success
        vi.mocked(chatRoomApi.joinChatRoom).mockResolvedValueOnce(undefined);
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValueOnce({ success: true, data: [mockRoom] });
        result = await useChatRoomsStore.getState().joinRoom('r1');
        expect(result).toBe(true);
        expect(chatRoomApi.getChatRooms).toHaveBeenCalled();
        
        // leaveRoom success
        vi.mocked(chatRoomApi.leaveChatRoom).mockResolvedValueOnce({ success: true, data: 'left' });
        vi.mocked(chatRoomApi.getChatRooms).mockResolvedValueOnce({ success: true, data: [] });
        result = await useChatRoomsStore.getState().leaveRoom('r1');
        expect(result).toBe(true);
        
        // deleteRoomById success
        useChatRoomsStore.setState({ rooms: [mockRoom] });
        vi.mocked(chatRoomApi.deleteChatRoom).mockResolvedValueOnce({ success: true, data: 'deleted' });
        result = await useChatRoomsStore.getState().deleteRoomById('r1');
        expect(result).toBe(true);
        expect(useChatRoomsStore.getState().rooms).toHaveLength(0);
    });
    
    it('modal actions update isCreateRoomModalOpen', () => {
        useChatRoomsStore.getState().openCreateRoomModal();
        expect(useChatRoomsStore.getState().isCreateRoomModalOpen).toBe(true);
        
        useChatRoomsStore.getState().closeCreateRoomModal();
        expect(useChatRoomsStore.getState().isCreateRoomModalOpen).toBe(false);
    });

    it('names a direct message after the counterpart sent by the server without a user lookup', async () => {
        const dm: ChatRoomResponse = {
            ...mockRoom,
            id: 'dm1',
            roomName: '',
            roomType: RoomType.DIRECT_MESSAGE,
            participants: ['currentUser', 'u2'],
            counterpart: { id: 'u2', name: 'Bob', avatarUrl: '' },
        };

        const name = await useChatRoomsStore.getState().getDirectMessageDisplayName(dm);

        expect(name).toBe('Bob');
        expect(userApi.getUserById).not.toHaveBeenCalled();
    });

    it('startDirectMessage_existingDm_returnsItWithoutCreatingAnother', async () => {
        const dm = { ...mockRoom, id: 'dm1', roomType: RoomType.DIRECT_MESSAGE, counterpart: { id: 'u2', name: 'Bob', avatarUrl: '' } };
        useChatRoomsStore.getState().setRooms([dm]);

        const room = await useChatRoomsStore.getState().startDirectMessage('u2');

        expect(room?.id).toBe('dm1');
        expect(chatRoomApi.createChatRoom).not.toHaveBeenCalled();
        expect(useChatRoomsStore.getState().rooms).toHaveLength(1);
    });

    it('startDirectMessage_newPerson_createsDmRequestAndListsItOnce', async () => {
        const dm = { ...mockRoom, id: 'dm2', roomType: RoomType.DIRECT_MESSAGE, counterpart: { id: 'u3', name: 'Cid', avatarUrl: '' } };
        vi.mocked(chatRoomApi.createChatRoom).mockResolvedValueOnce({ success: true, data: dm });
        // The ROOM_ADDED event can list the room before the create response arrives.
        useChatRoomsStore.getState().setRooms([dm]);
        useChatRoomsStore.setState({ rooms: [] });

        const room = await useChatRoomsStore.getState().startDirectMessage('u3');

        expect(chatRoomApi.createChatRoom).toHaveBeenCalledWith({ roomType: RoomType.DIRECT_MESSAGE, participantId: 'u3', maxUsers: 2 });
        expect(room?.id).toBe('dm2');
        expect(useChatRoomsStore.getState().rooms.filter((r) => r.id === 'dm2')).toHaveLength(1);
    });

    it('hideRoom_directMessage_removesRowWithHiddenReason', async () => {
        const dm = { ...mockRoom, id: 'dm1', roomType: RoomType.DIRECT_MESSAGE };
        useChatRoomsStore.getState().setRooms([dm, mockRoom]);
        vi.mocked(chatRoomApi.hideRoom).mockResolvedValueOnce(undefined);

        expect(await useChatRoomsStore.getState().hideRoom('dm1')).toBe(true);

        expect(chatRoomApi.hideRoom).toHaveBeenCalledWith('dm1');
        expect(useChatRoomsStore.getState().rooms.map((r) => r.id)).toEqual(['r1']);
        expect(useChatRoomsStore.getState().endedRooms.dm1).toBe('HIDDEN');
    });

    it('hideRoom_serverRejects_keepsRow', async () => {
        useChatRoomsStore.getState().setRooms([{ ...mockRoom, id: 'dm1', roomType: RoomType.DIRECT_MESSAGE }]);
        vi.mocked(chatRoomApi.hideRoom).mockRejectedValueOnce(new Error('Forbidden'));

        expect(await useChatRoomsStore.getState().hideRoom('dm1')).toBe(false);
        expect(useChatRoomsStore.getState().rooms).toHaveLength(1);
    });

    it('setCounterpartBlocked_dmWithUser_flagsOnlyThatDm', () => {
        const dm = { ...mockRoom, id: 'dm1', roomType: RoomType.DIRECT_MESSAGE, counterpart: { id: 'u2', name: 'Bob', avatarUrl: '' } };
        useChatRoomsStore.getState().setRooms([dm, mockRoom]);

        useChatRoomsStore.getState().setCounterpartBlocked('u2', true);

        const rooms = useChatRoomsStore.getState().rooms;
        expect(rooms.find((r) => r.id === 'dm1')?.blocked).toBe(true);
        expect(rooms.find((r) => r.id === 'r1')?.blocked).toBeUndefined();
    });

    it('createRoom_declineCooldownOrBlock_toastsTheServerReason', async () => {
        vi.mocked(chatRoomApi.createChatRoom).mockRejectedValueOnce(new Error('Cannot message this user'));
        const created = await useChatRoomsStore.getState().createRoom({ roomType: RoomType.DIRECT_MESSAGE, participantId: 'u2', maxUsers: 2 });
        expect(created).toBeNull();
        expect(toast.error).toHaveBeenCalledWith('Cannot message this user');
    });

    it.each([
        ['REQUESTED', true],
        ['ACTIVE', false],
    ] as const)('createRoom_directMessageReturned%s_requestToastOnlyWhenPending', async (state, toasted) => {
        const dm: ChatRoomResponse = {
            ...mockRoom, id: 'dm1', roomName: '', roomType: RoomType.DIRECT_MESSAGE, state,
            participants: ['currentUser', 'u2'], counterpart: { id: 'u2', name: 'Bob', avatarUrl: '' },
        };
        vi.mocked(chatRoomApi.createChatRoom).mockResolvedValueOnce({ success: true, data: dm });
        expect(await useChatRoomsStore.getState().createRoom({ roomType: RoomType.DIRECT_MESSAGE, participantId: 'u2', maxUsers: 2 })).not.toBeNull();
        if (toasted) expect(toast.success).toHaveBeenCalledWith('Message request sent');
        else expect(toast.success).not.toHaveBeenCalled();
    });
});
