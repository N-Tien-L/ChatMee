package com.lnt.chatmee.dto;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.cfg.DateTimeFeature;
import tools.jackson.databind.json.JsonMapper;
import com.lnt.chatmee.dto.response.*;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.User;

class ResponseContractTest {
    private final ObjectMapper json = JsonMapper.builder()
            .disable(DateTimeFeature.WRITE_DATES_AS_TIMESTAMPS).build();

    @Test
    void messagePage_record_serializesFixedPaginationEnvelope() throws Exception {
        var page = new MessagePageResponse(List.of(), null, false);
        var pageJson = json.valueToTree(ApiResponse.success(page));
        assertThat(pageJson).isEqualTo(json.readTree("""
                {"success":true,"data":{"messages":[],"nextCursor":null,"hasMore":false}}
                """));
        assertThat(MessagePageResponse.class.isRecord()).isTrue();
    }

    @Test void responseFactories_records_preserveJsonPropertiesAndTimestamps() throws Exception {
        var time = Instant.parse("2026-10-09T01:02:03Z");
        var message = Message.builder().id("message").chatRoomId("room").senderId("user")
                .clientMessageId("temporary")
                .content("hello").type(Message.MessageType.TEXT).createdAt(time).updatedAt(time)
                .isUpdated(true).isDeleted(false).build();
        var messageJson = json.valueToTree(ChatMessageResponse.from(message, "Alice", "temporary"));
        assertThat(messageJson).isEqualTo(json.readTree("""
                {"id":"message","tempId":"temporary","clientMessageId":"temporary","chatRoomId":"room","senderId":"user",
                 "senderName":"Alice","content":"hello","type":"TEXT",
                 "createdAt":"2026-10-09T01:02:03Z","updatedAt":"2026-10-09T01:02:03Z",
                 "isUpdated":true,"isDeleted":false}
                """));
        var user = User.builder().id("user").name("Alice").email("alice@example.test")
                .avatarUrl("avatar").provider("github").build();
        var authJson = json.valueToTree(AuthResponse.from(UserResponse.from(user)));
        assertThat(authJson).isEqualTo(json.readTree("""
                {"authenticated":true,"message":"User authenticated successfully",
                 "user":{"id":"user","name":"Alice","email":"alice@example.test",
                         "avatarUrl":"avatar","provider":"github"}}
                """));
        var room = ChatRoom.builder().id("room").name("Room").description("description")
                .createdBy("user").type(ChatRoom.RoomType.PUBLIC).maxParticipants(10)
                .createdAt(LocalDateTime.parse("2026-10-09T01:02:03"))
                .lastActivity(LocalDateTime.parse("2026-10-09T01:02:03")).lastActivityAt(time).build();
        var roomJson = json.readTree(json.writeValueAsString(ChatRoomResponse.from(room, Set.of("user"))));
        assertThat(roomJson).isEqualTo(json.readTree("""
                {"id":"room","roomName":"Room","roomType":"PUBLIC","description":"description",
                 "createdBy":"user","createdAt":"2026-10-09T01:02:03","updatedAt":"2026-10-09T01:02:03",
                 "maxUsers":10,"settings":null,"participants":["user"],"counterpart":null,
                 "lastActivityAt":"2026-10-09T01:02:03Z","lastMessage":null,"unreadCount":0,"myRole":null,
                 "state":"ACTIVE","blocked":false}
                """));
        for (Class<?> type : new Class<?>[]{AuthResponse.class, UserResponse.class,
                ChatRoomResponse.class, ChatMessageResponse.class}) assertThat(type.isRecord()).isTrue();
    }

    @Test
    void memberResponse_record_serializesOnlyMemberFields() throws Exception {
        assertThat(MemberResponse.class.isRecord()).isTrue();
        tools.jackson.databind.JsonNode member = json.valueToTree(new MemberResponse("user", "Alice", "avatar", com.lnt.chatmee.model.Participant.Role.ADMIN));
        assertThat(member)
            .isEqualTo(json.readTree("""
                {"id":"user","name":"Alice","avatarUrl":"avatar","role":"ADMIN"}
                """));
    }

    @Test
    void invitationResponse_record_serializesInvitationFieldsWithIsoTimestamps() throws Exception {
        assertThat(InvitationResponse.class.isRecord()).isTrue();
        var time = Instant.parse("2026-10-09T01:02:03Z");
        var invitation = new InvitationResponse("inv", new InvitationResponse.RoomSummary("room", "Secret", 3),
            new UserSummaryResponse("alice", "Alice", "a.png"), new UserSummaryResponse("bob", "Bob", null),
            time, time.plusSeconds(7 * 24 * 3600));
        tools.jackson.databind.JsonNode invitationJson = json.valueToTree(invitation);
        assertThat(invitationJson).isEqualTo(json.readTree("""
                {"id":"inv","room":{"id":"room","name":"Secret","memberCount":3},
                 "inviter":{"id":"alice","name":"Alice","avatarUrl":"a.png"},
                 "invitee":{"id":"bob","name":"Bob","avatarUrl":null},
                 "createdAt":"2026-10-09T01:02:03Z","expiresAt":"2026-10-16T01:02:03Z"}
                """));
    }

}
