import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/invitationApi', () => ({
    invitationApi: { listMine: vi.fn(), accept: vi.fn(), decline: vi.fn() },
}));
vi.mock('@/lib/api/dmRequestApi', () => ({
    dmRequestApi: { listMine: vi.fn(), accept: vi.fn(), decline: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { invitationApi } from '@/lib/api/invitationApi';
import { dmRequestApi } from '@/lib/api/dmRequestApi';
import { useInboxStore } from './inboxStore';
import { useChatRoomsStore } from './chatRoomsStore';
import toast from 'react-hot-toast';

const person = { id: 'u2', name: 'Lan', avatarUrl: '' };
const invitation = {
    id: 'i1', room: { id: 'r1', name: 'guild', memberCount: 3 }, inviter: person, invitee: { id: 'me', name: 'Me', avatarUrl: '' },
    createdAt: '2026-10-15T00:00:00Z', expiresAt: '2026-10-22T00:00:00Z',
};
const request = { roomId: 'dm1', sender: person, preview: null, createdAt: '2026-10-15T00:00:00Z', expiresAt: '2026-10-22T00:00:00Z' };

beforeEach(() => {
    vi.clearAllMocks();
    useInboxStore.setState({ invitations: [], requests: [], loading: false, error: null, isOpen: false, pending: [] });
    useChatRoomsStore.setState({ fetchRooms: vi.fn().mockResolvedValue(undefined) });
});

describe('inboxStore', () => {
    it('fetchInbox_bothListsSucceed_storesInvitationsAndRequests', async () => {
        vi.mocked(invitationApi.listMine).mockResolvedValue({ success: true, data: [invitation] } as never);
        vi.mocked(dmRequestApi.listMine).mockResolvedValue({ success: true, data: [request] } as never);
        await useInboxStore.getState().fetchInbox();
        expect(useInboxStore.getState().invitations).toEqual([invitation]);
        expect(useInboxStore.getState().requests).toEqual([request]);
    });

    it('acceptInvitation_success_removesItRefetchesRoomsAndReturnsRoomId', async () => {
        useInboxStore.setState({ invitations: [invitation] });
        vi.mocked(invitationApi.accept).mockResolvedValue(undefined);
        const roomId = await useInboxStore.getState().acceptInvitation('i1');
        expect(roomId).toBe('r1');
        expect(useInboxStore.getState().invitations).toEqual([]);
        expect(useChatRoomsStore.getState().fetchRooms).toHaveBeenCalledTimes(1);
    });

    it('acceptInvitation_failure_keepsItAndReturnsNull', async () => {
        useInboxStore.setState({ invitations: [invitation] });
        vi.mocked(invitationApi.accept).mockRejectedValue(new Error('Room is full'));
        expect(await useInboxStore.getState().acceptInvitation('i1')).toBeNull();
        expect(useInboxStore.getState().invitations).toHaveLength(1);
        expect(useInboxStore.getState().pending).toEqual([]);
    });

    it('declineRequest_success_removesTheRequest', async () => {
        useInboxStore.setState({ requests: [request] });
        vi.mocked(dmRequestApi.decline).mockResolvedValue(undefined);
        await useInboxStore.getState().declineRequest('dm1');
        expect(dmRequestApi.decline).toHaveBeenCalledWith('dm1');
        expect(useInboxStore.getState().requests).toEqual([]);
    });

    it('handleUserEvent_invitationReceivedThenChanged_addsThenRemoves', () => {
        useInboxStore.getState().handleUserEvent({ type: 'INVITATION_RECEIVED', payload: { invitation } });
        expect(useInboxStore.getState().invitations).toEqual([invitation]);
        useInboxStore.getState().handleUserEvent({ type: 'INVITATION_CHANGED', payload: { invitationId: 'i1', roomId: 'r1', status: 'REVOKED' } });
        expect(useInboxStore.getState().invitations).toEqual([]);
    });

    it('handleUserEvent_secondDmRequestForSameRoom_upsertsByRoomId', () => {
        useInboxStore.getState().handleUserEvent({ type: 'DM_REQUEST_RECEIVED', payload: { request } });
        useInboxStore.getState().handleUserEvent({ type: 'DM_REQUEST_RECEIVED', payload: { request: { ...request, preview: 'Hi!' } } });
        expect(useInboxStore.getState().requests).toEqual([{ ...request, preview: 'Hi!' }]);
    });

    it('handleUserEvent_roomRemoved_dropsTheExpiredRequest', () => {
        useInboxStore.setState({ requests: [request] });
        useInboxStore.getState().handleUserEvent({ type: 'ROOM_REMOVED', payload: { roomId: 'dm1', reason: 'EXPIRED' } });
        expect(useInboxStore.getState().requests).toEqual([]);
    });

    it('events_thenReconnectRefetch_keepOneRowPerInvitationAndRequest', async () => {
        const store = useInboxStore.getState();
        store.handleUserEvent({ type: 'INVITATION_RECEIVED', payload: { invitation } });
        store.handleUserEvent({ type: 'INVITATION_RECEIVED', payload: { invitation } });
        store.handleUserEvent({ type: 'DM_REQUEST_RECEIVED', payload: { request } });
        expect(useInboxStore.getState().invitations).toHaveLength(1);

        // Reconnect: the server list replaces what events built up.
        vi.mocked(invitationApi.listMine).mockResolvedValue({ success: true, data: [invitation] } as never);
        vi.mocked(dmRequestApi.listMine).mockResolvedValue({ success: true, data: [{ ...request, preview: 'Hi!' }] } as never);
        await useInboxStore.getState().fetchInbox();
        expect(useInboxStore.getState().invitations).toEqual([invitation]);
        expect(useInboxStore.getState().requests).toEqual([{ ...request, preview: 'Hi!' }]);
    });

    it('handleUserEvent_roomAddedForWaitingRequest_dropsTheRequest', () => {
        useInboxStore.setState({ requests: [request] });
        useInboxStore.getState().handleUserEvent({ type: 'ROOM_ADDED', payload: { room: { id: 'dm1' } } });
        expect(useInboxStore.getState().requests).toEqual([]);
    });

    it('acceptRequest_expiredOnServer_toastsReasonAndResyncsTheInbox', async () => {
        useInboxStore.setState({ requests: [request] });
        vi.mocked(dmRequestApi.accept).mockRejectedValue(new Error('Request not found'));
        vi.mocked(invitationApi.listMine).mockResolvedValue({ success: true, data: [] } as never);
        vi.mocked(dmRequestApi.listMine).mockResolvedValue({ success: true, data: [] } as never);

        expect(await useInboxStore.getState().acceptRequest('dm1')).toBeNull();

        expect(toast.error).toHaveBeenCalledWith('Request not found');
        await vi.waitFor(() => expect(useInboxStore.getState().requests).toEqual([]));
        expect(dmRequestApi.listMine).toHaveBeenCalledTimes(1);
    });

    it('acceptRequest_success_removesItRefetchesRoomsAndReturnsRoomId', async () => {
        useInboxStore.setState({ requests: [request] });
        vi.mocked(dmRequestApi.accept).mockResolvedValue(undefined);
        expect(await useInboxStore.getState().acceptRequest('dm1')).toBe('dm1');
        expect(dmRequestApi.accept).toHaveBeenCalledWith('dm1');
        expect(useInboxStore.getState().requests).toEqual([]);
        expect(useChatRoomsStore.getState().fetchRooms).toHaveBeenCalledTimes(1);
    });
});

it('fetchInbox_unrelatedRoomEventDuringColdLoad_preservesPendingLists', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof dmRequestApi.listMine>>) => void;
    vi.mocked(invitationApi.listMine).mockResolvedValue({ success: true, data: [invitation] } as never);
    vi.mocked(dmRequestApi.listMine).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = useInboxStore.getState().fetchInbox();
    useInboxStore.getState().handleUserEvent({ type: 'ROOM_ADDED', payload: { room: { id: 'unrelated-group' } } });
    resolve({ success: true, data: [request] } as never);
    await pending;
    expect(useInboxStore.getState().invitations).toEqual([invitation]);
    expect(useInboxStore.getState().requests).toEqual([request]);
    expect(useInboxStore.getState().loading).toBe(false);
});

it('fetchInbox_newRequestDuringColdLoad_preservesOtherRowsAndLatestPreview', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof dmRequestApi.listMine>>) => void;
    vi.mocked(invitationApi.listMine).mockResolvedValue({ success: true, data: [invitation] } as never);
    vi.mocked(dmRequestApi.listMine).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = useInboxStore.getState().fetchInbox();
    const latest = { ...request, preview: 'Live preview' };
    const other = { ...request, roomId: 'dm-other' };
    useInboxStore.getState().handleUserEvent({ type: 'DM_REQUEST_RECEIVED', payload: { request: latest } });
    resolve({ success: true, data: [request, other] } as never);
    await pending;
    expect(useInboxStore.getState().invitations).toEqual([invitation]);
    expect(useInboxStore.getState().requests).toEqual([latest, other]);
});

