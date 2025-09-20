import { create } from 'zustand'
import { userApi } from '../api/userApi'
import { UserResponse } from "../type/ResponseType";
import toast from 'react-hot-toast'

interface UsersState {
    users: UserResponse[],
    usersCache: Map<string, UserResponse>
    loading: boolean

    setUsers: (users: UserResponse[]) => void
    addUserToCache: (user: UserResponse) => void
    getUserFromCache: (id: string) => UserResponse | null
    fetchUsers: () => Promise<void>
    fetchUserById: (id: string) => Promise<UserResponse | null>
}

export const useUsersStore = create<UsersState>((set, get) => ({
    // Initial state
    users: [],
    usersCache: new Map(),
    loading: false,

    // Actions
    setUsers: (users) => {
        set({ users })
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

    fetchUsers: async () => {
        try {
            set({ loading: true })
            const response = await userApi.getAllUsers()

            if (response.success) {
                get().setUsers(response.data)
            } else {
                console.error('Failed to fetch users:', response.message)
                toast.error('Failed to fetch users')
            }
        } catch (error) {
            console.error('Failed to fetch users:', error)
            toast.error('Failed to fetch users')
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
}))