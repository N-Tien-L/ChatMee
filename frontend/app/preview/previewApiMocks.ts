import { chatRoomApi } from "@/lib/api/chatRoomApi";
import { invitationApi } from "@/lib/api/invitationApi";
import { dmRequestApi } from "@/lib/api/dmRequestApi";
import { DmRequestResponse, InvitationResponse, PublicRoomSummary, UserSummaryResponse } from "@/lib/types";

/**
 * Development preview only (milestone B2, D-16): swaps the API calls behind Discover, invitations and the inbox for local
 * fixtures so those flows can be tried without a backend. Returns a function that restores the real clients.
 */
export function installPreviewApiMocks(me: UserSummaryResponse, people: UserSummaryResponse[]): () => void {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
  const [lan, khoa, minh, an, ha] = people;

  const publicRooms: PublicRoomSummary[] = [
    { id: "p-hike", name: "weekend-hike", description: "Trails around the city, every other Saturday.", memberCount: 18, maxMembers: 50 },
    { id: "p-cs101", name: "cs101-study", description: "Problem sets, past exams, late-night questions.", memberCount: 42, maxMembers: 50 },
    { id: "p-jazz", name: "jazz-listening", description: "One album a week, talk on Sunday.", memberCount: 7, maxMembers: 0 },
    { id: "p-full", name: "ticket-swap", description: "Concert tickets at face value.", memberCount: 20, maxMembers: 20 },
  ];
  let invitations: InvitationResponse[] = [
    {
      id: "inv-1", room: { id: "r-guild", name: "realtime-guild", memberCount: 9 }, inviter: an, invitee: me,
      createdAt: hoursAgo(2), expiresAt: inDays(7),
    },
    {
      id: "inv-2", room: { id: "r-board", name: "board-games-night", memberCount: 5 }, inviter: ha, invitee: me,
      createdAt: hoursAgo(26), expiresAt: inDays(6),
    },
  ];
  let requests: DmRequestResponse[] = [
    { roomId: "dm-minh", sender: minh, preview: "Hey! Are you the one who wrote the reconnect post?", createdAt: hoursAgo(1), expiresAt: inDays(7) },
    { roomId: "dm-lan", sender: lan ?? khoa, preview: null, createdAt: hoursAgo(5), expiresAt: inDays(7) },
  ];
  const roomInvites: InvitationResponse[] = [];
  const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
  const ok = <T,>(data: T) => ({ success: true, message: "", data }) as { success: true; message: string; data: T };

  const originals = {
    discoverRooms: chatRoomApi.discoverRooms,
    joinChatRoom: chatRoomApi.joinChatRoom,
    invite: invitationApi.invite,
    listForRoom: invitationApi.listForRoom,
    listMine: invitationApi.listMine,
    accept: invitationApi.accept,
    decline: invitationApi.decline,
    revoke: invitationApi.revoke,
    dmList: dmRequestApi.listMine,
    dmAccept: dmRequestApi.accept,
    dmDecline: dmRequestApi.decline,
  };

  chatRoomApi.discoverRooms = async (query = "") => {
    await wait();
    const q = query.trim().toLowerCase();
    const content = publicRooms.filter((r) => !q || r.name.includes(q) || r.description?.toLowerCase().includes(q));
    return ok({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1, last: true }) as never;
  };
  chatRoomApi.joinChatRoom = async (roomId) => {
    await wait();
    const room = publicRooms.find((r) => r.id === roomId);
    if (room && room.maxMembers > 0 && room.memberCount >= room.maxMembers) throw new Error("This room is full.");
  };
  invitationApi.listMine = async () => (await wait(), ok(invitations));
  invitationApi.accept = async (id) => {
    await wait();
    invitations = invitations.filter((i) => i.id !== id);
  };
  invitationApi.decline = async (id) => {
    await wait();
    invitations = invitations.filter((i) => i.id !== id);
  };
  invitationApi.listForRoom = async () => (await wait(150), ok(roomInvites));
  invitationApi.invite = async (roomId, userId) => {
    await wait();
    const invitee = people.find((p) => p.id === userId) ?? { id: userId, name: userId, avatarUrl: "" };
    if (invitee.id === khoa?.id) throw new Error("Cannot invite this user");
    const invitation: InvitationResponse = {
      id: `inv-${Date.now()}-${userId}`, room: { id: roomId, name: "room", memberCount: 1 }, inviter: me, invitee,
      createdAt: new Date().toISOString(), expiresAt: inDays(7),
    };
    roomInvites.push(invitation);
    return ok(invitation);
  };
  invitationApi.revoke = async (id) => {
    await wait();
    const index = roomInvites.findIndex((i) => i.id === id);
    if (index >= 0) roomInvites.splice(index, 1);
  };
  dmRequestApi.listMine = async () => (await wait(), ok(requests));
  dmRequestApi.accept = async (roomId) => {
    await wait();
    requests = requests.filter((r) => r.roomId !== roomId);
  };
  dmRequestApi.decline = async (roomId) => {
    await wait();
    requests = requests.filter((r) => r.roomId !== roomId);
  };

  return () => {
    chatRoomApi.discoverRooms = originals.discoverRooms;
    chatRoomApi.joinChatRoom = originals.joinChatRoom;
    Object.assign(invitationApi, {
      invite: originals.invite, listForRoom: originals.listForRoom, listMine: originals.listMine,
      accept: originals.accept, decline: originals.decline, revoke: originals.revoke,
    });
    Object.assign(dmRequestApi, { listMine: originals.dmList, accept: originals.dmAccept, decline: originals.dmDecline });
  };
}
