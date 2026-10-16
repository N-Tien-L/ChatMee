package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
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
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.test.context.ActiveProfiles;

import com.lnt.chatmee.dto.request.ChatMessageRequest;
import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.DmRequestPendingException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.MembershipRequest;
import com.lnt.chatmee.model.MembershipRequestKind;
import com.lnt.chatmee.model.MembershipRequestStatus;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.RoomState;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MembershipRequestRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.support.ContainersConfig;

/** DM requests against real MongoDB (SPEC-009 AC-009-9..13, CM-072). */
@SpringBootTest
@ActiveProfiles("test")
@Import(ContainersConfig.class)
class DmRequestIT {

    private static final int THREADS = 20;

    @Autowired private ChatRoomService chatRoomService;
    @Autowired private DirectMessageRequestService dmRequests;
    @Autowired private MembershipRequestExpiryJob expiryJob;
    @Autowired private MessageService messageService;
    @Autowired private ParticipantService participantService;
    @Autowired private MembershipRequestRepository requests;
    @Autowired private ChatRoomRepository chatRoomRepository;
    @Autowired private ParticipantRepository participantRepository;
    @Autowired private MessageRepository messageRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private MongoTemplate mongoTemplate;

    private ExecutorService pool;

    @BeforeEach
    void setUp() {
        requests.deleteAll();
        participantRepository.deleteAll();
        chatRoomRepository.deleteAll();
        messageRepository.deleteAll();
        userRepository.deleteAll();
        for (String id : List.of("alice", "bob")) {
            userRepository.save(User.builder().id(id).name(id.substring(0, 1).toUpperCase() + id.substring(1))
                    .provider("github").providerId("p-" + id).build());
        }
        pool = Executors.newFixedThreadPool(THREADS);
    }

    @AfterEach
    void tearDown() {
        pool.shutdownNow();
    }

    @Test
    void createRoom_newPair_storesRequestedRoomWithSenderOnlyAndPendingRequest() {
        ChatRoomResponse created = chatRoomService.createRoom(dm("bob"), "alice");

        assertThat(created.state()).isEqualTo(RoomState.REQUESTED);
        assertThat(created.participants()).containsExactly("alice");
        ChatRoom stored = chatRoomRepository.findById(created.id()).orElseThrow();
        assertThat(stored.getState()).isEqualTo(RoomState.REQUESTED);
        assertThat(stored.getMemberCount()).isEqualTo(1);
        assertThat(stored.getMemberKey()).isEqualTo("alice:bob");
        assertThat(participantRepository.countByChatRoomId(created.id())).isEqualTo(1);
        MembershipRequest request = onlyRequest();
        assertThat(request.getKind()).isEqualTo(MembershipRequestKind.DM_REQUEST);
        assertThat(request.getStatus()).isEqualTo(MembershipRequestStatus.PENDING);
        assertThat(request.getPairKey()).isEqualTo("alice:bob");
        assertThat(request.getInviterId()).isEqualTo("alice");
        assertThat(request.getTargetUserId()).isEqualTo("bob");
        assertThat(Duration.between(request.getCreatedAt(), request.getExpiresAt())).isEqualTo(Duration.ofDays(14));

        // Same sender again: the existing room comes back (200 in the controller), still REQUESTED.
        assertThat(chatRoomService.findExistingDirectRoom(dm("bob"), "alice"))
                .hasValueSatisfying(again -> {
                    assertThat(again.id()).isEqualTo(created.id());
                    assertThat(again.state()).isEqualTo(RoomState.REQUESTED);
                });
        assertThat(dmRequests.listPending("bob")).singleElement()
                .satisfies(listed -> assertThat(listed.sender().name()).isEqualTo("Alice"));
        assertThat(chatRoomService.getList("bob")).isEmpty();
        assertThat(chatRoomService.getList("alice")).extracting(ChatRoom::getId).containsExactly(created.id());
    }

    @Test
    void findExistingDirectRoom_recipientCreatesSamePair_acceptsAndReturnsActiveRoom() {
        String roomId = chatRoomService.createRoom(dm("bob"), "alice").id();

        ChatRoomResponse resolved = chatRoomService.findExistingDirectRoom(dm("alice"), "bob").orElseThrow();

        assertThat(resolved.id()).isEqualTo(roomId);
        assertThat(resolved.state()).isEqualTo(RoomState.ACTIVE);
        assertActive(roomId);
    }

