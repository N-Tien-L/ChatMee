import { describe, expect, it } from 'vitest';
import { MemberResponse, ParticipantRole } from '@/lib/types';
import { canChangeRole, canDeleteRoom, canEditRoom, canInvite, canRemoveMember, findSuccessor } from './roomPermissions';

const { OWNER, ADMIN, MEMBER } = ParticipantRole;
const m = (id: string, role: ParticipantRole): MemberResponse => ({ id, name: id, avatarUrl: null, role });

describe('roomPermissions', () => {
    it('roomActions_byRole_matchSpec', () => {
        expect([canEditRoom(OWNER), canEditRoom(ADMIN), canEditRoom(MEMBER), canEditRoom(null)]).toEqual([true, true, false, false]);
        expect([canDeleteRoom(OWNER), canDeleteRoom(ADMIN), canDeleteRoom(MEMBER)]).toEqual([true, false, false]);
        expect([canInvite(OWNER), canInvite(ADMIN), canInvite(MEMBER)]).toEqual([true, true, false]);
    });

    it('canRemoveMember_ownerAndAdmin_followRoleRules', () => {
        expect(canRemoveMember(OWNER, ADMIN, false)).toBe(true);
        expect(canRemoveMember(OWNER, MEMBER, false)).toBe(true);
        expect(canRemoveMember(OWNER, OWNER, true)).toBe(false);
        expect(canRemoveMember(ADMIN, MEMBER, false)).toBe(true);
        expect(canRemoveMember(ADMIN, ADMIN, false)).toBe(false);
        expect(canRemoveMember(ADMIN, OWNER, false)).toBe(false);
        expect(canRemoveMember(MEMBER, MEMBER, false)).toBe(false);
    });

    it('canChangeRole_ownerOnly_neverSelfOrOwner', () => {
        expect(canChangeRole(OWNER, MEMBER, false)).toBe(true);
        expect(canChangeRole(OWNER, ADMIN, false)).toBe(true);
        expect(canChangeRole(OWNER, OWNER, true)).toBe(false);
        expect(canChangeRole(ADMIN, MEMBER, false)).toBe(false);
    });

    it('findSuccessor_adminsAndMembers_picksFirstAdminThenFirstMember', () => {
        expect(findSuccessor([m('me', OWNER), m('b', MEMBER), m('a1', ADMIN), m('a2', ADMIN)], 'me')?.id).toBe('a1');
        expect(findSuccessor([m('me', OWNER), m('b', MEMBER), m('c', MEMBER)], 'me')?.id).toBe('b');
        expect(findSuccessor([m('me', OWNER)], 'me')).toBeNull();
    });
});
