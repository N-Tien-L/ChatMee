import { create } from 'zustand';

export interface PresenceMessage {
    userId: string;
    online: boolean;
}

export interface TypingMessage {
    roomId: string;
    userId: string;
    typing: boolean;
}

interface ChatState {
    onlineUsers: Set<string>;
    typingUsers: Record<string, Set<string>>; // roomId -> Set<userId>
    setOnlineUsers: (users: string[]) => void;
    updatePresence: (presenceUpdate: PresenceMessage) => void;
    updateTyping: (typingUpdate: TypingMessage) => void;
}

export const useChatStore = create<ChatState>((set) => ({
    onlineUsers: new Set(),
    typingUsers: {},
    setOnlineUsers: (users) => {
        console.log('Setting online users to:', users);
        set({ onlineUsers: new Set(users) });
    },
    updatePresence: ({ userId, online }) => set((state) => {
        console.log(`Updating presence for user ${userId}: ${online ? 'online' : 'offline'}`);
        const newOnlineUsers = new Set(state.onlineUsers);
        if (online) {
            newOnlineUsers.add(userId);
        } else {
            newOnlineUsers.delete(userId);
        }
        console.log('New online users set:', Array.from(newOnlineUsers));
        return { onlineUsers: newOnlineUsers };
    }),
    updateTyping: ({ roomId, userId, typing }) => set((state) => {
        console.log(`Updating typing for user ${userId} in room ${roomId}: ${typing}`);
        const newTypingUsers = { ...state.typingUsers };
        const roomTypingUsers = new Set(newTypingUsers[roomId] || new Set());

        if (typing) {
            roomTypingUsers.add(userId);
        } else {
            roomTypingUsers.delete(userId);
        }

        newTypingUsers[roomId] = roomTypingUsers;
        console.log('New typing users:', newTypingUsers);
        return { typingUsers: newTypingUsers };
    }),
}));