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
});
