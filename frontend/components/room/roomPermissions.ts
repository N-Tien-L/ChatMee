import { MemberResponse, ParticipantRole } from "@/lib/types";

/**
 * Room actions by participant role (SPEC-008 AC-008-9, SPEC-009 AC-009-23..25). `createdBy` is history only and is
 * never used here. The server checks every action again; these rules only decide which controls are shown.
 */
type Role = ParticipantRole | null | undefined;

const isOwner = (role: Role) => role === ParticipantRole.OWNER;
const isManager = (role: Role) => role === ParticipantRole.OWNER || role === ParticipantRole.ADMIN;

/** Name, description and size: OWNER or ADMIN (owner decision 2026-10-12). */
export const canEditRoom = (role: Role) => isManager(role);
/** Delete a group room: OWNER only (AC-002-6 and its amendment). */
export const canDeleteRoom = (role: Role) => isOwner(role);
/** Invite to a PRIVATE room and revoke pending invitations: OWNER or ADMIN. */
export const canInvite = (role: Role) => isManager(role);

/** OWNER removes anyone but themselves; ADMIN removes MEMBERs only (AC-008-6). */
export const canRemoveMember = (actor: Role, target: ParticipantRole, isSelf: boolean) => {
  if (isSelf || target === ParticipantRole.OWNER) return false;
  if (isOwner(actor)) return true;
  return actor === ParticipantRole.ADMIN && target === ParticipantRole.MEMBER;
};

/** Promote MEMBER to ADMIN or demote ADMIN to MEMBER: OWNER only, never self or the OWNER (AC-009-23). */
export const canChangeRole = (actor: Role, target: ParticipantRole, isSelf: boolean) =>
  isOwner(actor) && !isSelf && target !== ParticipantRole.OWNER;

/**
 * The member who becomes owner when the owner leaves (AC-009-24): the earliest-joined ADMIN, else the earliest-joined
 * MEMBER. The member list does not carry `joinedAt`, so its order (the server's participant order) stands in for join
 * order. Null when nobody else is left (leaving then deletes the room).
 */
export const findSuccessor = (members: MemberResponse[], leavingUserId: string): MemberResponse | null => {
  const others = members.filter((member) => member.id !== leavingUserId && member.role !== ParticipantRole.OWNER);
  return (
    others.find((member) => member.role === ParticipantRole.ADMIN) ??
    others.find((member) => member.role === ParticipantRole.MEMBER) ??
    null
  );
};
