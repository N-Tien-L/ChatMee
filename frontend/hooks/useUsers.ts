import { authApi } from "@/lib/api/authApi"
import { userApi } from "@/lib/api/userApi"
import { UserResponse } from "@/lib/type/ResponseType"
import { useEffect, useState } from "react"

export const useUsers = () => {
    const [user, setUser] = useState<UserResponse[] | []>([])
    const [loading, setLoading] = useState(false)

    const fetchUsers = async () => {
        try {
            setLoading(true)
            const response = await userApi.getAllUsers()
            if (response.success) {
                setUser(response.data)
            }
        } catch (error) {
            console.error("Failed to fetch users: ", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchUsers()
    }, [])

    return {
        user,
        loading,
        fetchUsers
    }
}