it('fetchInbox_decisionDuringSnapshot_removesOnlyDecidedRequest', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof dmRequestApi.listMine>>) => void;
    vi.mocked(invitationApi.listMine).mockResolvedValue({ success: true, data: [invitation] } as never);
    vi.mocked(dmRequestApi.listMine).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    vi.mocked(dmRequestApi.decline).mockResolvedValue(undefined);
    useInboxStore.setState({ requests: [request] });
    const pending = useInboxStore.getState().fetchInbox();
    await useInboxStore.getState().declineRequest(request.roomId);
    const other = { ...request, roomId: 'dm-other' };
    resolve({ success: true, data: [request, other] } as never);
    await pending;
    expect(useInboxStore.getState().invitations).toEqual([invitation]);
    expect(useInboxStore.getState().requests).toEqual([other]);
});

it('fetchInbox_invitationChangedDuringSnapshot_preservesOtherInvitationsAndRequests', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof invitationApi.listMine>>) => void;
    vi.mocked(invitationApi.listMine).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    vi.mocked(dmRequestApi.listMine).mockResolvedValue({ success: true, data: [request] } as never);
    const pending = useInboxStore.getState().fetchInbox();
    useInboxStore.getState().handleUserEvent({ type: 'INVITATION_CHANGED', payload: { invitationId: invitation.id } });
    const other = { ...invitation, id: 'other-invitation' };
    resolve({ success: true, data: [invitation, other] } as never);
    await pending;
    expect(useInboxStore.getState().invitations).toEqual([other]);
    expect(useInboxStore.getState().requests).toEqual([request]);
});

