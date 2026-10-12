import { create } from 'zustand';

/** SPEC-005 AC-005-5: "typing" is cleared 5 s after the last event for that user. */
export const TYPING_EXPIRY_MS = 5_000;

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
    /** False until the first presence snapshot after connect (SPEC-005 AC-005-6). */
    presenceLoaded: boolean;
    typingUsers: Record<string, Set<string>>; // roomId -> Set<userId>
    setOnlineUsers: (users: string[]) => void;
    updatePresence: (presenceUpdate: PresenceMessage) => void;
    updateTyping: (typingUpdate: TypingMessage) => void;
    clearTyping: (roomId: string) => void;
}

/** Pending expiry per "roomId:userId"; a new typing event replaces the timer. */
const typingExpiries = new Map<string, ReturnType<typeof setTimeout>>();

const typingKey = (roomId: string, userId: string) => `${roomId}:${userId}`;

const cancelExpiry = (roomId: string, userId: string) => {
    const key = typingKey(roomId, userId);
    const timer = typingExpiries.get(key);
    if (timer !== undefined) clearTimeout(timer);
    typingExpiries.delete(key);
};

export const useChatStore = create<ChatState>((set, get) => ({
    onlineUsers: new Set(),
    presenceLoaded: false,
    typingUsers: {},
    setOnlineUsers: (users) => {
        set({ onlineUsers: new Set(users), presenceLoaded: true });
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
    updateTyping: ({ roomId, userId, typing }) => {
        cancelExpiry(roomId, userId);
        if (typing) {
            typingExpiries.set(typingKey(roomId, userId), setTimeout(() => {
                typingExpiries.delete(typingKey(roomId, userId));
                get().updateTyping({ roomId, userId, typing: false });
            }, TYPING_EXPIRY_MS));
        }
        set((state) => {
            const newTypingUsers = { ...state.typingUsers };
            const roomTypingUsers = new Set(newTypingUsers[roomId] || new Set());

            if (typing) {
                roomTypingUsers.add(userId);
            } else {
                roomTypingUsers.delete(userId);
            }

            newTypingUsers[roomId] = roomTypingUsers;
            return { typingUsers: newTypingUsers };
        });
    },
    clearTyping: (roomId) => {
        for (const userId of get().typingUsers[roomId] ?? []) cancelExpiry(roomId, userId);
        set((state) => ({ typingUsers: { ...state.typingUsers, [roomId]: new Set() } }));
    },
}));
