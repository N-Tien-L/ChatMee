package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.*;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import com.lnt.chatmee.model.*;
import com.lnt.chatmee.repository.*;
import com.lnt.chatmee.support.ContainersConfig;

@SpringBootTest
@ActiveProfiles("test")
@Import(ContainersConfig.class)
class RoomUnreadIT {
    @Autowired ChatRoomRepository rooms;
    @Autowired ParticipantRepository participants;
    @Autowired MessageRepository messages;
    @Autowired UserRepository users;
    @Autowired ChatRoomService roomService;
    @Autowired ParticipantService participantService;

    @Test
    void unreadCount_mixedMessages_excludesOwnSystemDeletedAndResetsAfterRead() {
        var room = rooms.save(ChatRoom.builder().name("Unread test").type(ChatRoom.RoomType.PUBLIC).isActive(true).build());
        var user = users.save(User.builder().name("Reader").provider("github").providerId("unread-reader").build());
        var marker = Instant.now().minusSeconds(60);
        participants.save(Participant.builder().chatRoomId(room.getId()).userId(user.getId())
            .role(Participant.Role.ADMIN).lastReadAt(marker).build());
        insert(room.getId(), "other", Message.MessageType.TEXT, marker.plusSeconds(1), false);
        insert(room.getId(), "other", Message.MessageType.TEXT, marker.plusSeconds(2), false);
        insert(room.getId(), user.getId(), Message.MessageType.TEXT, marker.plusSeconds(2), false);
        insert(room.getId(), "other", Message.MessageType.SYSTEM, marker.plusSeconds(2), false);
        insert(room.getId(), "other", Message.MessageType.TEXT, marker.plusSeconds(2), true);
        insert(room.getId(), "other", Message.MessageType.TEXT, marker, false);
        insert("different-room", "other", Message.MessageType.TEXT, marker.plusSeconds(2), false);
        assertThat(roomService.toResponse(room, user.getId()).unreadCount()).isEqualTo(2);
        participantService.markRead(room.getId(), user.getId());
        participantService.markRead(room.getId(), user.getId());
        assertThat(roomService.toResponse(room, user.getId()).unreadCount()).isZero();
        assertThat(participants.findByChatRoomIdAndUserId(room.getId(), user.getId()).orElseThrow().getRole())
            .isEqualTo(Participant.Role.ADMIN);
        participants.save(Participant.builder().chatRoomId(room.getId()).userId("legacy").role(Participant.Role.MEMBER).build());
        assertThat(roomService.toResponse(room, "legacy").unreadCount()).isZero();
        assertThatThrownBy(() -> participantService.markRead(room.getId(), "outsider"))
            .isInstanceOf(com.lnt.chatmee.exception.ChatRoomNotFoundException.class);
    }

    @Test
    void createParticipant_newMember_initializesReadMarker() {
        var room = rooms.save(ChatRoom.builder().name("Join test").type(ChatRoom.RoomType.PUBLIC).isActive(true).build());
        var before = Instant.now().minusMillis(1);
        participantService.createParticipant(room.getId(), "new-member", Participant.Role.MEMBER);
        var member = participants.findByChatRoomIdAndUserId(room.getId(), "new-member").orElseThrow();
        assertThat(member.getLastReadAt()).isAfterOrEqualTo(before).isBeforeOrEqualTo(Instant.now());
    }

    private void insert(String room, String sender, Message.MessageType type, Instant at, boolean deleted) {
        messages.save(Message.builder().chatRoomId(room).senderId(sender).type(type).content("test")
            .createdAt(at).updatedAt(at).isDeleted(deleted).build());
    }
}
