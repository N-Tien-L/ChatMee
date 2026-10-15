import { create } from "zustand";
import { chatRoomApi } from "../api/chatRoomApi";
import { userApi } from "../api/userApi";
import {
    RoomType,
} from "@/lib/types";
import { ChatRoom, LastMessageSummary, UserSummaryResponse } from "@/lib/types";
import { useAuthStore } from "./authStore";
import toast from "react-hot-toast";
import Fuse from "fuse.js";
import { CreateChatRoomRequest } from "@/lib/types";

interface chatRoomState {
    rooms: ChatRoom[];
    filteredRooms: ChatRoom[];
    searchQuery: string;
    /** "ROOMS" = public and private group rooms (no direct messages). */
    roomTypeFilter: RoomType | "ALL" | "ROOMS";
    loading: boolean;
    error: string | null;
    usersCache: Map<string, UserSummaryResponse>;
    isCreateRoomModalOpen: boolean;
    /** Which create flow is open: a group room, or a direct message to one person (D-14). */
    createRoomModalMode: "room" | "direct";
    /** The room open in the conversation pane, or null. Drives the unread rules. */
    activeRoomId: string | null;

    setActiveRoom: (roomId: string | null) => void;
    upsertRoom: (room: ChatRoom) => void;
    removeRoom: (roomId: string) => void;
    applyActivity: (roomId: string, lastMessage: LastMessageSummary) => void;
    markRoomRead: (roomId: string) => Promise<void>;
    handleUserEvent: (event: unknown) => Promise<void>;
    getUnreadTotal: () => number;
    setRooms: (rooms: ChatRoom[]) => void;
    addRoom: (room: ChatRoom) => void;
    updateRoom: (id: string, updates: Partial<ChatRoom>) => void;
    deleteRoom: (id: string) => void;
    setSearchQuery: (query: string) => void;
    setRoomTypeFilter: (filter: RoomType | "ALL" | "ROOMS") => void;
    fetchRooms: () => Promise<void>;
    joinRoom: (roomId: string) => Promise<boolean>;
    leaveRoom: (roomId: string) => Promise<boolean>;
    deleteRoomById: (roomId: string) => Promise<boolean>;
    applyFilters: () => void;
    /** Resolves to the created room, or null when creation failed. */
    createRoom: (request: CreateChatRoomRequest) => Promise<ChatRoom | null>;
    getDirectMessageDisplayName: (room: ChatRoom) => Promise<string>;
    openCreateRoomModal: (mode?: "room" | "direct") => void;
    closeCreateRoomModal: () => void;
}

