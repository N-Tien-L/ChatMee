package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.context.ActiveProfiles;

import com.lnt.chatmee.exception.RoomCapacityExceededException;
import com.lnt.chatmee.exception.UserAlreadyInRoomException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.support.ContainersConfig;

@SpringBootTest
@ActiveProfiles("test")
@Import(ContainersConfig.class)
class RoomMembershipIT {

    private static final int THREADS = 20;

    @Autowired private ParticipantService participantService;
    @Autowired private MessageService messageService;
    @Autowired private com.lnt.chatmee.security.AuthChannelInterceptor authChannelInterceptor;
    @Autowired private ChatRoomRepository chatRoomRepository;
    @Autowired private ParticipantRepository participantRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private MongoTemplate mongoTemplate;

    private ExecutorService pool;

    @BeforeEach
    void setUp() {
        participantRepository.deleteAll();
        chatRoomRepository.deleteAll();
        userRepository.deleteAll();
        for (int i = 0; i < THREADS; i++) {
            userRepository.save(User.builder().id("user-" + i).name("User " + i)
                    .provider("github").providerId("p-" + i).build());
        }
        pool = Executors.newFixedThreadPool(THREADS);
    }

    @AfterEach
    void tearDown() {
        pool.shutdownNow();
    }

    @Test
    void addParticipant_twentyConcurrentJoinsWithCapacityTen_exactlyTenSucceed() throws Exception {
        String roomId = room(10, 0).getId();

        List<Future<Boolean>> results = runConcurrently(i -> () -> {
            try {
                participantService.addParticipant(roomId, "user-" + i, Role.MEMBER);
                return true;
            } catch (RoomCapacityExceededException full) {
                return false;
            }
        });

        assertThat(countSuccesses(results)).isEqualTo(10);
        assertThat(participantRepository.countByChatRoomId(roomId)).isEqualTo(10);
        assertThat(chatRoomRepository.findById(roomId).orElseThrow().getMemberCount()).isEqualTo(10);
    }

    @Test
    void addParticipant_sameUserJoiningConcurrently_storesOneMembership() throws Exception {
        // Capacity above the thread count: losing duplicates hold a seat until the unique index rejects them,
        // so a nearly full room may answer "full" instead of "already a member" (see ADR-0005).
        String roomId = room(THREADS + 1, 0).getId();

        List<Future<Boolean>> results = runConcurrently(i -> () -> {
            try {
                participantService.addParticipant(roomId, "user-0", Role.MEMBER);
                return true;
            } catch (UserAlreadyInRoomException duplicate) {
                return false;
            }
        });

        assertThat(countSuccesses(results)).isEqualTo(1);
        assertThat(participantRepository.countByChatRoomId(roomId)).isEqualTo(1);
        assertThat(chatRoomRepository.findById(roomId).orElseThrow().getMemberCount())
                .as("seats taken by losing duplicates are given back").isEqualTo(1);
    }

    @Test
    void removeParticipant_member_givesSeatBack() {
        String roomId = room(1, 0).getId();
        participantService.addParticipant(roomId, "user-0", Role.MEMBER);

        assertThat(participantService.removeParticipant(roomId, "user-0")).isTrue();
        participantService.addParticipant(roomId, "user-1", Role.MEMBER);

        assertThat(chatRoomRepository.findById(roomId).orElseThrow().getMemberCount()).isEqualTo(1);
        assertThat(participantService.getParticipantUserIds(roomId)).containsExactly("user-1");
    }

    @Test
    void reserveSeat_unlimitedRoomAndLegacyRoomWithoutCounter_allowsJoin() {
        ChatRoom unlimited = room(-1, 0);
        assertThat(chatRoomRepository.reserveSeat(unlimited.getId(), LocalDateTime.now())).isEqualTo(1);

        ChatRoom legacy = room(2, 0);
        mongoTemplate.updateFirst(Query.query(Criteria.where("_id").is(legacy.getId())),
                new org.springframework.data.mongodb.core.query.Update().unset("memberCount"), ChatRoom.class);
        assertThat(chatRoomRepository.reserveSeat(legacy.getId(), LocalDateTime.now())).isEqualTo(1);
    }

    @Test
    void updateEditableFields_capacityBelowMembers_isRejectedAndKeepsCounter() {
        ChatRoom room = room(10, 3);
        ChatRoom.RoomSettings settings = ChatRoom.RoomSettings.builder().allowFileSharing(true).build();

        assertThat(chatRoomRepository.updateEditableFields(room.getId(), "Renamed", "d", 2, settings, LocalDateTime.now()))
                .isZero();
        assertThat(chatRoomRepository.updateEditableFields(room.getId(), "Renamed", "d", 3, settings, LocalDateTime.now()))
                .isEqualTo(1);

        ChatRoom updated = chatRoomRepository.findById(room.getId()).orElseThrow();
        assertThat(updated.getName()).isEqualTo("Renamed");
        assertThat(updated.getMaxParticipants()).isEqualTo(3);
        assertThat(updated.getMemberCount()).isEqualTo(3);
        assertThat(updated.getSettings().isAllowFileSharing()).isTrue();
    }

