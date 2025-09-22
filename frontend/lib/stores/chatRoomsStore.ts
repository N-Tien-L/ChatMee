import { create } from "zustand";
import { chatRoomApi } from "../api/chatRoomApi";
import { userApi } from "../api/userApi";
import {
    CreateChatRoomRequest,
    RoomType,
    UpdateChatRoomRequest,
} from "../type/ChatTypes";
import { ChatRoomResponse, UserResponse } from "../type/ResponseType";
import { useAuthStore } from "./authStore";
import toast from "react-hot-toast";
import Fuse from "fuse.js";

interface chatRoomState {
    rooms: ChatRoomResponse[];
    filteredRooms: ChatRoomResponse[];
    searchQuery: string;
    roomTypeFilter: RoomType | "ALL";
    loading: boolean;
    error: string | null;
    usersCache: Map<string, UserResponse>;

    setRooms: (rooms: ChatRoomResponse[]) => void;
    addRoom: (room: ChatRoomResponse) => void;
    updateRoom: (id: string, updates: Partial<ChatRoomResponse>) => void;
    deleteRoom: (id: string) => void;
    setSearchQuery: (query: string) => void;
    setRoomTypeFilter: (filter: RoomType | "ALL") => void;
    fetchRooms: () => Promise<void>;
    joinRoom: (roomId: string) => Promise<boolean>;
    deleteRoomById: (roomId: string) => Promise<boolean>;
    applyFilters: () => void;
    createRoom: (request: CreateChatRoomRequest) => Promise<boolean>;
    getDirectMessageDisplayName: (room: ChatRoomResponse) => Promise<string>;
}

export const useChatRoomsStore = create<chatRoomState>((set, get) => ({
    // Initial state
    rooms: [],
    filteredRooms: [],
    searchQuery: "",
    roomTypeFilter: "ALL",
    loading: false,
    error: null,
    usersCache: new Map(),

    // Actions
    setRooms: (rooms) => {
        set({ rooms });
        get().applyFilters();
    },

    addRoom: (room) => {
        set((state) => ({
            rooms: [...state.rooms, room],
        }));
        get().applyFilters();
    },

    updateRoom: (id, updates) => {
        set((state) => ({
            rooms: state.rooms.map((room) =>
                room.id === id ? { ...room, ...updates } : room
            ),
        }));
        get().applyFilters();
    },

    deleteRoom: (id) => {
        set((state) => ({
            rooms: state.rooms.filter((room) => room.id !== id),
        }));
        get().applyFilters();
    },

    setSearchQuery: (query) => {
        set({ searchQuery: query });
        get().applyFilters();
    },

    setRoomTypeFilter: (filter) => {
        set({ roomTypeFilter: filter });
        get().applyFilters();
    },

    fetchRooms: async () => {
        try {
            set({ loading: true, error: null });
            const response = await chatRoomApi.getChatRooms();

            if (response.success) {
                const roomsWithDisplayNames = await Promise.all(
                    response.data.map(async (room: ChatRoomResponse) => {
                        if (room.roomType === RoomType.DIRECT_MESSAGE) {
                            const displayName = await get().getDirectMessageDisplayName(room);
                            return { ...room, displayName };
                        }
                        return room;
                    })
                );
                get().setRooms(roomsWithDisplayNames);
            } else {
                set({ error: "Failed to fetch chat rooms" });
            }
        } catch (error) {
            console.error("Failed to fetch chat rooms:", error);
            set({ error: "Failed to fetch chat rooms" });
        } finally {
            set({ loading: false });
        }
    },

    createRoom: async (request: CreateChatRoomRequest) => {
        try {
            const response = await chatRoomApi.createChatRoom(request);
            if (response.success) {
                get().addRoom(response.data);
                toast.success("Room created successfully!");
                return true;
            } else {
                toast.error(response.message || "Failed to create room");
                return false;
            }
        } catch (error) {
            toast.error("Failed to create room");
            return false;
        }
    },

    joinRoom: async (roomId: string) => {
        try {
            const response = await chatRoomApi.joinChatRoom(roomId);
            if (response.success) {
                toast.success("Successfully joined the room!");
                await get().fetchRooms(); // Refresh rooms
                return true;
            } else {
                toast.error(response.message || "Failed to join room");
                return false;
            }
        } catch (error) {
            console.error("Failed to join room:", error);
            toast.error("Failed to join room");
            return false;
        }
    },

    deleteRoomById: async (roomId: string) => {
        try {
            const response = await chatRoomApi.deleteChatRoom(roomId);
            if (response.success) {
                get().deleteRoom(roomId);
                toast.success("Room deleted successfully!");
                return true;
            } else {
                toast.error(response.message || "Failed to delete room");
                return false;
            }
        } catch (error) {
            console.error("Failed to delete room:", error);
            toast.error("Failed to delete room");
            return false;
        }
    },

    applyFilters: () => {
        const { rooms, searchQuery, roomTypeFilter } = get();
        let filtered = [...rooms];

        // Apply room type filter
        if (roomTypeFilter !== "ALL") {
            filtered = filtered.filter((room) => room.roomType === roomTypeFilter);
        }

        // Apply search filter
        if (searchQuery.trim()) {
            const fuse = new Fuse(filtered, {
                keys: ["roomName", "displayName", "description"],
                threshold: 0.3,
            });
            const searchResults = fuse.search(searchQuery);
            filtered = searchResults.map((result) => result.item);
        }

        set({ filteredRooms: filtered });
    },

    // Helper method for direct message display names
    getDirectMessageDisplayName: async (
        room: ChatRoomResponse
    ): Promise<string> => {
        const currentUser = useAuthStore.getState().user;

        if (
            room.roomType !== RoomType.DIRECT_MESSAGE ||
            !room.participants ||
            !currentUser
        ) {
            return room.roomName || "Unknown Room";
        }

        // Find the other participant
        const otherParticipantId = room.participants.find(
            (id) => id !== currentUser.id
        );

        if (!otherParticipantId) {
            return "Direct Message";
        }

        // Check cache first
        const { usersCache } = get();
        if (usersCache.has(otherParticipantId)) {
            return usersCache.get(otherParticipantId)!.name;
        }

        try {
            // Fetch user info if not in cache
            const response = await userApi.getUserById(otherParticipantId);
            if (response.success) {
                // Update cache
                const newCache = new Map(usersCache);
                newCache.set(otherParticipantId, response.data);
                set({ usersCache: newCache });
                return response.data.name;
            }
        } catch (error) {
            console.error("Failed to fetch user for DM display name:", error);
        }

        return "Direct Message";
    },
}));
