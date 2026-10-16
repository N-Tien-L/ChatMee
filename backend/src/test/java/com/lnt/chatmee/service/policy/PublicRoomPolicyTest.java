package com.lnt.chatmee.service.policy;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Map;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.exception.*;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.Participant.Role;

class PublicRoomPolicyTest {
    private final PublicRoomPolicy policy = new PublicRoomPolicy();
    @Test void checkJoin_roomType_preservesJoinRule() { assertDoesNotThrow(policy::checkJoin); }
    @Test void checkInvite_publicRoom_throwsInvalidArgument() {
        assertEquals(ErrorCode.INVALID_ARGUMENT, assertThrows(InvalidRequestException.class, policy::checkInvite).getErrorCode());
    }
    @Test void checkUpdate_capacityChange_allowsUpdate() {
        var request = new UpdateChatRoomRequest(); request.setMaxUsers(5);
        assertDoesNotThrow(() -> policy.checkUpdate(request));
    }
    @Test void checkLeave_creator_allowedBecauseOwnershipMovesByRole() {
        var room = ChatRoom.builder().createdBy("owner").build();
        assertDoesNotThrow(() -> policy.checkLeave(room, "owner"));
    }
    @Test void checkLeave_member_allowsLeave() {
        assertDoesNotThrow(() -> policy.checkLeave(ChatRoom.builder().createdBy("owner").build(), "member"));
    }
    @Test void create_defaultSettings_buildsGroupWithOneOwner() {
        var request = new CreateChatRoomRequest(); request.setRoomName("Group"); request.setDescription("Description");
        var room = policy.create(request, "owner", id -> fail("Groups do not look up another user"));
        assertEquals(RoomType.PUBLIC, room.getType()); assertEquals("Group", room.getName());
        assertEquals("Description", room.getDescription()); assertEquals("owner", room.getCreatedBy());
        assertTrue(room.isActive()); assertEquals(1, room.getMemberCount()); assertEquals(-1, room.getMaxParticipants());
        assertNull(room.getId()); assertNotNull(room.getLastActivity()); assertNull(room.getCreatedAt());
        assertFalse(room.getSettings().isAllowFileSharing()); assertFalse(room.getSettings().isAllowGuestUsers());
        assertFalse(room.getSettings().isModerationRequired()); assertEquals("", room.getSettings().getWelcomeMessage());
        assertEquals(Map.of("owner", Role.OWNER), policy.initialMembers(request, "owner"));
    }
    @Test void create_customSettingsAndCapacity_preservesRequest() {
        var request = new CreateChatRoomRequest(); request.setMaxUsers(8);
        request.setSettings(new com.lnt.chatmee.dto.request.RoomSettingsRequest(true, false, false, "Hi"));
        var room = policy.create(request, "owner", id -> true);
        assertEquals(8, room.getMaxParticipants()); assertTrue(room.getSettings().isAllowFileSharing());
        assertFalse(room.getSettings().isAllowGuestUsers()); assertEquals("Hi", room.getSettings().getWelcomeMessage());
    }
}
