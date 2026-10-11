import { create } from 'zustand'
import { userApi } from '../api/userApi'
import { UserSummaryResponse } from "@/lib/types";

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
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

export const useUsersStore = create<UsersState>((set, get) => ({
    // Initial state
    users: [],
    usersCache: new Map(),
    loading: false,
    error: null,
    searchQuery: "",
    filteredUsers: [],

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
        try {
            set({ loading: true, error: null })
            const response = await userApi.searchUsers(query, 0, 50)
            // Ignore responses for queries the user has already typed past.
            if (query !== get().searchQuery) return

            if (response.success) {
                get().setUsers(response.data.content)
            } else {
                console.error('Failed to fetch users:', response.message)
                set({ error: response.message || 'Failed to fetch users' })
            }
        } catch (error) {
            console.error('Failed to fetch users:', error)
            if (query === get().searchQuery) set({ error: 'Failed to fetch users' })
        } finally {
            set({ loading: false })
        }
    },

    fetchUserById: async (id) => {
        try {
            // Check cache first
            const cached = get().getUserFromCache(id)
            if (cached) {
                return cached
            }

            // Fetch from API if not in cache
            const response = await userApi.getUserById(id)
            if (response.success) {
                // Add to cache
                get().addUserToCache(response.data)
                return response.data
            } else {
                console.error('Failed to fetch user by ID:', response.message)
                return null
            }
        } catch (error) {
            console.error('Failed to fetch user by ID:', error)
            return null
        }
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