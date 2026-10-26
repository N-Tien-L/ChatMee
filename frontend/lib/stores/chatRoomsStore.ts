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

/** `ROOM_REMOVED` reasons (docs/design/websocket-protocol.md, "User events"). */
export type RoomEndReason = "LEFT" | "REMOVED" | "DELETED" | "HIDDEN" | "DECLINED" | "EXPIRED";

const END_REASONS: readonly RoomEndReason[] = ["LEFT", "REMOVED", "DELETED", "HIDDEN", "DECLINED", "EXPIRED"];

const isEndReason = (value: unknown): value is RoomEndReason =>
    typeof value === "string" && (END_REASONS as readonly string[]).includes(value);

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
    /**
     * Why a room left the list, by room id, from the `ROOM_REMOVED` user event. The open conversation reads it to show the
     * right ended state without waiting for a room-topic frame. Cleared when the room comes back.
     */
    endedRooms: Record<string, RoomEndReason>;

    setActiveRoom: (roomId: string | null) => void;
    upsertRoom: (room: ChatRoom) => void;
    removeRoom: (roomId: string, reason?: RoomEndReason) => void;
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
    /** The DM with this user: the listed one if it exists (never a duplicate), otherwise a new DM request (AC-008-8). */
    startDirectMessage: (userId: string) => Promise<ChatRoom | null>;
    /** Hide a DM for the caller only (AC-009-21); the row leaves the list and the open view says so. */
    hideRoom: (roomId: string) => Promise<boolean>;
    /** Mirror a block or unblock on the caller's DM with that user (`blocked`, AC-009-19); no event comes for it. */
    setCounterpartBlocked: (userId: string, blocked: boolean) => void;
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
// A session-wide bound, independent of room/message history size.
const ACTIVITY_LIMIT = 512;
const appliedActivity = new Set<string>();
const reads = new Map<string, { promise: Promise<void>; head?: string; again: boolean }>();
const failedReads = new Set<string>();
let account: string | undefined;
let epoch = 0;
let revision = 0;
let snapshot: Promise<void> | undefined;
let publishingSnapshot = false;

function resetReconciliation() {
    epoch++;
    revision++;
    appliedActivity.clear();
    reads.clear();
    failedReads.clear();
    fetchingRooms.clear();
    snapshot = undefined;
}
function currentAccount() {
    const id = useAuthStore.getState().user?.id;
    if (id !== account) {
        resetReconciliation();
        account = id;
    }
    return epoch;
}
const isCurrent = (generation: number) => currentAccount() === generation;

async function fetchSnapshot(retryReads: boolean): Promise<void> {
    const generation = currentAccount();
    if (retryReads) {
        const state = useChatRoomsStore.getState();
        const id = state.activeRoomId;
        if (id && tabIsVisible()) void state.markRoomRead(id);
    }
    if (snapshot) return snapshot;
    const work = (async () => {
        useChatRoomsStore.setState({ loading: true, error: null });
        try {
            // Bound work under continuous traffic. A later event/connect/open can retry;
            // never publish a known stale snapshot just because the bound was reached.
            for (let attempt = 0; attempt < 3; attempt++) {
                const started = revision;
                const response = await chatRoomApi.getChatRooms();
                if (!isCurrent(generation)) return;
                if (!response.success) throw new Error('Room snapshot unavailable');
                const rooms = await Promise.all(response.data.map(async room => ({
                    ...room,
                    ...(room.roomType === RoomType.DIRECT_MESSAGE
                        ? { displayName: await useChatRoomsStore.getState().getDirectMessageDisplayName(room) } : {}),
                })));
                if (!isCurrent(generation)) return;
                if (started !== revision) continue;
                const state = useChatRoomsStore.getState();
                // Pending read-at-now has no server completion yet. Preserve its optimistic
                // count until completion/failure triggers an authoritative refresh.
                publishingSnapshot = true;
                try {
                    state.setRooms(rooms.map(room => {
                        const existing = state.rooms.find(r => r.id === room.id);
                        return {
                            ...room,
                            ...(existing && activityTime(existing) > activityTime(room)
                                ? { lastMessage: existing.lastMessage, lastActivityAt: existing.lastActivityAt } : {}),
                            ...(reads.has(room.id) ? { unreadCount: existing?.unreadCount ?? room.unreadCount } : {}),
                        };
                    }));
                } finally {
                    publishingSnapshot = false;
                }
                return;
            }
            if (isCurrent(generation)) useChatRoomsStore.setState({ error: 'Room activity changed during refresh. Please retry.' });
        } catch {
            if (isCurrent(generation)) useChatRoomsStore.setState({ error: 'Failed to fetch chat rooms' });
        } finally {
            if (isCurrent(generation)) useChatRoomsStore.setState({ loading: false });
        }
    })();
    snapshot = work;
    try { await work; } finally { if (snapshot === work) snapshot = undefined; }
}

