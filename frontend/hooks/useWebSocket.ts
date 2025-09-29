import { useCallback, useEffect, useRef, useState } from "react"
import { Client } from '@stomp/stompjs'
import { useAuthStore } from "@/lib/stores"
import SockJS from "sockjs-client"

export interface WebSocketState {
    connected: boolean
    connecting: boolean
    error: string | null
}

export const useWebSocket = () => {
    // state management
    const [state, setState] = useState<WebSocketState>({
        connected: false,
        connecting: false,
        error: null
    })

    // Refs for STOMP client and subscriptions
    const clientRef = useRef<Client | null>(null)
    const subscriptionsRef = useRef<Map<string, any>>(new Map())

    // Get auth state
    const { isAuthenticated, user } = useAuthStore()

    const connect = useCallback(() => {
        if (!isAuthenticated || clientRef.current?.connected) return

        setState(prev => ({ ...prev, connecting: true, error: null }))

        const client = new Client({
            webSocketFactory: () => new SockJS(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080/ws'),
            connectHeaders: {},
            debug: (str) => console.log('STOMP debug:', str),
            onConnect: () => {
                setState(prev => ({ ...prev, connected: true, connecting: false }))
                console.log("Websocket connected")
            },
            onStompError: (frame) => {
                setState(prev => ({
                    ...prev,
                    connected: false,
                    connecting: false,
                    error: frame.headers['message']
                }))
                console.log("STOMP error:", frame)
            },
            onWebSocketClose: () => {
                setState(prev => ({ ...prev, connected: false, connecting: false }))
                console.log("Websocket connection closed")
            }
        })

        clientRef.current = client
        client.activate()
    }, [isAuthenticated])

    const disconnect = useCallback(() => {
        if (clientRef.current) {
            subscriptionsRef.current.forEach((subscription) => {
                subscription.unsubscribe()
            })
            subscriptionsRef.current.clear()

            clientRef.current.deactivate()
            clientRef.current = null
            setState({ connected: false, connecting: false, error: null })
        }
    }, [])

    useEffect(() => {
        if (isAuthenticated) {
            connect()
        } else {
            disconnect()
        }
    }, [isAuthenticated, connect, disconnect])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect()
        }
    }, [disconnect])
}