const activityTime = (room: ChatRoom): number => {
    const time = Date.parse(room.lastActivityAt || room.createdAt || "");
    return Number.isNaN(time) ? 0 : time;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const isRoom = (value: unknown): value is ChatRoom =>
    isRecord(value) && typeof value.id === "string";

const isLastMessage = (value: unknown): value is LastMessageSummary =>
    isRecord(value) && typeof value.senderId === "string" && typeof value.createdAt === "string";

/** Room ids whose GET /rooms/{id} is in flight, so an event burst fetches each unknown room once. */
const fetchingRooms = new Set<string>();

const withDisplayName = (room: ChatRoom): ChatRoom =>
    room.roomType === RoomType.DIRECT_MESSAGE && room.counterpart?.name
        ? { ...room, displayName: room.counterpart.name }
        : room;

const tabIsVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

export const useChatRoomsStore = create<chatRoomState>((set, get) => ({
    // Initial state
    rooms: [],
    filteredRooms: [],
    searchQuery: "",
    roomTypeFilter: "ALL",
    loading: false,
    error: null,
    usersCache: new Map(),
    isCreateRoomModalOpen: false,
    createRoomModalMode: "room",
    activeRoomId: null,

    // Actions
    setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

    upsertRoom: (room) => {
        const next = withDisplayName(room);
        set((state) => ({
            rooms: state.rooms.some((r) => r.id === next.id)
                ? state.rooms.map((r) => (r.id === next.id ? { ...r, ...next } : r))
                : [...state.rooms, next],
        }));
        get().applyFilters();
    },

    removeRoom: (roomId) => {
        set((state) => ({
            rooms: state.rooms.filter((room) => room.id !== roomId),
            activeRoomId: state.activeRoomId === roomId ? null : state.activeRoomId,
        }));
        get().applyFilters();
    },

    markRoomRead: async (roomId) => {
        const room = get().rooms.find((r) => r.id === roomId);
        if (room && room.unreadCount) get().updateRoom(roomId, { unreadCount: 0 });
        try {
            await chatRoomApi.markRoomRead(roomId);
        } catch {
            // The marker is retried by the next open or refetch; the list keeps working.
        }
    },

    applyActivity: (roomId, lastMessage) => {
        const currentUserId = useAuthStore.getState().user?.id;
        const isOpenAndVisible = get().activeRoomId === roomId && tabIsVisible();
        const fromMe = lastMessage.senderId === currentUserId;
        set((state) => ({
            rooms: state.rooms.map((room) =>
                room.id === roomId
                    ? {
                          ...room,
                          lastMessage,
                          lastActivityAt: lastMessage.createdAt,
                          unreadCount: fromMe || isOpenAndVisible ? room.unreadCount ?? 0 : (room.unreadCount ?? 0) + 1,
                      }
                    : room
            ),
        }));
        get().applyFilters();
        if (isOpenAndVisible && !fromMe) void get().markRoomRead(roomId);
    },

    handleUserEvent: async (event) => {
        if (!isRecord(event) || typeof event.type !== "string" || !isRecord(event.payload)) return;
        const payload = event.payload;
        const fetchUnknown = async (roomId: string) => {
            if (fetchingRooms.has(roomId)) return;
            fetchingRooms.add(roomId);
            try {
                const response = await chatRoomApi.getChatRoomById(roomId);
                if (response.success) get().upsertRoom(response.data);
            } catch {
                // The next reconnect refetch recovers the room.
            } finally {
                fetchingRooms.delete(roomId);
            }
        };
        switch (event.type) {
            case "ROOM_ADDED":
            case "ROOM_UPDATED":
                if (isRoom(payload.room)) get().upsertRoom(payload.room);
                break;
            case "ROOM_REMOVED":
                if (typeof payload.roomId === "string") get().removeRoom(payload.roomId);
                break;
            case "ROOM_ACTIVITY": {
                const roomId = payload.roomId;
                if (typeof roomId !== "string" || !isLastMessage(payload.lastMessage)) break;
                if (get().rooms.some((r) => r.id === roomId)) {
                    get().applyActivity(roomId, payload.lastMessage);
                } else {
                    await fetchUnknown(roomId);
                }
                break;
            }
            default:
                break;
        }
    },

    getUnreadTotal: () => get().rooms.reduce((sum, room) => sum + (room.unreadCount ?? 0), 0),
    setRooms: (rooms) => {
        set({ rooms });
        get().applyFilters();
    },

    addRoom: (room) => {
        // The ROOM_ADDED event can beat the create response, so the room may already be listed.
        set((state) => ({
            rooms: state.rooms.some((r) => r.id === room.id)
                ? state.rooms.map((r) => (r.id === room.id ? { ...r, ...room } : r))
                : [...state.rooms, room],
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
                    response.data.map(async (room: ChatRoom) => {
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
                // For Direct Message rooms, compute the display name before adding
                const room =
                    response.data.roomType === RoomType.DIRECT_MESSAGE
                        ? { ...response.data, displayName: await get().getDirectMessageDisplayName(response.data) }
                        : response.data;
                get().addRoom(room);
                toast.success(
                    response.data.roomType === RoomType.DIRECT_MESSAGE ? "Message request sent" : "Room created successfully!"
                );
                return room;
            } else {
                toast.error(response.message || "Failed to create room");
                return null;
            }
        } catch {
            toast.error("Failed to create room");
            return null;
        }
    },

    joinRoom: async (roomId: string) => {
        try {
            await chatRoomApi.joinChatRoom(roomId);
            toast.success("Successfully joined the room!");
            await get().fetchRooms(); // Refresh rooms
            return true;
        } catch (error) {
            console.error("Failed to join room:", error);
            toast.error("Failed to join room");
            return false;
        }
    },

    leaveRoom: async (roomId: string) => {
        try {
            const response = await chatRoomApi.leaveChatRoom(roomId);
            if (response.success) {
                toast.success("Successfully left the room!");
                await get().fetchRooms(); // Refresh rooms
                return true;
            } else {
                toast.error(response.message || "Failed to leave room");
                return false;
            }
        } catch (error) {
            console.error("Failed to leave room:", error);
            toast.error("Failed to leave room");
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
        // Newest activity first; Array.sort is stable, so equal times keep their order.
        let filtered = [...rooms].sort((a, b) => activityTime(b) - activityTime(a));

        // Apply room type filter
        if (roomTypeFilter === "ROOMS") {
            filtered = filtered.filter((room) => room.roomType !== RoomType.DIRECT_MESSAGE);
        } else if (roomTypeFilter !== "ALL") {
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
        room: ChatRoom
    ): Promise<string> => {
        const currentUser = useAuthStore.getState().user;

        if (
            room.roomType !== RoomType.DIRECT_MESSAGE ||
            !room.participants ||
            !currentUser
        ) {
            return room.roomName || "Unknown Room";
        }

        // The server sends the other member with the room (CM-049); older payloads fall back to a lookup.
        if (room.counterpart?.name) {
            return room.counterpart.name;
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

    // Actions on create room modal
    openCreateRoomModal: (mode = "room") => set({ isCreateRoomModalOpen: true, createRoomModalMode: mode }),
    closeCreateRoomModal: () => set({ isCreateRoomModalOpen: false }),
}));
