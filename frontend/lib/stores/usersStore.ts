import { create } from 'zustand'
import { userApi } from '../api/userApi'
import { BlockedUserResponse, UserSummaryResponse } from "@/lib/types";
import toast from 'react-hot-toast'
import { useChatRoomsStore } from './chatRoomsStore'

interface UsersState {
    users: UserSummaryResponse[],
    usersCache: Map<string, UserSummaryResponse>
    loading: boolean
    /** Last search failure, shown inline with a retry action. */
    error: string | null
    searchQuery: string;
    filteredUsers: UserSummaryResponse[];

    setUsers: (users: UserSummaryResponse[]) => void
    addUserToCache: (user: UserSummaryResponse) => void
    getUserFromCache: (id: string) => UserSummaryResponse | null
    fetchUsers: (query?: string) => Promise<void>
    fetchUserById: (id: string) => Promise<UserSummaryResponse | null>
    setSearchQuery: (query: string) => void;

    /** The caller's blocks (AC-009-15); null until loaded. */
    blockedUsers: BlockedUserResponse[] | null
    blocksError: string | null
    fetchBlocks: () => Promise<void>
    /** Block a user; their DM turns read-only and they leave search results (AC-009-16/17/19). */
    blockUser: (user: UserSummaryResponse) => Promise<boolean>
    unblockUser: (user: Pick<UserSummaryResponse, 'id' | 'name'>) => Promise<boolean>
}

const failure = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback

let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let userEpoch = 0;
let searchRequest = 0;
let blocksRequest = 0;
export function resetUserRequests(): void {
    userEpoch++; searchRequest++; blocksRequest++;
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = null;
    useUsersStore.setState({ users: [], filteredUsers: [], usersCache: new Map(), searchQuery: "",
        loading: false, error: null, blockedUsers: null, blocksError: null });
}

export const useUsersStore = create<UsersState>((set, get) => ({
    // Initial state
    users: [],
    usersCache: new Map(),
    loading: false,
    error: null,
    searchQuery: "",
    filteredUsers: [],
    blockedUsers: null,
    blocksError: null,

    // Actions
    setUsers: (users) => {
        set({ users, filteredUsers: users })
        // Also update cache with these users
        const currentCache = get().usersCache
        const newCache = new Map(currentCache)
        users.forEach(user => {
            newCache.set(user.id, user)
        })
        set({ usersCache: newCache })
    },

    addUserToCache: (user) => {
        set((state) => {
            const newCache = new Map(state.usersCache)
            newCache.set(user.id, user)
            return { usersCache: newCache }
        })
    },

    getUserFromCache: (id) => {
        const { usersCache } = get()
        return usersCache.get(id) || null
    },

    fetchUsers: async (query = "") => {
        const epoch = userEpoch, request = ++searchRequest;
        const current = () => epoch === userEpoch && request === searchRequest;
        try {
            set({ loading: true, error: null })
            const response = await userApi.searchUsers(query, 0, 50)
            if (!current()) return;
            // Ignore responses for queries the user has already typed past.
            if (query !== get().searchQuery) return

            if (response.success) {
                get().setUsers(response.data.content)
            } else {
                console.error('Failed to fetch users:', response.message)
                set({ error: response.message || 'Failed to fetch users' })
            }
        } catch (error) {
            if (!current()) return;
            console.error('Failed to fetch users:', error)
            if (query === get().searchQuery) set({ error: 'Failed to fetch users' })
        } finally {
            if (current()) set({ loading: false })
        }
    },

    fetchUserById: async (id) => {
        const epoch = userEpoch;
        try {
            // Check cache first
            const cached = get().getUserFromCache(id)
            if (cached) {
                return cached
            }

            // Fetch from API if not in cache
            const response = await userApi.getUserById(id)
            if (epoch !== userEpoch) return null;
            if (response.success) {
                // Add to cache
                get().addUserToCache(response.data)
                return response.data
            } else {
                console.error('Failed to fetch user by ID:', response.message)
                return null
            }
        } catch (error) {
            if (epoch !== userEpoch) return null;
            console.error('Failed to fetch user by ID:', error)
            return null
        }
    },

    fetchBlocks: async () => {
        const epoch = userEpoch, request = ++blocksRequest;
        const current = () => epoch === userEpoch && request === blocksRequest;
        try {
            set({ blocksError: null })
            const response = await userApi.listBlocks()
            if (!current()) return;
            if (response.success && Array.isArray(response.data)) set({ blockedUsers: response.data })
            else set({ blocksError: response.message || 'Could not load blocked people' })
        } catch (error) {
            if (!current()) return;
            set({ blocksError: failure(error, 'Could not load blocked people') })
        }
    },

    blockUser: async (user) => {
        const epoch = userEpoch;
        try {
            await userApi.blockUser(user.id)
            if (epoch !== userEpoch) return false;
        } catch (error) {
            if (epoch !== userEpoch) return false;
            toast.error(failure(error, `Could not block ${user.name}`))
            return false
        }
        set((state) => ({
            blockedUsers: state.blockedUsers && !state.blockedUsers.some((b) => b.id === user.id)
                ? [{ id: user.id, name: user.name, avatarUrl: user.avatarUrl, blockedAt: new Date().toISOString() }, ...state.blockedUsers]
                : state.blockedUsers,
            // Search excludes blocked users (AC-009-17); drop them now instead of waiting for the next query.
            users: state.users.filter((u) => u.id !== user.id),
            filteredUsers: state.filteredUsers.filter((u) => u.id !== user.id),
        }))
        useChatRoomsStore.getState().setCounterpartBlocked(user.id, true)
        toast.success(`You blocked ${user.name}`)
        return true
    },

    unblockUser: async (user) => {
        const epoch = userEpoch;
        try {
            await userApi.unblockUser(user.id)
            if (epoch !== userEpoch) return false;
        } catch (error) {
            if (epoch !== userEpoch) return false;
            toast.error(failure(error, `Could not unblock ${user.name}`))
            return false
        }
        set((state) => ({ blockedUsers: state.blockedUsers?.filter((b) => b.id !== user.id) ?? null }))
        useChatRoomsStore.getState().setCounterpartBlocked(user.id, false)
        toast.success(`You unblocked ${user.name}`)
        return true
    },

    setSearchQuery: (query) => {
        set({ searchQuery: query });
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        searchTimeout = setTimeout(() => {
            get().fetchUsers(query);
        }, 300);
    },
}))