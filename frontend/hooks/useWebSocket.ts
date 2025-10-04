import { useCallback, useEffect, useRef, useState } from "react"
import { Client } from '@stomp/stompjs'
import { useAuthStore } from "@/lib/stores"
import SockJS from "sockjs-client"
import { ChatMessageResponse } from "@/lib/type/ResponseType"

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

    const subscribeToRoom = useCallback((roomId: string, onMessage: (message: ChatMessageResponse) => void) => {
        if (!clientRef.current?.connected) return

        const destination = `/topic/public/${roomId}`

        const subscription = clientRef.current.subscribe(destination, (message) => {
            try {
                const chatMessage = JSON.parse(message.body)
                chatMessage.isOwn = chatMessage.senderId === user?.id
                onMessage(chatMessage)
            } catch (error) {
                console.error("Error parsing message:", error)
            }
        })

        subscriptionsRef.current.set(roomId, subscription)
        console.log(`Subscribed to room: ${roomId}`)
    }, [user?.id])

    const unsubscribeFromRoom = useCallback((roomId: string) => {
        const subscription = subscriptionsRef.current.get(roomId)
        if (subscription) {
            subscription.unsubscribe()
            subscriptionsRef.current.delete(roomId)
            console.log(`Unsubscribed from room: ${roomId}`)
        }
    }, [])

    const sendMessage = useCallback((roomId: string, content: string, tempId?: string) => {
        if (!clientRef.current?.connected || !user) return

        const message = {
            roomId,
            content,
            messageType: 'TEXT',
            senderName: user.name,
            tempId: tempId // Include tempId for optimistic updates
        }

        clientRef.current.publish({
            destination: `/app/chat.sendMessage`,
            body: JSON.stringify(message)
        })
    }, [user])

    const joinRoom = useCallback((roomId: string) => {
        if (!clientRef.current?.connected || !user) return

        const message = {
            roomId,
            content: '',
            messageType: 'SYSTEM',
            senderName: user.name,
            tempId: `join-${Date.now()}` // Add tempId for join messages too
        }

        clientRef.current.publish({
            destination: `/app/chat.addUser`,
            body: JSON.stringify(message)
        })
    }, [user])

    return {
        ...state,

        connect,
        disconnect,
        subscribeToRoom,
        unsubscribeFromRoom,
        sendMessage,
        joinRoom
    }
}

