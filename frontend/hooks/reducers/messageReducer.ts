import { Message, MessageResponse } from "@/lib/types"
import { mergeResyncedMessages } from "@/lib/utils/messageUtils";

export type MessageState = {
    messages: Message[];
    loading: boolean;
    hasMoreMessages: boolean;
    /** Cursor of the oldest loaded page (CM-044); the next older page is requested with before = nextCursor. */
    nextCursor: string | null;
    loadingOlder: boolean;
    olderError: string | null;
    error: string | null;
}

export type MessageAction =
    | { type: "RESET" }
    | { type: "FETCH_START" }
    | { type: "FETCH_SUCCESS"; payload: { messages: MessageResponse[]; hasMore: boolean; nextCursor?: string | null; userId?: string } }
    | { type: "FETCH_ERROR"; payload: string }
    | { type: "LOAD_OLDER_START" }
    | { type: "LOAD_OLDER_SUCCESS"; payload: { messages: MessageResponse[]; hasMore: boolean; nextCursor: string | null; userId?: string } }
    | { type: "LOAD_OLDER_ERROR"; payload: string }
    | { type: "ADD_OPTIMISTIC_MESSAGE"; payload: Message }
    | { type: "CONFIRM_SENT_MESSAGE"; payload: Message }
    | { type: "FAIL_SENT_MESSAGE"; payload: { tempId: string; error: string; code?: string } }
    | { type: "RESEND_MESSAGE"; payload: { tempId: string; message: Message } }
    | { type: "DISCARD_MESSAGE"; payload: { tempId: string } }
    | { type: "RECEIVE_WEBSOCKET_MESSAGE"; payload: { message: Message; userId?: string } }
    | { type: "RESYNC"; payload: { messages: MessageResponse[]; userId?: string } };

export const initialState: MessageState = {
    messages: [],
    loading: false,
    hasMoreMessages: false,
    nextCursor: null,
    loadingOlder: false,
    olderError: null,
    error: null,
}

export function messageReducer(state: MessageState, action: MessageAction): MessageState {
    switch (action.type) {
        case "RESET":
            return initialState

        case "FETCH_START":
            return { ...state, loading: true, error: null }

        case "FETCH_SUCCESS":
            // Live and own messages that arrived while history was loading (or after a failed load
            // that is now retried) are kept, merged by id like a resync.
            return {
                ...state,
                loading: false,
                loadingOlder: false,
                error: null,
                messages: mergeResyncedMessages(state.messages, action.payload.messages, action.payload.userId),
                hasMoreMessages: action.payload.hasMore,
                nextCursor: action.payload.nextCursor ?? null
            }

        case "FETCH_ERROR":
            // Keep what is on screen; the list shows the error and a Retry next to it.
            return { ...state, loading: false, error: action.payload, hasMoreMessages: false, nextCursor: null }

        case "LOAD_OLDER_START":
            return { ...state, loadingOlder: true, olderError: null }

        case "LOAD_OLDER_SUCCESS":
            // Older messages are prepended through the same merge by id, so a page never duplicates one.
            return {
                ...state,
                loadingOlder: false,
                olderError: null,
                messages: mergeResyncedMessages(state.messages, action.payload.messages, action.payload.userId),
                hasMoreMessages: action.payload.hasMore && action.payload.nextCursor !== null,
                nextCursor: action.payload.nextCursor,
            }

        case "LOAD_OLDER_ERROR":
            // The cursor is kept, so Retry requests the same page again.
            return { ...state, loadingOlder: false, olderError: action.payload }

        case "ADD_OPTIMISTIC_MESSAGE":
            return {
                ...state,
                messages: [...state.messages, action.payload],
            };

        case "CONFIRM_SENT_MESSAGE": {
            const confirmed: Message = { ...action.payload, isOwn: true, isOptimistic: false, status: "sent" };
            const pending = state.messages.some((m) => m.isOptimistic && m.tempId === action.payload.tempId);
            if (!pending) {
                // Discarded or sent from another tab: the server saved it, so show it once.
                if (state.messages.some((m) => m.id === action.payload.id)) return state;
                return { ...state, messages: [...state.messages, confirmed] };
            }
            return {
                ...state,
                messages: state.messages.map((m) =>
                    m.isOptimistic && m.tempId === action.payload.tempId ? confirmed : m
                ),
            };
        }

        case "FAIL_SENT_MESSAGE":
            return {
                ...state,
                messages: state.messages.map((m) =>
                    m.isOptimistic && m.tempId === action.payload.tempId
                        ? { ...m, status: "failed", errorMessage: action.payload.error, errorCode: action.payload.code }
                        : m
                ),
            };

        case "RESEND_MESSAGE":
            // The failed copy is replaced by the new attempt (new tempId), never duplicated.
            return {
                ...state,
                messages: [
                    ...state.messages.filter((m) => !(m.isOptimistic && m.tempId === action.payload.tempId)),
                    action.payload.message,
                ],
            };

        case "DISCARD_MESSAGE":
            return {
                ...state,
                messages: state.messages.filter(
                    (m) => !(m.isOptimistic && m.status === "failed" && m.tempId === action.payload.tempId)
                ),
            };

        case "RECEIVE_WEBSOCKET_MESSAGE": {
            // Avoid adding duplicates if it's confirming an optimistic message
            if (state.messages.some((m) => m.id === action.payload.message.id)) {
                return state;
            }
            const finalMsg = { ...action.payload.message, isOwn: action.payload.message.senderId === action.payload.userId };
            return {
                ...state,
                messages: [...state.messages, finalMsg],
            };
        }

        case "RESYNC":
            // Only the newest page is refetched: older pages and the cursor to page further back stay.
            return {
                ...state,
                loading: false,
                loadingOlder: false,
                error: null,
                messages: mergeResyncedMessages(state.messages, action.payload.messages, action.payload.userId),
            };

        default:
            return state;
    }
}