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
        set({ onlineUsers: new Set(users) });
    },
    updatePresence: ({ userId, online }) => set((state) => {
        const newOnlineUsers = new Set(state.onlineUsers);
        if (online) {
            newOnlineUsers.add(userId);
        } else {
            newOnlineUsers.delete(userId);
        }
        return { onlineUsers: newOnlineUsers };
    }),
    updateTyping: ({ roomId, userId, typing }) => set((state) => {
        const newTypingUsers = { ...state.typingUsers };
        const roomTypingUsers = new Set(newTypingUsers[roomId] || new Set());

        if (typing) {
            roomTypingUsers.add(userId);
        } else {
            roomTypingUsers.delete(userId);
        }

        newTypingUsers[roomId] = roomTypingUsers;
        return { typingUsers: newTypingUsers };
    }),
}));