    @Test
    void softDelete_activeRoom_hidesRoomAndBlocksJoins() {
        ChatRoom room = room(10, 0);
        participantService.addParticipant(room.getId(), "user-0", Role.MEMBER);

        assertThat(chatRoomRepository.softDelete(room.getId(), LocalDateTime.now())).isEqualTo(1);
        participantService.removeAllParticipants(room.getId());

        assertThat(chatRoomRepository.findByIdAndIsActiveTrue(room.getId())).isEmpty();
        ChatRoom stored = chatRoomRepository.findById(room.getId()).orElseThrow();
        assertThat(stored.getDeletedAt()).isNotNull();
        assertThat(stored.getMemberCount()).isZero();
        assertThat(participantRepository.countByChatRoomId(room.getId())).isZero();
        assertThat(chatRoomRepository.reserveSeat(room.getId(), LocalDateTime.now())).isZero();
        assertThatThrownBy(() -> participantService.addParticipant(room.getId(), "user-1", Role.MEMBER))
                .isInstanceOf(com.lnt.chatmee.exception.ChatRoomNotFoundException.class);
    }

    @Test
    void save_newRoom_fillsCreatedAtByAuditing() {
        assertThat(room(10, 0).getCreatedAt()).isNotNull();
    }

    @Test
    void softDelete_orphanMembership_deniesMessageAndStompAuthorization() {
        ChatRoom room = room(10, 0);
        chatRoomRepository.softDelete(room.getId(), LocalDateTime.now());
        // Reproduce the post-delete insert window of a join that already reserved its seat.
        participantService.createParticipant(room.getId(), "user-0", Role.MEMBER);
        assertThat(participantRepository.existsByChatRoomIdAndUserId(room.getId(), "user-0")).isTrue();
        assertThat(participantService.isUserParticipant(room.getId(), "user-0")).isFalse();
        for (String destination : List.of("/topic/public/", "/topic/typing/")) {
            var headers = org.springframework.messaging.simp.stomp.StompHeaderAccessor.create(
                org.springframework.messaging.simp.stomp.StompCommand.SUBSCRIBE);
            headers.setUser(() -> "user-0"); headers.setDestination(destination + room.getId());
            var frame = org.springframework.messaging.support.MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
            assertThatThrownBy(() -> authChannelInterceptor.preSend(frame, null))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        }
        var request = new com.lnt.chatmee.dto.request.ChatMessageRequest();
        request.setRoomId(room.getId()); request.setContent("Blocked");
        request.setMessageType(com.lnt.chatmee.model.Message.MessageType.TEXT);
        assertThatThrownBy(() -> messageService.sendMessage(request, "user-0"))
            .isInstanceOf(com.lnt.chatmee.exception.ForbiddenActionException.class);
        assertThatThrownBy(() -> messageService.getRecentMessages(room.getId(), "user-0"))
            .isInstanceOf(com.lnt.chatmee.exception.ForbiddenActionException.class);
    }

    private ChatRoom room(int maxParticipants, int memberCount) {
        return chatRoomRepository.save(ChatRoom.builder().name("Room").type(RoomType.PUBLIC).isActive(true)
                .maxParticipants(maxParticipants).memberCount(memberCount).build());
    }

    private List<Future<Boolean>> runConcurrently(java.util.function.IntFunction<Callable<Boolean>> task)
            throws InterruptedException {
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> futures = new ArrayList<>();
        for (int i = 0; i < THREADS; i++) {
            Callable<Boolean> body = task.apply(i);
            futures.add(pool.submit(() -> {
                start.await();
                return body.call();
            }));
        }
        start.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        return futures;
    }

    private static long countSuccesses(List<Future<Boolean>> results) throws Exception {
        long successes = 0;
        for (Future<Boolean> result : results) {
            if (result.get()) {
                successes++;
            }
        }
        return successes;
    }

    @Test
    void save_secondActiveDirectRoomForSamePair_isRejectedByUniqueMemberKey() {
        chatRoomRepository.save(ChatRoom.builder().type(ChatRoom.RoomType.DIRECT_MESSAGE)
                .memberKey("user-0:user-1").isActive(true).maxParticipants(2).build());

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> chatRoomRepository.save(ChatRoom.builder()
                        .type(ChatRoom.RoomType.DIRECT_MESSAGE).memberKey("user-0:user-1").isActive(true).maxParticipants(2).build()))
                .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
        // Group rooms have no key and never collide (sparse index).
        chatRoomRepository.save(ChatRoom.builder().type(ChatRoom.RoomType.PUBLIC).name("a").isActive(true).build());
        chatRoomRepository.save(ChatRoom.builder().type(ChatRoom.RoomType.PUBLIC).name("b").isActive(true).build());
    }

    @Test
    void softDelete_directRoom_releasesMemberKeyForANewDm() {
        ChatRoom first = chatRoomRepository.save(ChatRoom.builder().type(ChatRoom.RoomType.DIRECT_MESSAGE)
                .memberKey("user-0:user-1").isActive(true).maxParticipants(2).build());

        chatRoomRepository.softDelete(first.getId(), java.time.LocalDateTime.now());

        org.assertj.core.api.Assertions.assertThat(chatRoomRepository.findById(first.getId()).orElseThrow().getMemberKey()).isNull();
        org.assertj.core.api.Assertions.assertThat(chatRoomRepository.findByMemberKeyAndIsActiveTrue("user-0:user-1")).isEmpty();
        chatRoomRepository.save(ChatRoom.builder().type(ChatRoom.RoomType.DIRECT_MESSAGE)
                .memberKey("user-0:user-1").isActive(true).maxParticipants(2).build());
    }
}
