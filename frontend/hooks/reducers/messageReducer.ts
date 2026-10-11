import { Message, MessageResponse } from "@/lib/types"
import { mergeResyncedMessages } from "@/lib/utils/messageUtils";

export type MessageState = {
    messages: Message[];
    loading: boolean;
    hasMoreMessages: boolean;
    error: string | null;
    sending: boolean;
}

export type MessageAction =
    | { type: "RESET" }
    | { type: "FETCH_START" }
    | { type: "FETCH_SUCCESS"; payload: { messages: MessageResponse[]; hasMore: boolean; userId?: string } }
    | { type: "FETCH_ERROR"; payload: string }
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
    error: null,
    sending: false
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
                error: null,
                messages: mergeResyncedMessages(state.messages, action.payload.messages, action.payload.userId),
                hasMoreMessages: action.payload.hasMore
            }

        case "FETCH_ERROR":
            // Keep what is on screen; the list shows the error and a Retry next to it.
            return { ...state, loading: false, error: action.payload, hasMoreMessages: false }

        case "ADD_OPTIMISTIC_MESSAGE":
            return {
                ...state,
                sending: false,
                messages: [...state.messages, action.payload],
            };

        case "CONFIRM_SENT_MESSAGE": {
            const confirmed: Message = { ...action.payload, isOwn: true, isOptimistic: false, status: "sent" };
            const pending = state.messages.some((m) => m.isOptimistic && m.tempId === action.payload.tempId);
            if (!pending) {
                // Discarded or sent from another tab: the server saved it, so show it once.
                if (state.messages.some((m) => m.id === action.payload.id)) return state;
                return { ...state, sending: false, messages: [...state.messages, confirmed] };
            }
            return {
                ...state,
                sending: false,
                messages: state.messages.map((m) =>
                    m.isOptimistic && m.tempId === action.payload.tempId ? confirmed : m
                ),
            };
        }

        case "FAIL_SENT_MESSAGE":
            return {
                ...state,
                sending: false,
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
            return {
                ...state,
                loading: false,
                error: null,
                messages: mergeResyncedMessages(state.messages, action.payload.messages, action.payload.userId),
            };

        default:
            return state;
    }
}