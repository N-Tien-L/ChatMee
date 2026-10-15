import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import { RoomPanel } from './RoomPanel';
import { chatRoomApi } from '@/lib/api/chatRoomApi';
import { useAuthStore } from '@/lib/stores/authStore';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useUsersStore } from '@/lib/stores/usersStore';
import { userApi } from '@/lib/api/userApi';
import { MemberResponse, ParticipantRole, RoomType } from '@/lib/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./InvitePeopleDialog', () => ({ InvitePeopleDialog: () => null }));
vi.mock('@/lib/api/chatRoomApi', () => ({
    chatRoomApi: {
        getChatRoomById: vi.fn(),
        getMembers: vi.fn(),
        removeMember: vi.fn(),
        changeMemberRole: vi.fn(),
        updateChatRoom: vi.fn(),
        joinChatRoom: vi.fn(),
    },
}));
vi.mock('@/lib/api/userApi', () => ({
    userApi: { getUserById: vi.fn(), searchUsers: vi.fn(), listBlocks: vi.fn(), blockUser: vi.fn(), unblockUser: vi.fn() },
}));
vi.mock('@/components/safety/ReportDialog', () => ({
    ReportDialog: ({ target }: { target: { type: string; id: string } | null }) =>
        target ? <div role="dialog" aria-label="report">{`${target.type}:${target.id}`}</div> : null,
}));

const member = (id: string, name: string, role: ParticipantRole): MemberResponse => ({ id, name, avatarUrl: null, role });

/** The caller is `me`. `createdBy` is `founder`, who is now a plain member (ownership moved). */
const setup = (myRole: ParticipantRole | null, members: MemberResponse[], roomType = RoomType.PUBLIC) => {
    vi.mocked(chatRoomApi.getChatRoomById).mockResolvedValue({
        success: true,
        data: {
            id: 'r1', roomName: 'Hikers', roomType, createdBy: 'founder', createdAt: '2026-10-09T10:00:00Z',
            maxUsers: 50, participants: members.map((m) => m.id), myRole,
        },
    } as never);
    vi.mocked(chatRoomApi.getMembers).mockResolvedValue({ success: true, data: members } as never);
    return render(<RoomPanel roomId="r1" isOpen onClose={vi.fn()} />);
};

const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 'me', name: 'Me' } } as never);
    useChatRoomsStore.setState({ rooms: [] } as never);
    vi.mocked(userApi.listBlocks).mockResolvedValue({ success: true, data: [] } as never);
});
afterEach(cleanup);

const team = [
    member('founder', 'Founder', ParticipantRole.MEMBER),
    member('me', 'Me', ParticipantRole.OWNER),
    member('ana', 'Ana', ParticipantRole.ADMIN),
    member('bob', 'Bob', ParticipantRole.MEMBER),
];