    @Test
    void accept_recipient_activatesRoomAddsMemberAndStoresAccepted() {
        String roomId = chatRoomService.createRoom(dm("bob"), "alice").id();

        dmRequests.accept(roomId, "bob");

        assertActive(roomId);
        assertThat(dmRequests.listPending("bob")).isEmpty();
        assertThat(chatRoomService.getList("bob")).extracting(ChatRoom::getId).containsExactly(roomId);
        assertThatThrownBy(() -> dmRequests.accept(roomId, "bob")).isInstanceOf(ChatRoomNotFoundException.class);
    }

    @Test
    void decline_recipient_softDeletesRoomClearsMemberKeyAndBlocksPairUntilCooldownEnds() {
        String roomId = chatRoomService.createRoom(dm("bob"), "alice").id();

        dmRequests.decline(roomId, "bob");

        ChatRoom stored = chatRoomRepository.findById(roomId).orElseThrow();
        assertThat(stored.isActive()).isFalse();
        assertThat(stored.getMemberKey()).isNull();
        assertThat(participantRepository.countByChatRoomId(roomId)).isZero();
        MembershipRequest request = onlyRequest();
        assertThat(request.getStatus()).isEqualTo(MembershipRequestStatus.DECLINED);
        assertThat(Duration.between(request.getDecidedAt(), request.getCooldownUntil())).isEqualTo(Duration.ofDays(30));
        assertThatThrownBy(() -> chatRoomService.createRoom(dm("bob"), "alice"))
                .isInstanceOf(ForbiddenActionException.class).hasMessage("Cannot message this user");

        mongoTemplate.updateFirst(Query.query(Criteria.where("_id").is(request.getId())),
                Update.update("cooldownUntil", Instant.now().minusSeconds(1)), MembershipRequest.class);
        ChatRoomResponse again = chatRoomService.createRoom(dm("bob"), "alice");
        assertThat(again.id()).isNotEqualTo(roomId);
        assertThat(again.state()).isEqualTo(RoomState.REQUESTED);
    }

    @Test
    void expiryJob_pastRequest_expiresSoftDeletesRoomWithoutCooldownAndKeepsFreshOnes() {
        String expiredRoom = chatRoomService.createRoom(dm("bob"), "alice").id();
        mongoTemplate.updateFirst(Query.query(Criteria.where("roomId").is(expiredRoom)),
                Update.update("expiresAt", Instant.now().minusSeconds(1)), MembershipRequest.class);
        userRepository.save(User.builder().id("carol").name("Carol").provider("github").providerId("p-carol").build());
        String freshRoom = chatRoomService.createRoom(dm("carol"), "alice").id();

        assertThat(expiryJob.expireDue(Instant.now())).isEqualTo(1);

        ChatRoom stored = chatRoomRepository.findById(expiredRoom).orElseThrow();
        assertThat(stored.isActive()).isFalse();
        assertThat(stored.getMemberKey()).isNull();
        assertThat(participantRepository.countByChatRoomId(expiredRoom)).isZero();
        assertThat(requests.findAll()).filteredOn(row -> expiredRoom.equals(row.getRoomId())).singleElement()
                .satisfies(row -> {
                    assertThat(row.getStatus()).isEqualTo(MembershipRequestStatus.EXPIRED);
                    assertThat(row.getCooldownUntil()).isNull();
                });
        assertThat(chatRoomRepository.findById(freshRoom).orElseThrow().isActive()).isTrue();
        assertThat(expiryJob.expireDue(Instant.now())).isZero();
        // No cooldown after expiry: the sender may ask again at once.
        assertThat(chatRoomService.createRoom(dm("bob"), "alice").state()).isEqualTo(RoomState.REQUESTED);
    }

    @Test
    void accept_expiredOnAccess_expiresRoomAndThrowsNotFound() {
        String roomId = chatRoomService.createRoom(dm("bob"), "alice").id();
        mongoTemplate.updateFirst(Query.query(Criteria.where("roomId").is(roomId)),
                Update.update("expiresAt", Instant.now().minusSeconds(1)), MembershipRequest.class);

        assertThatThrownBy(() -> dmRequests.accept(roomId, "bob")).isInstanceOf(ChatRoomNotFoundException.class);

        assertThat(onlyRequest().getStatus()).isEqualTo(MembershipRequestStatus.EXPIRED);
        assertThat(chatRoomRepository.findById(roomId).orElseThrow().isActive()).isFalse();
        assertThat(participantService.findMembership(roomId, "bob")).isEmpty();
    }

