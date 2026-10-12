package com.lnt.chatmee.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.mongodb.test.autoconfigure.DataMongoTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.support.ContainersConfig;

@DataMongoTest
@ActiveProfiles("test")
@Import(ContainersConfig.class)
class ChatRoomRepositoryIT {

    @Autowired
    private ChatRoomRepository chatRoomRepository;

    @BeforeEach
    void seed() {
        chatRoomRepository.deleteAll();
        chatRoomRepository.save(room("r1", "General Chat", RoomType.PUBLIC, true));
        chatRoomRepository.save(room("r2", "C++ (beginners)", RoomType.PUBLIC, true));
        chatRoomRepository.save(room("r3", "General Secret", RoomType.PRIVATE, true));
        chatRoomRepository.save(room("r4", "General DM", RoomType.DIRECT_MESSAGE, true));
        chatRoomRepository.save(room("r5", "General Deleted", RoomType.PUBLIC, false));
        chatRoomRepository.save(room("r6", "General Joined", RoomType.PUBLIC, true));
    }

    @Test
    void findDiscoverable_regexCharactersInQuery_matchedLiterally() {
        assertThat(search(".*", List.of())).isEmpty();
        assertThat(search("(", List.of())).containsExactly("r2");
        assertThat(search("c++", List.of())).containsExactly("r2");
    }

    @Test
    void findDiscoverable_mixedRooms_returnsOnlyActivePublicNotExcluded() {
        assertThat(search("general", List.of("r6"))).containsExactly("r1");
        assertThat(search("", List.of("r6"))).containsExactlyInAnyOrder("r1", "r2");
    }

    private List<String> search(String query, List<String> excluded) {
        Page<ChatRoom> page = chatRoomRepository.findDiscoverable(query, excluded, PageRequest.of(0, 20));
        return page.getContent().stream().map(ChatRoom::getId).toList();
    }

    private static ChatRoom room(String id, String name, RoomType type, boolean active) {
        return ChatRoom.builder().id(id).name(name).type(type).isActive(active).build();
    }

    @Test
    void updateActivity_olderOrEqualWrite_keepsLatestSummaryAndOtherFields() {
        var time = java.time.Instant.parse("2026-10-12T10:00:00Z");
        var newest = new com.lnt.chatmee.dto.event.LastMessageSummary("m2", "u2", "Bob", "latest", time);
        var older = new com.lnt.chatmee.dto.event.LastMessageSummary("m1", "u1", "Alice", "older", time.minusSeconds(1));
        assertThat(chatRoomRepository.updateActivity("r1", time, newest)).isEqualTo(1);
        assertThat(chatRoomRepository.updateActivity("r1", older.createdAt(), older)).isZero();
        assertThat(chatRoomRepository.updateActivity("r1", time, older)).isZero();
        var room = chatRoomRepository.findById("r1").orElseThrow();
        assertThat(room.getLastActivityAt()).isEqualTo(time);
        assertThat(room.getLastMessage()).isEqualTo(newest);
        assertThat(room.getName()).isEqualTo("General Chat");
        assertThat(chatRoomRepository.updateActivity("r5", time, newest)).isZero();
    }

}