it('fetchInbox_invitationReceivedDuringSnapshot_preservesExistingRows', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof invitationApi.listMine>>) => void;
    vi.mocked(invitationApi.listMine).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    vi.mocked(dmRequestApi.listMine).mockResolvedValue({ success: true, data: [request] } as never);
    const pending = useInboxStore.getState().fetchInbox();
    const added = { ...invitation, id: 'new-invitation' };
    useInboxStore.getState().handleUserEvent({ type: 'INVITATION_RECEIVED', payload: { invitation: added } });
    resolve({ success: true, data: [invitation] } as never);
    await pending;
    expect(useInboxStore.getState().invitations).toEqual([added, invitation]);
    expect(useInboxStore.getState().requests).toEqual([request]);
});

it('fetchInbox_newerSnapshot_keepsOverlayAfterOlderResponseCompletes', async () => {
    let old!: (value: Awaited<ReturnType<typeof dmRequestApi.listMine>>) => void;
    let latest!: (value: Awaited<ReturnType<typeof dmRequestApi.listMine>>) => void;
    vi.mocked(invitationApi.listMine).mockResolvedValue({ success: true, data: [] } as never);
    vi.mocked(dmRequestApi.listMine).mockReturnValueOnce(new Promise(done => { old = done; }))
        .mockReturnValueOnce(new Promise(done => { latest = done; }));
    const first = useInboxStore.getState().fetchInbox();
    const second = useInboxStore.getState().fetchInbox();
    const updated = { ...request, preview: 'Latest event' };
    useInboxStore.getState().handleUserEvent({ type: 'DM_REQUEST_RECEIVED', payload: { request: updated } });
    old({ success: true, data: [] } as never);
    await first;
    expect(useInboxStore.getState().loading).toBe(true);
    latest({ success: true, data: [request] } as never);
    await second;
    expect(useInboxStore.getState().requests).toEqual([updated]);
    expect(useInboxStore.getState().loading).toBe(false);
});

it('fetchInbox_multipleLiveRows_keepsNewestCreatedFirst', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof dmRequestApi.listMine>>) => void;
    vi.mocked(invitationApi.listMine).mockResolvedValue({ success: true, data: [] } as never);
    vi.mocked(dmRequestApi.listMine).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = useInboxStore.getState().fetchInbox();
    const newer = { ...request, roomId: 'dm-newer', createdAt: '2026-10-16T00:00:00Z' };
    const newest = { ...request, roomId: 'dm-newest', createdAt: '2026-10-17T00:00:00Z' };
    for (const value of [newer, newest])
        useInboxStore.getState().handleUserEvent({ type: 'DM_REQUEST_RECEIVED', payload: { request: value } });
    resolve({ success: true, data: [request] } as never);
    await pending;
    expect(useInboxStore.getState().requests).toEqual([newest, newer, request]);
});
