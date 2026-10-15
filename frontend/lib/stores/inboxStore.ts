import { create } from "zustand";
import toast from "react-hot-toast";
import { invitationApi } from "@/lib/api/invitationApi";
import { dmRequestApi } from "@/lib/api/dmRequestApi";
import { DmRequestResponse, InvitationResponse } from "@/lib/types";
import { useChatRoomsStore } from "./chatRoomsStore";

/** Invitations and DM requests waiting for the signed-in user (SPEC-009; D-16). */
interface InboxState {
    invitations: InvitationResponse[];
    requests: DmRequestResponse[];
    loading: boolean;
    error: string | null;
    isOpen: boolean;
    /** Ids (invitation id or DM room id) with an accept/decline in flight. */
    pending: string[];

    open: () => void;
    close: () => void;
    fetchInbox: () => Promise<void>;
    /** Accepts and returns the room id to open, or null when it failed. */
    acceptInvitation: (id: string) => Promise<string | null>;
    declineInvitation: (id: string) => Promise<void>;
    acceptRequest: (roomId: string) => Promise<string | null>;
    declineRequest: (roomId: string) => Promise<void>;
    handleUserEvent: (event: unknown) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isInvitation = (value: unknown): value is InvitationResponse =>
    isRecord(value) && typeof value.id === "string" && isRecord(value.room) && isRecord(value.inviter);

const isDmRequest = (value: unknown): value is DmRequestResponse =>
    isRecord(value) && typeof value.roomId === "string" && isRecord(value.sender);

const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export const useInboxStore = create<InboxState>((set, get) => {
    const withPending = async <T>(key: string, run: () => Promise<T>): Promise<T> => {
        set((state) => ({ pending: [...state.pending, key] }));
        try {
            return await run();
        } finally {
            set((state) => ({ pending: state.pending.filter((p) => p !== key) }));
        }
    };

    return {
        invitations: [],
        requests: [],
        loading: false,
        error: null,
        isOpen: false,
        pending: [],

        open: () => {
            set({ isOpen: true });
            void get().fetchInbox();
        },
        close: () => set({ isOpen: false }),

        fetchInbox: async () => {
            set({ loading: true, error: null });
            try {
                const [invitations, requests] = await Promise.all([invitationApi.listMine(), dmRequestApi.listMine()]);
                set({
                    invitations: invitations.success ? invitations.data : [],
                    requests: requests.success ? requests.data : [],
                });
            } catch (error) {
                set({ error: messageOf(error, "Could not load your inbox") });
            } finally {
                set({ loading: false });
            }
        },

        acceptInvitation: (id) =>
            withPending(id, async () => {
                const invitation = get().invitations.find((i) => i.id === id);
                try {
                    await invitationApi.accept(id);
                    set((state) => ({ invitations: state.invitations.filter((i) => i.id !== id) }));
                    await useChatRoomsStore.getState().fetchRooms();
                    toast.success(invitation ? `You joined ${invitation.room.name}` : "Invitation accepted");
                    return invitation?.room.id ?? null;
                } catch (error) {
                    toast.error(messageOf(error, "Could not accept the invitation"));
                    // The item may be stale (expired, revoked, answered in another tab): resync with the server.
                    void get().fetchInbox();
                    return null;
                }
            }),

        declineInvitation: (id) =>
            withPending(id, async () => {
                try {
                    await invitationApi.decline(id);
                    set((state) => ({ invitations: state.invitations.filter((i) => i.id !== id) }));
                } catch (error) {
                    toast.error(messageOf(error, "Could not decline the invitation"));
                    // The item may be stale (expired, revoked, answered in another tab): resync with the server.
                    void get().fetchInbox();
                }
            }),

        acceptRequest: (roomId) =>
            withPending(roomId, async () => {
                try {
                    await dmRequestApi.accept(roomId);
                    set((state) => ({ requests: state.requests.filter((r) => r.roomId !== roomId) }));
                    await useChatRoomsStore.getState().fetchRooms();
                    return roomId;
                } catch (error) {
                    toast.error(messageOf(error, "Could not accept the request"));
                    // The item may be stale (expired, revoked, answered in another tab): resync with the server.
                    void get().fetchInbox();
                    return null;
                }
            }),

        declineRequest: (roomId) =>
            withPending(roomId, async () => {
                try {
                    await dmRequestApi.decline(roomId);
                    set((state) => ({ requests: state.requests.filter((r) => r.roomId !== roomId) }));
                } catch (error) {
                    toast.error(messageOf(error, "Could not decline the request"));
                    // The item may be stale (expired, revoked, answered in another tab): resync with the server.
                    void get().fetchInbox();
                }
            }),

        // INVITATION_RECEIVED / INVITATION_CHANGED / DM_REQUEST_RECEIVED / ROOM_ADDED / ROOM_REMOVED on /user/queue/events.
        handleUserEvent: (event) => {
            if (!isRecord(event) || typeof event.type !== "string" || !isRecord(event.payload)) return;
            const payload = event.payload;
            switch (event.type) {
                case "INVITATION_RECEIVED":
                    if (isInvitation(payload.invitation)) {
                        const invitation = payload.invitation;
                        set((state) => ({ invitations: [invitation, ...state.invitations.filter((i) => i.id !== invitation.id)] }));
                    }
                    break;
                case "INVITATION_CHANGED":
                    if (typeof payload.invitationId === "string") {
                        const id = payload.invitationId;
                        set((state) => ({ invitations: state.invitations.filter((i) => i.id !== id) }));
                    }
                    break;
                case "DM_REQUEST_RECEIVED":
                    // A second event for the same room carries the one allowed message: upsert by roomId.
                    if (isDmRequest(payload.request)) {
                        const request = payload.request;
                        set((state) => ({ requests: [request, ...state.requests.filter((r) => r.roomId !== request.roomId)] }));
                    }
                    break;
                case "ROOM_ADDED":
                    // The DM request was accepted in another session (or by starting the same DM): it is no longer waiting.
                    if (isRecord(payload.room) && typeof payload.room.id === "string") {
                        const roomId = payload.room.id;
                        set((state) => ({ requests: state.requests.filter((r) => r.roomId !== roomId) }));
                    }
                    break;
                case "ROOM_REMOVED":
                    if (typeof payload.roomId === "string") {
                        const roomId = payload.roomId;
                        set((state) => ({ requests: state.requests.filter((r) => r.roomId !== roomId) }));
                    }
                    break;
                default:
                    break;
            }
        },
    };
});
