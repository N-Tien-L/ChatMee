package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.bson.Document;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.lnt.chatmee.exception.InvitationNotPendingException;
import com.lnt.chatmee.exception.RoomCapacityExceededException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.MembershipRequest;
import com.lnt.chatmee.model.MembershipRequestKind;
import com.lnt.chatmee.model.MembershipRequestStatus;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MembershipRequestRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.support.ContainersConfig;

@SpringBootTest
@ActiveProfiles("test")
@Import(ContainersConfig.class)
class InvitationIT {

    private static final int THREADS = 20;

    @Autowired private InvitationService invitationService;
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
        userRepository.deleteAll();
        for (String id : List.of("owner", "bob", "carol")) {
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
    void accept_twentyConcurrentAcceptsOfOneInvitation_createOneMembership() throws Exception {
        String roomId = privateRoom(10);
        String invitationId = invitationService.invite(roomId, "owner", "bob").id();

        List<Future<Boolean>> results = runConcurrently(() -> {
            try {
                invitationService.accept(invitationId, "bob");
                return true;
            } catch (InvitationNotPendingException lost) {
                return false;
            }
        });

        assertThat(countSuccesses(results)).isEqualTo(1);
        assertThat(participantRepository.countByChatRoomId(roomId)).isEqualTo(2);
        assertThat(participantService.findMembership(roomId, "bob")).hasValueSatisfying(
                row -> assertThat(row.getRole()).isEqualTo(Role.MEMBER));
        assertThat(chatRoomRepository.findById(roomId).orElseThrow().getMemberCount()).isEqualTo(2);
        MembershipRequest stored = requests.findById(invitationId).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(MembershipRequestStatus.ACCEPTED);
        assertThat(stored.getDecidedAt()).isNotNull();
        assertThat(messageRepository.findAll()).filteredOn(m -> roomId.equals(m.getChatRoomId()))
                .extracting(Message::getContent).containsExactly("Bob joined");
    }

    @Test
    void accept_fullRoom_keepsInvitationPendingWithoutMembership() {
        String roomId = privateRoom(2);
        String invitationId = invitationService.invite(roomId, "owner", "bob").id();
        participantService.addParticipant(roomId, "carol", Role.MEMBER);

        assertThatThrownBy(() -> invitationService.accept(invitationId, "bob"))
                .isInstanceOf(RoomCapacityExceededException.class);

        MembershipRequest stored = requests.findById(invitationId).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(MembershipRequestStatus.PENDING);
        assertThat(stored.getDecidedAt()).isNull();
        assertThat(participantService.findMembership(roomId, "bob")).isEmpty();
        assertThat(chatRoomRepository.findById(roomId).orElseThrow().getMemberCount()).isEqualTo(2);
    }

    @Test
    void decline_pendingInvitation_storesDeclinedAndBlocksAccept() {
        String roomId = privateRoom(10);
        String invitationId = invitationService.invite(roomId, "owner", "bob").id();

        invitationService.decline(invitationId, "bob");

        assertThat(requests.findById(invitationId).orElseThrow().getStatus()).isEqualTo(MembershipRequestStatus.DECLINED);
        assertThatThrownBy(() -> invitationService.accept(invitationId, "bob"))
                .isInstanceOf(InvitationNotPendingException.class);
        assertThat(invitationService.listMine("bob")).isEmpty();
    }

    @Test
    void revoke_pendingInvitation_storesRevokedAndAllowsNewInvitation() {
        String roomId = privateRoom(10);
        String invitationId = invitationService.invite(roomId, "owner", "bob").id();

        invitationService.revoke(invitationId, "owner");

        assertThat(requests.findById(invitationId).orElseThrow().getStatus()).isEqualTo(MembershipRequestStatus.REVOKED);
        String second = invitationService.invite(roomId, "owner", "bob").id();
        assertThat(invitationService.listMine("bob")).extracting(i -> i.id()).containsExactly(second);
        assertThat(invitationService.listForRoom(roomId, "owner")).extracting(i -> i.invitee().id()).containsExactly("bob");
    }

    @Test
    void accept_expiredInvitation_storesExpiredAndThrowsNotPending() {
        String roomId = privateRoom(10);
        Instant past = Instant.now().minusSeconds(60);
        MembershipRequest expired = requests.insert(MembershipRequest.builder().kind(MembershipRequestKind.INVITE)
                .roomId(roomId).inviterId("owner").targetUserId("bob").status(MembershipRequestStatus.PENDING)
                .createdAt(past.minusSeconds(7 * 24 * 3600)).expiresAt(past).build());

        assertThat(invitationService.listMine("bob")).isEmpty();
        assertThatThrownBy(() -> invitationService.accept(expired.getId(), "bob"))
                .isInstanceOf(InvitationNotPendingException.class);
        assertThat(requests.findById(expired.getId()).orElseThrow().getStatus()).isEqualTo(MembershipRequestStatus.EXPIRED);
        assertThat(participantService.findMembership(roomId, "bob")).isEmpty();
    }

    @Test
    void insert_secondPendingForSameRoomAndPerson_isRejectedByPartialUniqueIndex() {
        String roomId = privateRoom(10);
        requests.insert(pending(roomId, MembershipRequestStatus.PENDING));
        requests.insert(pending(roomId, MembershipRequestStatus.DECLINED));

        assertThatThrownBy(() -> requests.insert(pending(roomId, MembershipRequestStatus.PENDING)))
                .isInstanceOf(DuplicateKeyException.class);
        List<Document> indexes = mongoTemplate.getCollection("membership_requests").listIndexes().into(new ArrayList<>());
        assertThat(indexes).extracting(index -> index.getString("name")).contains("membership_requests_room_target_pending",
                "membership_requests_target_kind_status", "membership_requests_room_status",
                "membership_requests_pair_cooldown");
        Document unique = indexes.stream()
                .filter(index -> "membership_requests_room_target_pending".equals(index.getString("name")))
                .findFirst().orElseThrow();
        assertThat(unique.getBoolean("unique")).isTrue();
        assertThat(unique.get("partialFilterExpression", Document.class)).isEqualTo(new Document("status", "PENDING"));
    }

    private MembershipRequest pending(String roomId, MembershipRequestStatus status) {
        Instant now = Instant.now();
        return MembershipRequest.builder().kind(MembershipRequestKind.INVITE).roomId(roomId).inviterId("owner")
                .targetUserId("bob").status(status).createdAt(now).expiresAt(now.plusSeconds(600)).build();
    }

    private String privateRoom(int maxParticipants) {
        String roomId = chatRoomRepository.save(ChatRoom.builder().name("Secret").type(RoomType.PRIVATE).isActive(true)
                .createdBy("owner").maxParticipants(maxParticipants).memberCount(1).build()).getId();
        participantService.createParticipant(roomId, "owner", Role.OWNER);
        return roomId;
    }

    private List<Future<Boolean>> runConcurrently(Callable<Boolean> body) throws InterruptedException {
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> futures = new ArrayList<>();
        for (int i = 0; i < THREADS; i++) {
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
}