describe('RoomPanel roles', () => {
    it('render_ownershipTransferred_ownerBadgeAndSettingsFollowRoleNotCreatedBy', async () => {
        setup(ParticipantRole.OWNER, team);
        await screen.findByText('Founder');
        expect(within(row('Me')).getByText('Owner')).toBeInTheDocument();
        expect(within(row('Founder')).queryByText('Owner')).toBeNull();
        expect(screen.getByRole('button', { name: 'Room settings' })).toBeInTheDocument();
    });

    it('render_creatorWhoIsNoLongerOwner_getsNoSettingsEntry', async () => {
        useAuthStore.setState({ user: { id: 'founder', name: 'Founder' } } as never);
        setup(ParticipantRole.MEMBER, team);
        await screen.findByText('Bob');
        expect(screen.queryByRole('button', { name: 'Room settings' })).toBeNull();
    });

    it('render_owner_canChangeRolesAndRemoveEveryoneButSelf', async () => {
        setup(ParticipantRole.OWNER, team);
        await screen.findByText('Bob');
        expect(screen.getByRole('button', { name: 'Make Bob an admin' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Make Ana a member' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove Ana' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove Bob' })).toBeInTheDocument();
        expect(within(row('Me')).queryAllByRole('button')).toHaveLength(0);
        expect(screen.getByRole('button', { name: 'Leave room' })).toBeInTheDocument();
    });

    it('render_admin_removesMembersOnlyAndCannotChangeRoles', async () => {
        setup(ParticipantRole.ADMIN, [
            member('own', 'Olga', ParticipantRole.OWNER),
            member('me', 'Me', ParticipantRole.ADMIN),
            member('ad2', 'Ana', ParticipantRole.ADMIN),
            member('bob', 'Bob', ParticipantRole.MEMBER),
        ]);
        await screen.findByText('Bob');
        expect(screen.getByRole('button', { name: 'Remove Bob' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove Ana' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Remove Olga' })).toBeNull();
        expect(screen.queryByRole('button', { name: /^Make / })).toBeNull();
        // ADMIN may edit the room but not delete it.
        fireEvent.click(screen.getByRole('button', { name: 'Room settings' }));
        expect(screen.getByLabelText('Room name')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete room' })).toBeNull();
    });

    it('render_member_hasMessageAndLeaveOnly', async () => {
        setup(ParticipantRole.MEMBER, [member('own', 'Olga', ParticipantRole.OWNER), member('me', 'Me', ParticipantRole.MEMBER)]);
        await screen.findByText('Olga');
        expect(screen.getByRole('button', { name: 'Message Olga' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
        expect(screen.queryByRole('button', { name: /^Make / })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Room settings' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Leave room' })).toBeInTheDocument();
    });

    it('render_twelveMembers_listsAllFromBatchedMembersEndpoint', async () => {
        const many = Array.from({ length: 12 }, (_, i) => member(`u${i}`, `Person ${i + 1}`, ParticipantRole.MEMBER));
        setup(ParticipantRole.MEMBER, [...many, member('me', 'Me', ParticipantRole.OWNER)]);
        await screen.findByText('Person 12');
        expect(within(screen.getByRole('region', { name: 'Participants' })).getAllByRole('listitem')).toHaveLength(13);
        expect(chatRoomApi.getMembers).toHaveBeenCalledTimes(1);
        const { userApi } = await import('@/lib/api/userApi');
        expect(userApi.getUserById).not.toHaveBeenCalled();
    });

    it('render_memberWithoutName_showsDeletedUserWithNeutralAvatar', async () => {
        setup(ParticipantRole.MEMBER, [member('me', 'Me', ParticipantRole.MEMBER), { id: 'gone', name: '', avatarUrl: 'x.png', role: ParticipantRole.MEMBER }]);
        const avatar = await screen.findByRole('img', { name: 'Deleted user' });
        expect(screen.getByText('Deleted user')).toBeInTheDocument();
        expect(avatar.querySelector('.bg-muted')).not.toBeNull();
        expect(avatar.querySelector('img')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Message Deleted user' })).toBeNull();
    });
});

describe('RoomPanel actions', () => {
    it('leave_owner_confirmNamesTheEarliestAdminAsNextOwner', async () => {
        setup(ParticipantRole.OWNER, team);
        await screen.findByText('Bob');
        fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
        expect(await screen.findByText(/Ana will become the owner\./)).toBeInTheDocument();
    });

    it('leave_confirmed_callsStoreLeaveAndCloses', async () => {
        const leaveRoom = vi.fn().mockResolvedValue(true);
        useChatRoomsStore.setState({ leaveRoom } as never);
        const onClose = vi.fn();
        vi.mocked(chatRoomApi.getChatRoomById).mockResolvedValue({
            success: true,
            data: { id: 'r1', roomName: 'Hikers', roomType: RoomType.PUBLIC, createdAt: '2026-10-09T10:00:00Z', participants: ['me'], myRole: 'MEMBER' },
        } as never);
        vi.mocked(chatRoomApi.getMembers).mockResolvedValue({ success: true, data: [member('me', 'Me', ParticipantRole.MEMBER)] } as never);
        render(<RoomPanel roomId="r1" isOpen onClose={onClose} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Leave room' }));
        const dialog = await screen.findByRole('dialog', { name: 'Leave Hikers?' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Leave room' }));
        await waitFor(() => expect(leaveRoom).toHaveBeenCalledWith('r1'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('removeMember_confirmed_callsApiAndShowsToast', async () => {
        vi.mocked(chatRoomApi.removeMember).mockResolvedValue(undefined);
        setup(ParticipantRole.OWNER, team);
        fireEvent.click(await screen.findByRole('button', { name: 'Remove Bob' }));
        const dialog = await screen.findByRole('dialog', { name: 'Remove Bob?' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
        await waitFor(() => expect(chatRoomApi.removeMember).toHaveBeenCalledWith('r1', 'bob'));
        expect(toast.success).toHaveBeenCalledWith('Bob was removed');
    });

    it('changeRole_ownerPromotesMember_sendsAdminRole', async () => {
        vi.mocked(chatRoomApi.changeMemberRole).mockResolvedValue(undefined);
        setup(ParticipantRole.OWNER, team);
        fireEvent.click(await screen.findByRole('button', { name: 'Make Bob an admin' }));
        await waitFor(() => expect(chatRoomApi.changeMemberRole).toHaveBeenCalledWith('r1', 'bob', ParticipantRole.ADMIN));
        expect(toast.success).toHaveBeenCalledWith('Bob is now an admin');
    });

    it('message_memberRow_opensDirectMessageWithThatMember', async () => {
        const startDirectMessage = vi.fn().mockResolvedValue({ id: 'dm-1' });
        useChatRoomsStore.setState({ startDirectMessage } as never);
        setup(ParticipantRole.MEMBER, team);
        fireEvent.click(await screen.findByRole('button', { name: 'Message Bob' }));
        await waitFor(() => expect(startDirectMessage).toHaveBeenCalledWith('bob'));
        expect(push).toHaveBeenCalledWith('/dashboard?roomId=dm-1', { scroll: false });
    });

    it('save_settings_usesToastAndNoNativeAlert', async () => {
        const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
        vi.mocked(chatRoomApi.updateChatRoom).mockResolvedValue({ success: true, data: { id: 'r1', roomName: 'Hikers 2' } } as never);
        setup(ParticipantRole.ADMIN, team);
        fireEvent.click(await screen.findByRole('button', { name: 'Room settings' }));
        fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Hikers 2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(chatRoomApi.updateChatRoom).toHaveBeenCalledWith('r1', expect.objectContaining({ roomName: 'Hikers 2' })));
        expect(toast.success).toHaveBeenCalledWith('Room updated');
        expect(alert).not.toHaveBeenCalled();
    });

    it('delete_owner_asksInConfirmDialogWithoutPrompt', async () => {
        const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => null);
        const deleteRoomById = vi.fn().mockResolvedValue(true);
        useChatRoomsStore.setState({ deleteRoomById } as never);
        setup(ParticipantRole.OWNER, team);
        fireEvent.click(await screen.findByRole('button', { name: 'Room settings' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete room' }));
        const dialog = await screen.findByRole('dialog', { name: 'Delete Hikers?' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete room' }));
        await waitFor(() => expect(deleteRoomById).toHaveBeenCalledWith('r1'));
        expect(prompt).not.toHaveBeenCalled();
    });

    it('join_roomFull_showsRoomFullMessage', async () => {
        useAuthStore.setState({ user: { id: 'visitor', name: 'Visitor' } } as never);
        vi.mocked(chatRoomApi.getChatRoomById).mockResolvedValue({
            success: true,
            data: { id: 'r1', roomName: 'Hikers', roomType: RoomType.PUBLIC, createdAt: '2026-10-09T10:00:00Z', participants: ['me'], myRole: null },
        } as never);
        vi.mocked(chatRoomApi.getMembers).mockRejectedValue(new Error('Not found'));
        const { AxiosError } = await import('axios');
        const cause = new AxiosError('Conflict', '409', undefined, undefined, {
            status: 409, data: { code: 'ROOM_FULL' }, statusText: '', headers: {}, config: {} as never,
        });
        vi.mocked(chatRoomApi.joinChatRoom).mockRejectedValue(new Error('Room is full', { cause }));
        render(<RoomPanel roomId="r1" isOpen onClose={vi.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Join room' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This room is full.'));
    });
});

describe('RoomPanel safety', () => {
    const openDm = (blocked: boolean) => {
        vi.mocked(chatRoomApi.getChatRoomById).mockResolvedValue({
            success: true,
            data: {
                id: 'dm1', roomName: '', roomType: RoomType.DIRECT_MESSAGE, createdBy: 'me', createdAt: '2026-10-09T10:00:00Z',
                maxUsers: 2, participants: ['me', 'bob'], myRole: ParticipantRole.OWNER, blocked,
                counterpart: { id: 'bob', name: 'Bob', avatarUrl: '' },
            },
        } as never);
        vi.mocked(chatRoomApi.getMembers).mockResolvedValue({
            success: true, data: [member('me', 'Me', ParticipantRole.OWNER), member('bob', 'Bob', ParticipantRole.MEMBER)],
        } as never);
        return render(<RoomPanel roomId="dm1" isOpen onClose={vi.fn()} />);
    };

    it('render_directMessage_offersHideBlockReportAndNoLeaveOrDelete', async () => {
        openDm(false);
        expect(await screen.findByRole('button', { name: 'Hide conversation' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Block Bob' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Report Bob' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Leave room' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Room settings' })).toBeNull();
    });

    it('block_directMessage_callsBlockAndFlagsTheDm', async () => {
        vi.mocked(userApi.blockUser).mockResolvedValue(undefined);
        useChatRoomsStore.setState({
            rooms: [{ id: 'dm1', roomType: RoomType.DIRECT_MESSAGE, counterpart: { id: 'bob', name: 'Bob', avatarUrl: '' } }],
        } as never);
        openDm(false);
        fireEvent.click(await screen.findByRole('button', { name: 'Block Bob' }));
        await waitFor(() => expect(userApi.blockUser).toHaveBeenCalledWith('bob'));
        expect(await screen.findByRole('button', { name: 'Unblock Bob' })).toBeInTheDocument();
    });

    it('unblock_blockedDirectMessage_callsUnblock', async () => {
        vi.mocked(userApi.unblockUser).mockResolvedValue(undefined);
        openDm(true);
        fireEvent.click(await screen.findByRole('button', { name: 'Unblock Bob' }));
        await waitFor(() => expect(userApi.unblockUser).toHaveBeenCalledWith('bob'));
    });

    it('hide_directMessage_callsStoreHideAndCloses', async () => {
        const hideRoom = vi.fn().mockResolvedValue(true);
        useChatRoomsStore.setState({ hideRoom } as never);
        openDm(false);
        fireEvent.click(await screen.findByRole('button', { name: 'Hide conversation' }));
        await waitFor(() => expect(hideRoom).toHaveBeenCalledWith('dm1'));
    });

    it('report_directMessageCounterpart_opensUserReport', async () => {
        openDm(false);
        fireEvent.click(await screen.findByRole('button', { name: 'Report Bob' }));
        expect(screen.getByRole('dialog', { name: 'report' })).toHaveTextContent('USER:bob');
    });

    it('memberRow_moreActions_blocksAndReportsThatMember', async () => {
        vi.mocked(userApi.blockUser).mockResolvedValue(undefined);
        setup(ParticipantRole.MEMBER, team);
        fireEvent.click(await screen.findByRole('button', { name: 'More actions for Bob' }));
        fireEvent.click(screen.getByRole('button', { name: 'Block Bob' }));
        await waitFor(() => expect(userApi.blockUser).toHaveBeenCalledWith('bob'));
        fireEvent.click(screen.getByRole('button', { name: 'Report Bob' }));
        expect(screen.getByRole('dialog', { name: 'report' })).toHaveTextContent('USER:bob');
    });

    it('memberRow_alreadyBlocked_offersUnblock', async () => {
        vi.mocked(userApi.listBlocks).mockResolvedValue({
            success: true, data: [{ id: 'bob', name: 'Bob', blockedAt: '2026-10-01T00:00:00Z' }],
        } as never);
        setup(ParticipantRole.MEMBER, team);
        fireEvent.click(await screen.findByRole('button', { name: 'More actions for Bob' }));
        await waitFor(() => expect(useUsersStore.getState().blockedUsers).toHaveLength(1));
        expect(screen.getByRole('button', { name: 'Unblock Bob' })).toBeInTheDocument();
    });

    it('report_groupRoom_opensRoomReport', async () => {
        setup(ParticipantRole.MEMBER, team);
        fireEvent.click(await screen.findByRole('button', { name: 'Report room' }));
        expect(screen.getByRole('dialog', { name: 'report' })).toHaveTextContent('ROOM:r1');
    });
});
