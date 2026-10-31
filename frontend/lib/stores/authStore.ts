import axios from 'axios'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../api/authApi'
import { UserResponse } from "@/lib/types";
import toast from 'react-hot-toast'
import { resetRoomMessageCache } from '@/hooks/useRoomMessage'
import { useChatRoomsStore } from './chatRoomsStore'
import { useChatStore } from './chatStore'
import { useDiscoverRoomsStore } from './discoverRoomsStore'
import { resetUserRequests } from './usersStore'
import { resetInboxState } from './inboxStore'
import { useDraftStore } from './draftStore'

interface AuthState {
    user: UserResponse | null
    /** True only after GET /auth/me answered 200 in this page load; never restored from storage. */
    isAuthenticated: boolean
    loading: boolean
    /** True when the last session check could not reach the backend (network error or 5xx from the proxy). */
    unreachable: boolean

    login: (provider?: string) => void
    /** Resolves true when the server ended the session; false (state untouched) when it did not. */
    logout: () => Promise<boolean>
    checkAuthStatus: (showToast?: boolean) => Promise<void>
    setLoading: (loading: boolean) => void
}

/** No answer, or a 5xx from the /api rewrite (backend down or waking up), is not the same as "no session". */
function isServerUnreachable(error: unknown): boolean {
    const cause = error instanceof Error ? error.cause : undefined
    if (!axios.isAxiosError(cause)) return false
    return !cause.response || cause.response.status >= 500
}

/** Drops everything the previous account could still see. */
function clearSessionCaches() {
    resetRoomMessageCache()
    useChatRoomsStore.setState({
        rooms: [], filteredRooms: [], searchQuery: "", roomTypeFilter: "ALL",
        error: null, usersCache: new Map(), isCreateRoomModalOpen: false,
    })
    useChatStore.setState({ onlineUsers: new Set(), typingUsers: {}, presenceLoaded: false })
    resetUserRequests()
    resetInboxState()
    useDraftStore.getState().clearAll()
    useDiscoverRoomsStore.setState({ isOpen: false, query: "", results: [], page: 0, hasMore: false, error: null, joinError: null })
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            // Initial state
            user: null,
            isAuthenticated: false,
            loading: false,
            unreachable: false,

            // Actions
            login: (provider = "google") => {
                authApi.login(provider)
            },

            logout: async () => {
                try {
                    await authApi.logout()
                } catch {
                    toast.error('Could not sign out. Please try again.', { id: 'logout-error' })
                    return false
                }
                set({ user: null, isAuthenticated: false })
                clearSessionCaches()
                authApi.redirectToLogin()
                return true
            },

            checkAuthStatus: async (showToast = false) => {
                try {
                    set({ loading: true })
                    const response = await authApi.getCurrentUser()

                    if (response.success && response.data.authenticated) {
                        set({
                            unreachable: false,
                            isAuthenticated: true,
                            user: response.data.user || null
                        })
                        // A different account must not see (or keep) another account's drafts (SPEC-013 AC-013-7).
                        if (response.data.user) useDraftStore.getState().hydrate(response.data.user.id)

                        if (showToast && response.data.user) {
                            toast.success(`Welcome, ${response.data.user.name}!`, {
                                id: 'login-success',
                            })
                        }
                    } else {
                        set({ isAuthenticated: false, user: null, unreachable: false })
                    }
                } catch (error) {
                    // Both mean "not signed in"; only an unreachable server is reported as such (CM-084 G1).
                    set({ isAuthenticated: false, user: null, unreachable: isServerUnreachable(error) })
                } finally {
                    set({ loading: false })
                }
            },

            setLoading: (loading: boolean) => {
                set({ loading })
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ user: state.user }),
            // Ignore a legacy stored isAuthenticated: only GET /auth/me may set it.
            merge: (persisted, current) => ({
                ...current,
                user: (persisted as { user?: UserResponse | null } | undefined)?.user ?? null,
            }),
        }
    )
)
