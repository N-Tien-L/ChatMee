import { create } from 'zustand'

/** Per-room unsent message drafts (SPEC-013). Text only, per tab, 24 h after the last edit. */
const PREFIX = 'chatmee:draft:v1:'
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

interface StoredDraft {
    text: string
    updatedAt: string
}

const keyFor = (userId: string, roomId: string) => `${PREFIX}${userId}:${roomId}`

/** In-memory copy used when sessionStorage is unavailable or throws (AC-013-9). */
const memory = new Map<string, StoredDraft>()

function storage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.sessionStorage
    } catch {
        return null
    }
}

function readRaw(key: string): StoredDraft | null {
    const store = storage()
    if (store) {
        try {
            const raw = store.getItem(key)
            if (raw === null) return memory.get(key) ?? null
            const parsed: unknown = JSON.parse(raw)
            if (
                parsed && typeof parsed === 'object' &&
                typeof (parsed as StoredDraft).text === 'string' &&
                typeof (parsed as StoredDraft).updatedAt === 'string'
            ) {
                return parsed as StoredDraft
            }
            store.removeItem(key)
            return null
        } catch {
            // fall through to memory
        }
    }
    return memory.get(key) ?? null
}

function writeRaw(key: string, value: StoredDraft) {
    memory.set(key, value)
    try {
        storage()?.setItem(key, JSON.stringify(value))
    } catch {
        // the memory copy keeps the draft for this page lifetime
    }
}

function removeRaw(key: string) {
    memory.delete(key)
    try {
        storage()?.removeItem(key)
    } catch {
        // nothing to do
    }
}

function allKeys(): string[] {
    const keys = new Set<string>([...memory.keys()].filter((k) => k.startsWith(PREFIX)))
    try {
        const store = storage()
        if (store) {
            for (let i = 0; i < store.length; i++) {
                const k = store.key(i)
                if (k && k.startsWith(PREFIX)) keys.add(k)
            }
        }
    } catch {
        // ignore
    }
    return [...keys]
}

const isExpired = (draft: StoredDraft, now: number) => {
    const at = Date.parse(draft.updatedAt)
    return Number.isNaN(at) || now - at > DRAFT_TTL_MS
}

interface DraftState {
    /** Draft texts of the signed-in user by room id, for the room list hint (AC-013-11). */
    texts: Record<string, string>
    /** Returns the stored draft text, discarding an expired one (AC-013-3). */
    load: (userId: string, roomId: string) => string
    /** Stores the text; an empty or whitespace-only text removes the entry (AC-013-4). */
    save: (userId: string, roomId: string, text: string) => void
    clear: (userId: string, roomId: string) => void
    /** Removes every draft key (confirmed logout, AC-013-6). */
    clearAll: () => void
    /** Removes every draft of other accounts and expired ones, then loads this user's hints (AC-013-7). */
    hydrate: (userId: string) => void
}

export const useDraftStore = create<DraftState>()((set, get) => ({
    texts: {},

    load: (userId, roomId) => {
        const key = keyFor(userId, roomId)
        const draft = readRaw(key)
        if (!draft) return ''
        if (isExpired(draft, Date.now())) {
            get().clear(userId, roomId)
            return ''
        }
        return draft.text
    },

    save: (userId, roomId, text) => {
        if (!text.trim()) {
            get().clear(userId, roomId)
            return
        }
        writeRaw(keyFor(userId, roomId), { text, updatedAt: new Date().toISOString() })
        if (get().texts[roomId] !== text) set((s) => ({ texts: { ...s.texts, [roomId]: text } }))
    },

    clear: (userId, roomId) => {
        removeRaw(keyFor(userId, roomId))
        if (roomId in get().texts) {
            set((s) => {
                const next = { ...s.texts }
                delete next[roomId]
                return { texts: next }
            })
        }
    },

    clearAll: () => {
        allKeys().forEach(removeRaw)
        set({ texts: {} })
    },

    hydrate: (userId) => {
        const own = `${PREFIX}${userId}:`
        const now = Date.now()
        const texts: Record<string, string> = {}
        for (const key of allKeys()) {
            if (!key.startsWith(own)) {
                removeRaw(key)
                continue
            }
            const draft = readRaw(key)
            if (!draft || isExpired(draft, now)) {
                removeRaw(key)
                continue
            }
            texts[key.slice(own.length)] = draft.text
        }
        set({ texts })
    },
}))

/** Test helper: forget the in-memory fallback. */
export function resetDraftMemory() {
    memory.clear()
}
