import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../api/authApi'
import { UserResponse } from "../type/ResponseType";
import toast from 'react-hot-toast'

interface AuthState {
    user: UserResponse | null
    isAuthenticated: boolean
    loading: boolean

    login: (provider?: string) => void
    logout: () => void
    checkAuthStatus: (showToast?: boolean) => Promise<void>
    setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            // Initial state
            user: null,
            isAuthenticated: false,
            loading: false,

            // Actions
            login: (provider = "google") => {
                authApi.login(provider)
            },

            logout: () => {
                authApi.logout()
                set({
                    user: null,
                    isAuthenticated: false
                })
                toast.success('Logged out successfully')
            },

            checkAuthStatus: async (showToast = false) => {
                try {
                    set({ loading: true })
                    const response = await authApi.getCurrentUser()

                    if (response.success && response.data.authenticated) {
                        set({
                            isAuthenticated: true,
                            user: response.data.user || null
                        })

                        if (showToast && response.data.user) {
                            toast.success(`Welcome back, ${response.data.user.name}!`, {
                                id: 'login-success',
                            })
                        }
                    } else {
                        set({
                            isAuthenticated: false,
                            user: null
                        })
                    }
                } catch (error) {
                    console.error("Auth check failed: ", error)
                    set({
                        isAuthenticated: false,
                        user: null
                    })
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
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated
            }),
        }
    )
)