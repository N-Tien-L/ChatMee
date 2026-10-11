import { create } from "zustand";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { chatRoomApi } from "../api/chatRoomApi";
import { PublicRoomSummary } from "@/lib/types";
import { useChatRoomsStore } from "./chatRoomsStore";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

interface DiscoverRoomsState {
    isOpen: boolean;
    query: string;
    results: PublicRoomSummary[];
    page: number;
    hasMore: boolean;
    loading: boolean;
    loadingMore: boolean;
    /** Last load failure, shown inline with a retry action. */
    error: string | null;
    /** Last join failure (for example a full room), shown inline. */
    joinError: string | null;
    joiningId: string | null;

    open: () => void;
    close: () => void;
    setQuery: (query: string) => void;
    search: (query?: string) => Promise<void>;
    loadMore: () => Promise<void>;
    join: (roomId: string) => Promise<boolean>;
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function clearPendingSearch() {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
    }
}

function joinErrorMessage(error: unknown): string {
    const cause = error instanceof Error ? error.cause : undefined;
    if (isAxiosError<{ code?: string }>(cause) && cause.response?.data?.code === "ROOM_FULL") {
        return "This room is full.";
    }
    return error instanceof Error && error.message ? error.message : "Failed to join room";
}

export const useDiscoverRoomsStore = create<DiscoverRoomsState>((set, get) => ({
    isOpen: false,
    query: "",
    results: [],
    page: 0,
    hasMore: false,
    loading: false,
    loadingMore: false,
    error: null,
    joinError: null,
    joiningId: null,

    open: () => {
        set({ isOpen: true, query: "", results: [], page: 0, hasMore: false, error: null, joinError: null });
        void get().search("");
    },

    close: () => {
        clearPendingSearch();
        set({ isOpen: false });
    },

    setQuery: (query) => {
        set({ query });
        clearPendingSearch();
        searchTimeout = setTimeout(() => {
            searchTimeout = null;
            void get().search(query);
        }, SEARCH_DEBOUNCE_MS);
    },

    search: async (query = get().query) => {
        try {
            set({ loading: true, error: null, joinError: null });
            const response = await chatRoomApi.discoverRooms(query, 0, PAGE_SIZE);
            // Ignore responses for queries the user has already typed past.
            if (query !== get().query) return;
            if (response.success) {
                const { content, page, totalPages } = response.data;
                set({ results: content, page, hasMore: page + 1 < totalPages, loading: false });
            } else {
                set({ error: response.message || "Failed to load rooms", loading: false });
            }
        } catch {
            if (query === get().query) set({ error: "Failed to load rooms", loading: false });
        }
    },

    loadMore: async () => {
        const { query, page, hasMore, loadingMore, loading } = get();
        if (!hasMore || loadingMore || loading) return;
        try {
            set({ loadingMore: true, error: null });
            const response = await chatRoomApi.discoverRooms(query, page + 1, PAGE_SIZE);
            if (query !== get().query) {
                set({ loadingMore: false });
                return;
            }
            if (response.success) {
                const { content, totalPages } = response.data;
                set((state) => {
                    const known = new Set(state.results.map((room) => room.id));
                    return {
                        results: [...state.results, ...content.filter((room) => !known.has(room.id))],
                        page: page + 1,
                        hasMore: page + 2 < totalPages,
                        loadingMore: false,
                    };
                });
            } else {
                set({ error: response.message || "Failed to load rooms", loadingMore: false });
            }
        } catch {
            if (query === get().query) set({ error: "Failed to load rooms", loadingMore: false });
        }
    },

    join: async (roomId) => {
        if (get().joiningId) return false;
        set({ joiningId: roomId, joinError: null });
        try {
            await chatRoomApi.joinChatRoom(roomId);
            set((state) => ({ results: state.results.filter((room) => room.id !== roomId), joiningId: null }));
            toast.success("Successfully joined the room!");
            await useChatRoomsStore.getState().fetchRooms();
            return true;
        } catch (error) {
            set({ joinError: joinErrorMessage(error), joiningId: null });
            return false;
        }
    },
}));
