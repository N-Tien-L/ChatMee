package com.lnt.chatmee.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;

import com.lnt.chatmee.config.SecurityConfig;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.MembershipRequest;
import com.lnt.chatmee.model.MembershipRequestKind;
import com.lnt.chatmee.model.MembershipRequestStatus;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MembershipRequestRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.ChatRoomService;
import com.lnt.chatmee.service.InvitationService;
import com.lnt.chatmee.service.ParticipantService;
import com.lnt.chatmee.service.UserEventPublisher;
import com.lnt.chatmee.service.policy.DirectRoomPolicy;
import com.lnt.chatmee.service.policy.PrivateRoomPolicy;
import com.lnt.chatmee.service.policy.PublicRoomPolicy;
import com.lnt.chatmee.service.policy.RoomTypePolicyRegistry;
import com.lnt.chatmee.support.SecuredWebMvcTestSupport;
import com.lnt.chatmee.support.TestUsers;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/** Runs the real {@link InvitationService} and room policies with mocked persistence, so HTTP codes follow the real rules. */
@WebMvcTest(controllers = InvitationController.class, properties = "app.client.url=http://localhost:3000")
@ActiveProfiles("actuator-test")
@Import({SecurityConfig.class, InvitationService.class, RoomTypePolicyRegistry.class,
        PublicRoomPolicy.class, PrivateRoomPolicy.class, DirectRoomPolicy.class})
class InvitationControllerWebMvcTest extends SecuredWebMvcTestSupport {

    private static final String INVITE = "/api/v1/rooms/room-1/invitations";

    @MockitoBean MembershipRequestRepository requests;
    @MockitoBean ChatRoomRepository chatRoomRepository;
    @MockitoBean UserRepository userRepository;
    @MockitoBean ParticipantService participantService;
    @MockitoBean ChatRoomService chatRoomService;
    @MockitoBean UserEventPublisher userEvents;

    private ChatRoom room;
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private Logger serviceLogger;

    @BeforeEach
    void setUp() {
        room = ChatRoom.builder().id("room-1").name("Secret").type(RoomType.PRIVATE).isActive(true)
                .maxParticipants(5).memberCount(1).build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room-1")).thenReturn(Optional.of(room));
        when(userRepository.findById("u1")).thenReturn(Optional.of(User.builder().id("u1").name("Olivia")
                .email("olivia@example.test").build()));
        when(userRepository.findById("u2")).thenReturn(Optional.of(User.builder().id("u2").name("Bob").build()));
        when(requests.insert(any(MembershipRequest.class))).thenAnswer(call -> {
            MembershipRequest row = call.getArgument(0);
            row.setId("inv-1");
            return row;
        });
        serviceLogger = (Logger) LoggerFactory.getLogger(InvitationService.class);
        logs.start();
        serviceLogger.addAppender(logs);
    }

    @AfterEach
    void detachLogs() {
        serviceLogger.detachAppender(logs);
    }

    @Test
    void invite_owner_returns201WithInvitation() throws Exception {
        caller("u1", Role.OWNER);

        invite("u1", "{\"userId\":\"u2\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value("inv-1"))
                .andExpect(jsonPath("$.data.room.id").value("room-1"))
                .andExpect(jsonPath("$.data.room.name").value("Secret"))
                .andExpect(jsonPath("$.data.room.memberCount").value(1))
                .andExpect(jsonPath("$.data.inviter.id").value("u1"))
                .andExpect(jsonPath("$.data.inviter.name").value("Olivia"))
                .andExpect(jsonPath("$.data.inviter.email").doesNotExist())
                .andExpect(jsonPath("$.data.createdAt").isString())
                .andExpect(jsonPath("$.data.expiresAt").isString());
        verify(userEvents).invitationReceived(eq("u2"), any());
        assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage)
                .allSatisfy(line -> assertThat(line).doesNotContain("olivia@example.test").doesNotContain("Olivia"));
    }

    @Test
    void invite_admin_returns201() throws Exception {
        caller("u1", Role.ADMIN);

        invite("u1", "{\"userId\":\"u2\"}").andExpect(status().isCreated());
    }

