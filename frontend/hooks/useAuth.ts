import { authApi } from "@/lib/api/authApi"
import { UserResponse } from "@/lib/type/ResponseType"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"

export const useAuth = () => {
    const [user, setUser] = useState<UserResponse | null>(null)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        checkAuthStatus();
    }, [])

    const checkAuthStatus = async (showSuccessToast = false) => {
        try {
            setLoading(true)
            const response = await authApi.getCurrentUser()

            if (response.success && response.data.authenticated) {
                setIsAuthenticated(true)
                setUser(response.data.user || null)
                
                if (showSuccessToast) {
                    toast.success(`Welcome back, ${response.data.user?.name || 'User'}!`, {
                        id: 'login-success',
                    });
                }
            } else {
                setIsAuthenticated(false)
                setUser(null)
            }
        } catch (error) {
            console.error("Auth check failed: ", error)
            setIsAuthenticated(false)
            setUser(null)
        } finally {
            setLoading(false)
        }
    }

    const login = (provider = "google") => {
        authApi.login(provider)
    }

    const logout = () => {
        authApi.logout()
    }

    return {
        user,
        isAuthenticated,
        loading,
        checkAuthStatus,
        login,
        logout
    }
}