    @Test
    void acceptAndDecline_concurrentlyOnOneRequest_exactlyOneWinsWithConsistentState() throws Exception {
        String roomId = chatRoomService.createRoom(dm("bob"), "alice").id();
        CountDownLatch start = new CountDownLatch(1);
        List<Future<String>> futures = new ArrayList<>();
        for (int i = 0; i < THREADS; i++) {
            boolean accept = i % 2 == 0;
            futures.add(pool.submit(() -> {
                start.await();
                try {
                    if (accept) {
                        dmRequests.accept(roomId, "bob");
                    } else {
                        dmRequests.decline(roomId, "bob");
                    }
                    return accept ? "ACCEPTED" : "DECLINED";
                } catch (ChatRoomNotFoundException lost) {
                    return "LOST";
                }
            }));
        }
        start.countDown();
        List<String> outcomes = new ArrayList<>();
        for (Future<String> future : futures) outcomes.add(future.get(30, TimeUnit.SECONDS));

        List<String> winners = outcomes.stream().filter(outcome -> !outcome.equals("LOST")).toList();
        assertThat(winners).hasSize(1);
        MembershipRequest request = onlyRequest();
        assertThat(request.getStatus().name()).isEqualTo(winners.get(0));
        ChatRoom stored = chatRoomRepository.findById(roomId).orElseThrow();
        if (request.getStatus() == MembershipRequestStatus.ACCEPTED) {
            assertActive(roomId);
            assertThat(request.getCooldownUntil()).isNull();
        } else {
            assertThat(stored.isActive()).isFalse();
            assertThat(stored.getMemberKey()).isNull();
            assertThat(participantRepository.countByChatRoomId(roomId)).isZero();
            assertThat(request.getCooldownUntil()).isNotNull();
        }
    }

    @Test
    void sendMessage_senderSendsConcurrentlyWhileRequested_storesExactlyOneRequestMessage() throws Exception {
        String roomId = chatRoomService.createRoom(dm("bob"), "alice").id();
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> futures = new ArrayList<>();
        for (int i = 0; i < THREADS; i++) {
            String tempId = "t-" + i;
            futures.add(pool.submit(send(start, roomId, tempId)));
        }
        start.countDown();
        int sent = 0;
        for (Future<Boolean> future : futures) if (future.get(30, TimeUnit.SECONDS)) sent++;

        assertThat(sent).isEqualTo(1);
        assertThat(messageRepository.countByChatRoomId(roomId)).isEqualTo(1L);
        ChatRoom stored = chatRoomRepository.findById(roomId).orElseThrow();
        assertThat(stored.getLastMessage()).isNotNull();
        assertThat(dmRequests.listPending("bob")).singleElement()
                .satisfies(listed -> assertThat(listed.preview()).isEqualTo("hello bob"));
    }

    private Callable<Boolean> send(CountDownLatch start, String roomId, String tempId) {
        return () -> {
            start.await();
            ChatMessageRequest request = new ChatMessageRequest();
            request.setRoomId(roomId);
            request.setContent("hello bob");
            request.setTempId(tempId);
            try {
                messageService.sendMessage(request, "alice");
                return true;
            } catch (DmRequestPendingException rejected) {
                return false;
            }
        };
    }

    private void assertActive(String roomId) {
        ChatRoom stored = chatRoomRepository.findById(roomId).orElseThrow();
        assertThat(stored.isActive()).isTrue();
        assertThat(stored.getState()).isEqualTo(RoomState.ACTIVE);
        assertThat(stored.getMemberCount()).isEqualTo(2);
        assertThat(stored.getMemberKey()).isEqualTo("alice:bob");
        assertThat(participantRepository.countByChatRoomId(roomId)).isEqualTo(2);
        assertThat(participantService.findMembership(roomId, "bob")).hasValueSatisfying(
                row -> assertThat(row.getRole()).isEqualTo(Role.MEMBER));
        assertThat(onlyRequest().getStatus()).isEqualTo(MembershipRequestStatus.ACCEPTED);
    }

    private MembershipRequest onlyRequest() {
        List<MembershipRequest> rows = requests.findAll();
        assertThat(rows).hasSize(1);
        return rows.get(0);
    }

    private static CreateChatRoomRequest dm(String participantId) {
        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId(participantId);
        return request;
    }
}