    @Test
    void invite_inviterIdInBody_isIgnoredAndCallerIsInviter() throws Exception {
        caller("u1", Role.OWNER);

        invite("u1", "{\"userId\":\"u2\",\"inviterId\":\"u9\"}").andExpect(status().isCreated());

        verify(requests).insert(argThat((MembershipRequest row) -> row.getInviterId().equals("u1")));
    }

    @Test
    void invite_member_returns403Problem() throws Exception {
        caller("u1", Role.MEMBER);

        expectProblem(invite("u1", "{\"userId\":\"u2\"}"), 403, "FORBIDDEN_ACTION");
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    @Test
    void invite_nonMember_returns404Problem() throws Exception {
        expectProblem(invite("u1", "{\"userId\":\"u2\"}"), 404, "ROOM_NOT_FOUND");
        verify(requests, never()).insert(any(MembershipRequest.class));
    }

    @Test
    void invite_inviteeAlreadyMember_returns409Problem() throws Exception {
        caller("u1", Role.OWNER);
        caller("u2", Role.MEMBER);

        expectProblem(invite("u1", "{\"userId\":\"u2\"}"), 409, "ALREADY_PARTICIPANT");
    }

    @Test
    void invite_duplicatePending_returns409Problem() throws Exception {
        caller("u1", Role.OWNER);
        when(requests.findFirstByRoomIdAndTargetUserIdAndStatus("room-1", "u2", MembershipRequestStatus.PENDING))
                .thenReturn(Optional.of(MembershipRequest.builder().id("inv-0").kind(MembershipRequestKind.INVITE)
                        .status(MembershipRequestStatus.PENDING).expiresAt(Instant.now().plusSeconds(600)).build()));

        expectProblem(invite("u1", "{\"userId\":\"u2\"}"), 409, "DUPLICATE_RESOURCE");
    }

    @Test
    void invite_fullRoom_returns409Problem() throws Exception {
        caller("u1", Role.OWNER);
        room.setMemberCount(5);

        expectProblem(invite("u1", "{\"userId\":\"u2\"}"), 409, "ROOM_FULL");
    }

    @Test
    void invite_publicRoom_returns400Problem() throws Exception {
        caller("u1", Role.OWNER);
        room.setType(RoomType.PUBLIC);

        expectProblem(invite("u1", "{\"userId\":\"u2\"}"), 400, "INVALID_ARGUMENT");
    }

    @Test
    void invite_missingUserId_returns400ValidationProblem() throws Exception {
        expectProblem(invite("u1", "{}"), 400, "VALIDATION_FAILED")
                .andExpect(jsonPath("$.errors[?(@.field == 'userId')]").isNotEmpty());
        verifyNoInteractions(requests);
    }

    @Test
    void invite_withoutCsrf_returns403() throws Exception {
        mvc.perform(post(INVITE).with(oauth2Login().oauth2User(TestUsers.principal("u1")))
                .contentType(MediaType.APPLICATION_JSON).content("{\"userId\":\"u2\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(requests);
    }

    @Test
    void invite_unauthenticated_returns401() throws Exception {
        mvc.perform(post(INVITE).with(csrf().asHeader()).contentType(MediaType.APPLICATION_JSON).content("{\"userId\":\"u2\"}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(requests);
    }

    @Test
    void listMine_pendingInvitation_returnsInvitationShape() throws Exception {
        when(requests.findByTargetUserIdAndKindAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
                eq("u2"), eq(MembershipRequestKind.INVITE), eq(MembershipRequestStatus.PENDING), any()))
                .thenReturn(List.of(pending()));
        when(chatRoomRepository.findAllById(Set.of("room-1"))).thenReturn(List.of(room));
        when(userRepository.findAllById(Set.of("u1", "u2"))).thenReturn(List.of(
                User.builder().id("u1").name("Olivia").avatarUrl("o.png").build(), User.builder().id("u2").name("Bob").build()));

        mvc.perform(get("/api/v1/invitations").with(oauth2Login().oauth2User(TestUsers.principal("u2"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value("inv-1"))
                .andExpect(jsonPath("$.data[0].room.name").value("Secret"))
                .andExpect(jsonPath("$.data[0].inviter.avatarUrl").value("o.png"))
                .andExpect(jsonPath("$.data[0].expiresAt").isString());
    }

    @Test
    void listForRoom_member_returns403Problem() throws Exception {
        caller("u1", Role.MEMBER);

        expectProblem(mvc.perform(get(INVITE).with(oauth2Login().oauth2User(TestUsers.principal("u1")))), 403, "FORBIDDEN_ACTION");
    }

    @Test
    void accept_invitee_returns204() throws Exception {
        when(requests.findById("inv-1")).thenReturn(Optional.of(pending()));
        when(requests.decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.ACCEPTED))).thenReturn(1L);

        mvc.perform(post("/api/v1/invitations/inv-1/accept").with(oauth2Login().oauth2User(TestUsers.principal("u2"))).with(csrf().asHeader()))
                .andExpect(status().isNoContent());
        verify(participantService).insertMember("room-1", "u2", Role.MEMBER);
    }

    @Test
    void accept_notInvitee_returns404Problem() throws Exception {
        when(requests.findById("inv-1")).thenReturn(Optional.of(pending()));

        expectProblem(mvc.perform(post("/api/v1/invitations/inv-1/accept").with(oauth2Login().oauth2User(TestUsers.principal("u3"))).with(csrf().asHeader())),
                404, "INVITATION_NOT_FOUND");
        verify(requests, never()).decidePending(any(), any(), any());
    }

    @Test
    void accept_revokedInvitation_returns409Problem() throws Exception {
        MembershipRequest revoked = pending();
        revoked.setStatus(MembershipRequestStatus.REVOKED);
        when(requests.findById("inv-1")).thenReturn(Optional.of(revoked));

        expectProblem(mvc.perform(post("/api/v1/invitations/inv-1/accept").with(oauth2Login().oauth2User(TestUsers.principal("u2"))).with(csrf().asHeader())),
                409, "INVITATION_NOT_PENDING");
    }

    @Test
    void decline_invitee_returns204() throws Exception {
        when(requests.findById("inv-1")).thenReturn(Optional.of(pending()));
        when(requests.decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.DECLINED))).thenReturn(1L);

        mvc.perform(post("/api/v1/invitations/inv-1/decline").with(oauth2Login().oauth2User(TestUsers.principal("u2"))).with(csrf().asHeader()))
                .andExpect(status().isNoContent());
    }

    @Test
    void revoke_inviter_returns204() throws Exception {
        when(requests.findById("inv-1")).thenReturn(Optional.of(pending()));
        when(requests.decidePending(eq("inv-1"), any(), eq(MembershipRequestStatus.REVOKED))).thenReturn(1L);

        mvc.perform(delete("/api/v1/invitations/inv-1").with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader()))
                .andExpect(status().isNoContent());
    }

    @Test
    void revoke_unrelatedUser_returns404Problem() throws Exception {
        when(requests.findById("inv-1")).thenReturn(Optional.of(pending()));

        expectProblem(mvc.perform(delete("/api/v1/invitations/inv-1").with(oauth2Login().oauth2User(TestUsers.principal("u3"))).with(csrf().asHeader())),
                404, "INVITATION_NOT_FOUND");
    }

    private ResultActions invite(String userId, String body) throws Exception {
        return mvc.perform(post(INVITE).with(oauth2Login().oauth2User(TestUsers.principal(userId))).with(csrf().asHeader())
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private void caller(String userId, Role role) {
        when(participantService.findMembership("room-1", userId)).thenReturn(Optional.of(
                Participant.builder().chatRoomId("room-1").userId(userId).role(role).build()));
    }

    private static MembershipRequest pending() {
        Instant now = Instant.now();
        return MembershipRequest.builder().id("inv-1").kind(MembershipRequestKind.INVITE).roomId("room-1")
                .inviterId("u1").targetUserId("u2").status(MembershipRequestStatus.PENDING)
                .createdAt(now).expiresAt(now.plusSeconds(600)).build();
    }
}
