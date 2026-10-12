package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.support.ContainersConfig;

/** Owner transfer under real concurrency (ADR-0005: conditional updates, no transactions). */
@SpringBootTest
@ActiveProfiles("test")
@Import(ContainersConfig.class)
class RoomOwnershipIT {

    @Autowired private ChatRoomService chatRoomService;
    @Autowired private ChatRoomRepository chatRoomRepository;
    @Autowired private ParticipantRepository participantRepository;
    @Autowired private UserRepository userRepository;

    private ExecutorService pool;

    @BeforeEach
    void setUp() {
        participantRepository.deleteAll();
        chatRoomRepository.deleteAll();
        userRepository.deleteAll();
        for (int i = 0; i < 10; i++) {
            userRepository.save(User.builder().id("user-" + i).name("User " + i)
                    .provider("github").providerId("p-" + i).build());
        }
        pool = Executors.newFixedThreadPool(10);
    }

    @AfterEach
    void tearDown() {
        pool.shutdownNow();
    }

    @Test
    void leaveChatRoomById_ownerAndAdminsLeaveConcurrently_keepsExactlyOneOwner() throws Exception {
        // user-0 owns; user-1..4 are admins (the owner and all admins leave); user-5..7 stay.
        String roomId = room(8);
        addMember(roomId, "user-0", Role.OWNER, 0);
        for (int i = 1; i <= 4; i++) addMember(roomId, "user-" + i, Role.ADMIN, i);
        for (int i = 5; i <= 7; i++) addMember(roomId, "user-" + i, Role.MEMBER, i);

        List<String> leavers = List.of("user-0", "user-1", "user-2", "user-3", "user-4");
        CountDownLatch start = new CountDownLatch(1);
        List<Future<?>> results = new ArrayList<>();
        for (String leaver : leavers) {
            results.add(pool.submit(() -> {
                start.await();
                chatRoomService.leaveChatRoomById(leaver, roomId);
                return null;
            }));
        }
        start.countDown();
        for (Future<?> result : results) {
            result.get();
        }

        List<Participant> remaining = participantRepository.findByChatRoomId(roomId);
        assertThat(remaining).hasSize(3);
        assertThat(remaining.stream().filter(row -> row.getRole() == Role.OWNER).count()).isEqualTo(1);
        assertThat(chatRoomRepository.findById(roomId).orElseThrow().isActive()).isTrue();
    }

    @Test
    void leaveChatRoomById_soleOwnerLeaves_softDeletesRoomWithoutMemberships() {
        String roomId = room(1);
        addMember(roomId, "user-0", Role.OWNER, 0);

        chatRoomService.leaveChatRoomById("user-0", roomId);

        assertThat(chatRoomRepository.findById(roomId).orElseThrow().isActive()).isFalse();
        assertThat(participantRepository.countByChatRoomId(roomId)).isZero();
    }

    private String room(int memberCount) {
        return chatRoomRepository.save(ChatRoom.builder().name("Ownership room").type(RoomType.PUBLIC)
                .createdBy("user-0").isActive(true).memberCount(memberCount).maxParticipants(-1)
                .lastActivity(LocalDateTime.now()).build()).getId();
    }

    private void addMember(String roomId, String userId, Role role, int joinedMinute) {
        participantRepository.save(Participant.builder().chatRoomId(roomId).userId(userId).role(role)
                .joinedAt(LocalDateTime.of(2026, 10, 1, 10, joinedMinute)).lastSeenAt(LocalDateTime.now())
                .build());
    }
}
