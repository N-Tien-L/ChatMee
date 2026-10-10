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

class DirectRoomPolicyTest {
    private final DirectRoomPolicy policy = new DirectRoomPolicy();
    @Test void checkJoin_directRoom_throwsForbidden() {
        assertEquals("Only PUBLIC rooms can be joined", assertThrows(ForbiddenActionException.class, policy::checkJoin).getMessage());
    }
    @Test void checkAddParticipant_directRoom_throwsForbiddenAction() {
        assertEquals(ErrorCode.FORBIDDEN_ACTION, assertThrows(ForbiddenActionException.class, policy::checkAddParticipant).getErrorCode());
    }
    @Test void checkUpdate_capacityChange_throwsInvalidRequest() {
        var request = new UpdateChatRoomRequest(); request.setMaxUsers(2);
        assertEquals("Cannot change max users for direct message rooms",
            assertThrows(InvalidRequestException.class, () -> policy.checkUpdate(request)).getMessage());
    }
    @Test void checkUpdate_otherFields_allowsUpdate() {
        var request = new UpdateChatRoomRequest(); request.setDescription("New description");
        assertDoesNotThrow(() -> policy.checkUpdate(request));
    }
    @Test void checkLeave_anyMember_throwsForbidden() {
        var room = ChatRoom.builder().createdBy("owner").build();
        for (String user : List.of("owner", "member")) {
            assertEquals("Cannot leave direct message rooms. Please delete the room instead.",
                assertThrows(ForbiddenActionException.class, () -> policy.checkLeave(room, user)).getMessage());
        }
    }
    @Test void create_twoUsers_buildsFixedCapacityAndInitialMemberships() {
        var request = request("member");
        var room = policy.create(request, "owner", id -> id.equals("member"));
        assertEquals(RoomType.DIRECT_MESSAGE, room.getType()); assertEquals("owner", room.getCreatedBy());
        assertEquals(2, room.getMemberCount()); assertEquals(2, room.getMaxParticipants()); assertTrue(room.isActive());
        assertNull(room.getId()); assertNull(room.getName()); assertNotNull(room.getLastActivity()); assertNull(room.getCreatedAt());
        assertTrue(room.getSettings().isAllowFileSharing()); assertFalse(room.getSettings().isAllowGuestUsers());
        assertFalse(room.getSettings().isModerationRequired());
        assertEquals(Map.of("owner", Role.OWNER, "member", Role.MEMBER), policy.initialMembers(request, "owner"));
    }
    @Test void create_missingUser_throwsUserNotFound() {
        assertEquals("Participant not found", assertThrows(UserNotFoundException.class,
            () -> policy.create(request("missing"), "owner", id -> false)).getMessage());
    }
    @Test void create_selfMessage_throwsInvalidRequest() {
        assertEquals("Cannot create direct message with yourself", assertThrows(InvalidRequestException.class,
            () -> policy.create(request("owner"), "owner", id -> true)).getMessage());
    }
    private CreateChatRoomRequest request(String participantId) {
        var request = new CreateChatRoomRequest(); request.setParticipantId(participantId); return request;
    }

    @Test
    void memberKey_eitherOrder_isTheSameSortedPair() {
        org.assertj.core.api.Assertions.assertThat(DirectRoomPolicy.memberKey("b-user", "a-user")).isEqualTo("a-user:b-user");
        org.assertj.core.api.Assertions.assertThat(DirectRoomPolicy.memberKey("a-user", "b-user")).isEqualTo("a-user:b-user");
    }
}
