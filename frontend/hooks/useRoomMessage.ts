import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "./useWebSocket";
import { messageApi } from "@/lib/api/messageApi";
import { ChatMessageResponse } from "@/lib/type/ResponseType";
import { useAuthStore } from "@/lib/stores/authStore";

// Extended message type with status for optimistic updates
export interface MessageWithStatus extends ChatMessageResponse {
    status?: 'sending' | 'sent' | 'failed';
    isOptimistic?: boolean;
    clientTempId?: string; // Client-side temp ID for matching
}

const sessionCache = new Map<string, {
    messages: ChatMessageResponse[];
    hasMoreMessages: boolean;
    lastLoaded: number;
}>();

export const useRoomMessages = (roomId: string) => {
    const [messages, setMessages] = useState<MessageWithStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    const { user } = useAuthStore();

    // Helper function to add isOwn property to messages
    const addIsOwnToMessages = useCallback((msgs: ChatMessageResponse[]): MessageWithStatus[] => {
        return msgs.map(msg => ({
            ...msg,
            isOwn: user?.id === msg.senderId,
            status: 'sent' as const
        }));
    }, [user?.id]);

    const {
        connected,
        connecting,
        error: wsError,
        subscribeToRoom,
        unsubscribeFromRoom,
        sendMessage: sendWebSocketMessage,
        joinRoom
    } = useWebSocket();

    // load messages
    useEffect(() => {
        const loadMessages = async () => {
            if (!roomId) return;

            // check in cache
            const cached = sessionCache.get(roomId);
            if (cached) {
                const messagesWithIsOwn = addIsOwnToMessages(cached.messages);
                setMessages(messagesWithIsOwn);
                setHasMoreMessages(cached.hasMoreMessages);
                return;
            }

            console.log(`Loading ${roomId} from API`)
            try {
                setLoading(true)
                setError(null)

                const initialMessagesResponse = await messageApi.get50RecentMessages(roomId);
                console.log('API response:', initialMessagesResponse); // Debug log

                // Check if the API call was successful
                if (!initialMessagesResponse.success) {
                    console.error('API call failed:', initialMessagesResponse.message);
                    setError(initialMessagesResponse.message || 'Failed to load messages');
                    return;
                }

                const initialMessages = initialMessagesResponse.data || [];

                // Ensure initialMessages is an array
                if (!Array.isArray(initialMessages)) {
                    console.error('Expected array but got:', typeof initialMessages, initialMessages);
                    setMessages([]);
                    setHasMoreMessages(false);
                    return;
                }

                // Deduplicate messages by ID (in case backend returns duplicates)
                const uniqueMessages = initialMessages.filter((message, index, array) =>
                    array.findIndex(m => m.id === message.id) === index
                );

                // Reverse messages to show chronologically (oldest first)
                // Backend returns newest first, but chat should display oldest first
                const chronologicalMessages = uniqueMessages.reverse();

                console.log(`Loaded ${chronologicalMessages.length} unique messages for room ${roomId}`);

                const messagesWithIsOwn = addIsOwnToMessages(chronologicalMessages);
                setMessages(messagesWithIsOwn);
                setHasMoreMessages(chronologicalMessages.length === 50);

                // Cache for instant future access (store original messages without isOwn)
                sessionCache.set(roomId, {
                    messages: chronologicalMessages,
                    hasMoreMessages: chronologicalMessages.length === 50,
                    lastLoaded: Date.now(),
                });

            } catch (err: any) {
                const errorMessage = err?.response?.data?.message || err?.message || 'Failed to load messages';
                setError(errorMessage);
                console.error('Failed to load messages:', err);

                // Set empty messages array on error
                setMessages([]);
                setHasMoreMessages(false);
            } finally {
                setLoading(false);
            }
        };

        loadMessages();
    }, [roomId, addIsOwnToMessages]);

    // WebSocket subscription for real-time messages
    useEffect(() => {
        if (!roomId || !connected) return;

        const handleNewMessage = (message: ChatMessageResponse) => {
            console.log('Received WebSocket message:', message.id, message.content);

            setMessages(prev => {
                // 1. Find an optimistic message to replace using tempId
                let optimisticIndex = prev.findIndex(
                    m => m.isOptimistic && m.clientTempId && m.clientTempId === message.tempId
                );

                // 2. Avoid duplicates: if the message is already in list (not optimistic), skip
                const existingMessage = prev.find(m => m.id === message.id);
                if (existingMessage && !existingMessage.isOptimistic) {
                    console.log('Duplicate message detected, skipping:', message.id);
                    return prev;
                }

                // 3. Prepare the final message object
                const messageWithStatus: MessageWithStatus = {
                    ...message,
                    isOwn: user?.id === message.senderId,
                    status: 'sent',
                    isOptimistic: false
                };

                let newMessages: MessageWithStatus[];

                if (optimisticIndex !== -1) {
                    // 4a. Replace optimistic message with the real one
                    newMessages = [...prev];
                    newMessages[optimisticIndex] = messageWithStatus;
                    console.log('Replaced optimistic message with real message:', message.id);
                } else {
                    // 4b. No optimistic message found → just add it
                    newMessages = [...prev, messageWithStatus];
                    console.log('Added new incoming message:', message.id);
                }

                // 5. Update session cache (store original server message without isOwn/status)
                const cached = sessionCache.get(roomId);
                if (cached) {
                    const cacheHasDuplicate = cached.messages.some(m => m.id === message.id);
                    if (!cacheHasDuplicate) {
                        sessionCache.set(roomId, {
                            ...cached,
                            messages: [...cached.messages, message], // store server version
                        });
                    }
                }

                return newMessages;
            });
        };

        subscribeToRoom(roomId, handleNewMessage);

        return () => {
            unsubscribeFromRoom(roomId);
        };
    }, [roomId, connected, subscribeToRoom, unsubscribeFromRoom, user?.id]);

    // Join room effect - only runs when user first accesses a room
    useEffect(() => {
        if (!roomId || !connected) return;

        // Check if user has already joined this room in this session
        const cached = sessionCache.get(roomId);
        if (!cached) {
            // Only join if this is the first time accessing this room
            joinRoom(roomId);
        }
    }, [roomId, connected, joinRoom]);

    // Create optimistic message
    const createOptimisticMessage = useCallback((content: string) => {
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const optimisticMessage: MessageWithStatus = {
            id: `optimistic-${tempId}`, // Temporary client-side ID
            tempId: tempId, // This will be sent to backend
            clientTempId: tempId, // Store for matching
            chatRoomId: roomId,
            senderId: user?.id || '',
            senderName: user?.name || 'You',
            content: content.trim(),
            type: 'TEXT',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isUpdated: false,
            isDeleted: false,
            isOwn: true,
            status: 'sending',
            isOptimistic: true
        };
        return { message: optimisticMessage, tempId };
    }, [roomId, user?.id, user?.name]);

    // Send message function with optimistic updates
    const sendMessage = useCallback(async (content: string) => {
        if (!connected || !content.trim()) return;

        const trimmedContent = content.trim();
        setSending(true);

        // 1. Create optimistic message with tempId
        const { message: optimisticMessage, tempId } = createOptimisticMessage(trimmedContent);
        setMessages(prev => [...prev, optimisticMessage]);

        try {
            // 2. Send via WebSocket with tempId
            // We need to update sendWebSocketMessage to accept tempId
            sendWebSocketMessage(roomId, trimmedContent, tempId);

            // Note: The real message will come back via WebSocket subscription
            // and we'll replace the optimistic one in handleNewMessage

        } catch (error) {
            // 3. Mark as failed if send fails
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === optimisticMessage.id
                        ? { ...msg, status: 'failed' as const }
                        : msg
                )
            );
            console.error('Failed to send message:', error);
        } finally {
            setSending(false);
        }
    }, [connected, roomId, sendWebSocketMessage, createOptimisticMessage]);

    return {
        messages,
        loading,
        loadingMore,
        hasMoreMessages,
        error,
        connected,
        connecting,
        wsError,
        sending,
        sendMessage,
        // loadMoreMessages - will add later
    };
}