const withDisplayName = (room: ChatRoom): ChatRoom =>
    room.roomType === RoomType.DIRECT_MESSAGE && room.counterpart?.name
        ? { ...room, displayName: room.counterpart.name }
        : room;

/** Drops ended reasons for rooms that are listed again; returns the same object when nothing changes. */
const withoutEnded = (ended: Record<string, RoomEndReason>, ids: string[]): Record<string, RoomEndReason> => {
    if (!ids.some((id) => id in ended)) return ended;
    const next = { ...ended };
    for (const id of ids) delete next[id];
    return next;
};

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
    endedRooms: {},

    // Actions
    setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

    upsertRoom: (room) => {
        revision++;
        const existing = get().rooms.find(r => r.id === room.id);
        const stale = existing && (activityTime(existing) > activityTime(room) ||
            (existing.lastMessage?.id !== room.lastMessage?.id && activityTime(existing) === activityTime(room)));
        const pendingRead = reads.has(room.id);
        const next = withDisplayName(stale ? { ...room, lastMessage: existing.lastMessage,
            lastActivityAt: existing.lastActivityAt, unreadCount: existing.unreadCount }
            : pendingRead ? { ...room, unreadCount: existing?.unreadCount ?? room.unreadCount } : room);
        // Event/one-room snapshots have no request watermark. Preserve unread for
        // existing rows and obtain a guarded list snapshot before changing counts.
        if (existing) next.unreadCount = existing.unreadCount;
        if (existing && (stale || existing.unreadCount !== room.unreadCount)) void fetchSnapshot(false);
        set((state) => ({
            rooms: state.rooms.some((r) => r.id === next.id)
                ? state.rooms.map((r) => (r.id === next.id ? { ...r, ...next } : r))
                : [...state.rooms, next],
            endedRooms: withoutEnded(state.endedRooms, [next.id]),
        }));
        get().applyFilters();
    },

    removeRoom: (roomId, reason) => {
        currentAccount();
        revision++;
        reads.delete(roomId);
        failedReads.delete(roomId);
        set((state) => ({
            rooms: state.rooms.filter((room) => room.id !== roomId),
            activeRoomId: state.activeRoomId === roomId ? null : state.activeRoomId,
            endedRooms: reason ? { ...state.endedRooms, [roomId]: reason } : state.endedRooms,
        }));
        get().applyFilters();
    },

    markRoomRead: (roomId) => {
        const generation = currentAccount();
        const room = get().rooms.find(r => r.id === roomId);
        const pending = reads.get(roomId);
        if (pending) {
            pending.again ||= pending.head !== room?.lastMessage?.id;
            return pending.promise;
        }
        revision++;
        failedReads.delete(roomId);
        if (room?.unreadCount) get().updateRoom(roomId, { unreadCount: 0 });
        const entry = { promise: Promise.resolve(), head: room?.lastMessage?.id, again: false };
        const work = (async () => {
            try {
                await chatRoomApi.markRoomRead(roomId);
                if (!isCurrent(generation) || reads.get(roomId) !== entry) return;
                revision++;
                reads.delete(roomId);
                if (entry.again && get().activeRoomId === roomId && tabIsVisible()) {
                    await get().markRoomRead(roomId);
                } else if (entry.head !== get().rooms.find(r => r.id === roomId)?.lastMessage?.id) {
                    await fetchSnapshot(false);
                }
            } catch {
                if (!isCurrent(generation) || reads.get(roomId) !== entry) return;
                revision++;
                reads.delete(roomId);
                failedReads.add(roomId);
                await fetchSnapshot(false);
            }
        })();
        entry.promise = work;
        reads.set(roomId, entry);
        return work;
    },

    applyActivity: (roomId, lastMessage) => {
        currentAccount();
        const room = get().rooms.find(r => r.id === roomId);
        if (!room) return;
        const key = JSON.stringify([roomId, lastMessage.id]);
        if (lastMessage.id && (appliedActivity.has(key) || room.lastMessage?.id === lastMessage.id)) return;
        // Unknown older/tied deliveries may be duplicates outside the bounded ledger.
        // Only the server can determine their unread contribution.
        if (!lastMessage.id || !Number.isFinite(Date.parse(lastMessage.createdAt)) ||
            (room.lastMessage && Date.parse(lastMessage.createdAt) <= activityTime(room))) {
            revision++;
            if (get().activeRoomId === roomId && tabIsVisible() &&
                lastMessage.senderId !== useAuthStore.getState().user?.id) void get().markRoomRead(roomId);
            void fetchSnapshot(false);
            return;
        }
        appliedActivity.add(key);
        if (appliedActivity.size > ACTIVITY_LIMIT) appliedActivity.delete(appliedActivity.values().next().value!);
        revision++;
        const fromMe = lastMessage.senderId === useAuthStore.getState().user?.id;
        const visible = get().activeRoomId === roomId && tabIsVisible();
        get().updateRoom(roomId, {
            lastMessage, lastActivityAt: lastMessage.createdAt,
            unreadCount: fromMe || visible ? room.unreadCount ?? 0 : (room.unreadCount ?? 0) + 1,
        });
        if (visible && !fromMe) void get().markRoomRead(roomId);
    },

    handleUserEvent: async (event) => {
        if (!isRecord(event) || typeof event.type !== "string" || !isRecord(event.payload)) return;
        const generation = currentAccount();
        const payload = event.payload;
        const fetchUnknown = async (roomId: string) => {
            if (fetchingRooms.has(roomId)) return;
            fetchingRooms.add(roomId);
            const ended = get().endedRooms[roomId];
            const started = revision;
            try {
                const response = await chatRoomApi.getChatRoomById(roomId);
                if (isCurrent(generation) && get().endedRooms[roomId] === ended && response.success) {
                    const changed = started !== revision;
                    get().upsertRoom(response.data);
                    if (changed) await fetchSnapshot(false);
                }
            } catch {
                // The next reconnect refetch recovers the room.
            } finally {
                if (isCurrent(generation)) fetchingRooms.delete(roomId);
            }
        };
        switch (event.type) {
            case "ROOM_ADDED":
            case "ROOM_UPDATED":
                if (isRoom(payload.room)) get().upsertRoom(payload.room);
                break;
            case "ROOM_REMOVED": {
                const roomId = payload.roomId;
                if (typeof roomId !== "string") break;
                const reason = isEndReason(payload.reason) ? payload.reason : undefined;
                // DM request outcomes for the sender (SPEC-009 AC-009-12/13): tell them even when the DM is not open.
                if (reason === "DECLINED" || reason === "EXPIRED") {
                    const name = get().rooms.find((r) => r.id === roomId)?.displayName;
                    const to = name ? ` to ${name}` : "";
                    toast(reason === "DECLINED" ? `Your message request${to} was declined` : `Your message request${to} expired`, {
                        id: `dm-request-${roomId}`,
                    });
                }
                get().removeRoom(roomId, reason);
                break;
            }
            case "ROOM_ACTIVITY": {
                const roomId = payload.roomId;
                if (typeof roomId !== "string" || !isLastMessage(payload.lastMessage)) break;
                if (get().rooms.some((r) => r.id === roomId)) {
                    get().applyActivity(roomId, payload.lastMessage);
                } else {
                    revision++;
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
        currentAccount();
        const listed = new Set(rooms.map(room => room.id));
        for (const id of failedReads) if (!listed.has(id)) failedReads.delete(id);
        for (const id of reads.keys()) if (!listed.has(id)) reads.delete(id);
        set((state) => ({ rooms, endedRooms: withoutEnded(state.endedRooms, rooms.map((room) => room.id)) }));
        get().applyFilters();
    },

    addRoom: (room) => {
        get().upsertRoom(room);
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

    fetchRooms: () => fetchSnapshot(true),

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
                // A DM that comes back ACTIVE already existed or accepted their pending request (AC-009-9): no request toast.
                if (response.data.roomType !== RoomType.DIRECT_MESSAGE) toast.success("Room created successfully!");
                else if (response.data.state === "REQUESTED") toast.success("Message request sent");
                return room;
            } else {
                toast.error(response.message || "Failed to create room");
                return null;
            }
        } catch (error) {
            // Keep the server's reason, e.g. "Cannot message this user" (block or decline cooldown) or a daily limit.
            toast.error(error instanceof Error && error.message ? error.message : "Failed to create room");
            return null;
        }
    },

    startDirectMessage: async (userId: string) => {
        const isDmWith = (room: ChatRoom) =>
            room.roomType === RoomType.DIRECT_MESSAGE && room.counterpart?.id === userId;
        const existing = get().rooms.find(isDmWith);
        if (existing) return existing;
        const created = await get().createRoom({ roomType: RoomType.DIRECT_MESSAGE, participantId: userId, maxUsers: 2 });
        if (!created) return null;
        // The server returns the existing DM when there is one; the list keeps a single row per id either way.
        return get().rooms.find((room) => room.id === created.id) ?? created;
    },

    hideRoom: async (roomId: string) => {
        try {
            await chatRoomApi.hideRoom(roomId);
            get().removeRoom(roomId, "HIDDEN");
            toast.success("Conversation hidden. It comes back with the next message.");
            return true;
        } catch (error) {
            toast.error(error instanceof Error && error.message ? error.message : "Could not hide the conversation");
            return false;
        }
    },

    setCounterpartBlocked: (userId, blocked) => {
        set((state) => ({
            rooms: state.rooms.map((room) =>
                room.roomType === RoomType.DIRECT_MESSAGE && room.counterpart?.id === userId ? { ...room, blocked } : room
            ),
        }));
        get().applyFilters();
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

// Logout/cache clearing also invalidates A -> B -> A requests, even before the next event.
useChatRoomsStore.subscribe((state, previous) => {
    if (state.rooms !== previous.rooms && state.rooms.length === 0 && !publishingSnapshot) {
        resetReconciliation();
        useChatRoomsStore.setState({ loading: false });
    }
});
