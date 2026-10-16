package com.lnt.chatmee.service;

import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.UnauthorizedRoomActionException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.exception.ErrorCode;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import com.lnt.chatmee.security.RoomSubscriptionInterceptor;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.RoomState;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import com.lnt.chatmee.dto.response.PublicRoomSummary;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Spy;
import com.lnt.chatmee.service.policy.*;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ChatRoomServiceTest {

    @Mock
    private ChatRoomRepository chatRoomRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ParticipantService participantService;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Spy RoomTypePolicyRegistry policies = new RoomTypePolicyRegistry(List.of(
        new PublicRoomPolicy(), new PrivateRoomPolicy(), new DirectRoomPolicy()));
    @Mock UserEventPublisher userEvents;
    @Mock DirectMessageRequestService dmRequests;
    @Mock RateLimitingService rateLimitingService;
    @Mock com.lnt.chatmee.repository.ParticipantRepository participantRepository;
    @Mock BlockService blocks;

    @InjectMocks
    private ChatRoomService chatRoomService;

    @Test
    void createRoom_directRoom_createsRequestedRoomWithOnlySenderAndOpensRequest() {
        User creator = User.builder().id("user1").build();
        User participant = User.builder().id("user2").build();

        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(creator));
        when(userRepository.findById("user2")).thenReturn(Optional.of(participant));

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId("user2");

        ChatRoom savedRoom = ChatRoom.builder()
                .id("room1")
                .type(ChatRoom.RoomType.DIRECT_MESSAGE)
                .state(RoomState.REQUESTED)
                .createdBy("user1")
                .build();
        when(chatRoomRepository.save(any(ChatRoom.class))).thenReturn(savedRoom);
        when(participantService.getParticipantUserIds(List.of("room1"))).thenReturn(Map.of("room1", Set.of("user1")));

        ChatRoomResponse response = chatRoomService.createRoom(request, "user1");

        // AC-009-9: only the sender is a member until the recipient accepts; the recipient gets DM_REQUEST_RECEIVED.
        verify(userEvents).roomAdded("user1", response);
        verifyNoMoreInteractions(userEvents);
        assertThat(response.id()).isEqualTo("room1");
        assertThat(response.state()).isEqualTo(RoomState.REQUESTED);
        assertThat(response.participants()).containsExactly("user1");
        ArgumentCaptor<ChatRoom> saved = ArgumentCaptor.forClass(ChatRoom.class);
        verify(chatRoomRepository).save(saved.capture());
        assertThat(saved.getValue().getState()).isEqualTo(RoomState.REQUESTED);
        assertThat(saved.getValue().getMemberCount()).isEqualTo(1);
        assertThat(saved.getValue().getMaxParticipants()).isEqualTo(2);
        assertThat(saved.getValue().getMemberKey()).isEqualTo("user1:user2");
        InOrder order = inOrder(dmRequests, chatRoomRepository, participantService);
        order.verify(dmRequests).checkCanRequest("user1", "user2");
        order.verify(chatRoomRepository).save(any(ChatRoom.class));
        order.verify(participantService).createParticipant("room1", "user1", Participant.Role.OWNER);
        order.verify(dmRequests).open(savedRoom, "user1", "user2");
        verify(participantService, never()).createParticipant(eq("room1"), eq("user2"), any());
    }

    @Test
    void createRoom_dailyRoomLimitReached_throwsRateLimitWithoutSaving() {
        when(userRepository.findById("user1")).thenReturn(Optional.of(User.builder().id("user1").build()));
        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.PUBLIC);
        request.setRoomName("General");
        doThrow(new com.lnt.chatmee.exception.RateLimitExceededException(60)).when(rateLimitingService)
                .checkDailyAction(RateLimitingService.DailyAction.ROOM_CREATE, "user1");

        assertThatThrownBy(() -> chatRoomService.createRoom(request, "user1"))
                .isInstanceOf(com.lnt.chatmee.exception.RateLimitExceededException.class);
        verify(chatRoomRepository, never()).save(any());
    }

    @Test
    void createRoom_directRoomDuringDeclineCooldown_throwsForbiddenWithoutSaving() {
        when(userRepository.findById("user1")).thenReturn(Optional.of(User.builder().id("user1").build()));
        when(userRepository.findById("user2")).thenReturn(Optional.of(User.builder().id("user2").build()));
        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId("user2");
        doThrow(new com.lnt.chatmee.exception.ForbiddenActionException("Cannot message this user"))
                .when(dmRequests).checkCanRequest("user1", "user2");

        assertThatThrownBy(() -> chatRoomService.createRoom(request, "user1"))
                .isInstanceOf(com.lnt.chatmee.exception.ForbiddenActionException.class)
                .hasMessage("Cannot message this user");
        verify(chatRoomRepository, never()).save(any());
    }

    @Test
    void findExistingDirectRoom_requestedPair_appliesSamePairRulesForCaller() {
        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId("user1");
        ChatRoom requested = ChatRoom.builder().id("dm").type(ChatRoom.RoomType.DIRECT_MESSAGE)
                .state(RoomState.REQUESTED).memberKey("user1:user2").build();
        when(chatRoomRepository.findByMemberKeyAndIsActiveTrue("user1:user2")).thenReturn(Optional.of(requested));
        ChatRoomResponse accepted = ChatRoomResponse.builder().id("dm").state(RoomState.ACTIVE).build();
        when(dmRequests.resolveRequested(requested, "user2")).thenReturn(Optional.of(accepted));

        assertThat(chatRoomService.findExistingDirectRoom(request, "user2")).contains(accepted);
    }

    @Test
    void createRoom_configurableRoom_createsSuccessfully() {
        User creator = User.builder().id("user1").build();

        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(creator));

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.PUBLIC);
        request.setRoomName("General");

        ChatRoom savedRoom = ChatRoom.builder()
                .id("room1")
                .type(ChatRoom.RoomType.PUBLIC)
                .createdBy("user1")
                .build();
        when(chatRoomRepository.save(any(ChatRoom.class))).thenReturn(savedRoom);

        ChatRoomResponse response = chatRoomService.createRoom(request, "user1");

        assertThat(response.id()).isEqualTo("room1");
        ArgumentCaptor<ChatRoom> saved = ArgumentCaptor.forClass(ChatRoom.class);
        verify(chatRoomRepository).save(saved.capture());
        assertThat(saved.getValue().getMemberCount()).isEqualTo(1);
        verify(userEvents).roomAdded("user1", response);
        verifyNoMoreInteractions(userEvents);
        assertThat(saved.getValue().getMaxParticipants()).isEqualTo(-1);
        assertThat(saved.getValue().getId()).as("id is generated by MongoDB").isNull();
        verify(participantService).createParticipant("room1", "user1", Participant.Role.OWNER);
    }

    @Test
    void createRoom_configurableRoomWithSettings_createsSuccessfully() {
        User creator = User.builder().id("user1").build();

        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(creator));

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.PRIVATE);
        request.setRoomName("Private Room");
        request.setDescription("Desc");
        request.setMaxUsers(5);
        request.setSettings(new com.lnt.chatmee.dto.request.RoomSettingsRequest(false, true, false, null));

        ChatRoom savedRoom = ChatRoom.builder()
                .id("room2")
                .type(ChatRoom.RoomType.PRIVATE)
                .createdBy("user1")
                .build();
        when(chatRoomRepository.save(any(ChatRoom.class))).thenReturn(savedRoom);

        ChatRoomResponse response = chatRoomService.createRoom(request, "user1");

        verify(userEvents).roomAdded("user1", response);
        assertThat(response.id()).isEqualTo("room2");
        ArgumentCaptor<ChatRoom> saved = ArgumentCaptor.forClass(ChatRoom.class);
        verify(chatRoomRepository).save(saved.capture());
        assertThat(saved.getValue().getMaxParticipants()).isEqualTo(5);
        assertThat(saved.getValue().getSettings().isAllowGuestUsers()).isTrue();
    }

    @Test
    void discoverRooms_excludesJoinedPrivateDirectAndDeletedRooms() {
        ChatRoom open = ChatRoom.builder().id("open").name("Open").type(ChatRoom.RoomType.PUBLIC)
                .memberCount(2).maxParticipants(10).isActive(true).build();
        when(participantService.getRoomIdsOfUser("user1")).thenReturn(List.of("joined"));
        when(chatRoomRepository.findDiscoverable(eq("op"), eq(List.of("joined")), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(open)));

        Page<PublicRoomSummary> result = chatRoomService.discoverRooms("user1", " op ", 0, 20);

        assertThat(result.getContent()).singleElement().satisfies(r -> {
            assertThat(r.id()).isEqualTo("open");
            assertThat(r.memberCount()).isEqualTo(2);
            assertThat(r.maxMembers()).isEqualTo(10);
        });
        // PUBLIC/active filtering lives in the repository query; the service passes the caller's joined rooms.
        verify(chatRoomRepository).findDiscoverable(eq("op"), eq(List.of("joined")), any(Pageable.class));
    }

    @Test
    void discoverRooms_oversizedOrInvalidPaging_clampsPageAndSize() {
        when(participantService.getRoomIdsOfUser("user1")).thenReturn(List.of());
        when(chatRoomRepository.findDiscoverable(anyString(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        chatRoomService.discoverRooms("user1", null, -3, 500);
        chatRoomService.discoverRooms("user1", "", 2, 0);

        verify(chatRoomRepository, times(2)).findDiscoverable(eq(""), any(), pageable.capture());
        assertThat(pageable.getAllValues().get(0).getPageNumber()).isZero();
        assertThat(pageable.getAllValues().get(0).getPageSize()).isEqualTo(50);
        assertThat(pageable.getAllValues().get(1).getPageNumber()).isEqualTo(2);
        assertThat(pageable.getAllValues().get(1).getPageSize()).isEqualTo(20);
    }

    @Test
    void getList_returnsUserRooms() {
        User user = User.builder().id("user1").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));
        when(participantService.getMemberships("user1")).thenReturn(memberships("user1", "room1"));

        ChatRoom room = ChatRoom.builder().id("room1").build();
        when(chatRoomRepository.findByIdInAndIsActiveTrue(List.of("room1")))
                .thenReturn(List.of(room));

        List<ChatRoom> rooms = chatRoomService.getList("user1");

        assertThat(rooms).hasSize(1);
        assertThat(rooms.get(0).getId()).isEqualTo("room1");
    }

    @Test
    void getList_noMemberships_returnsEmptyWithoutRoomQuery() {
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(User.builder().id("user1").build()));
        when(participantService.getMemberships("user1")).thenReturn(List.of());

        assertThat(chatRoomService.getList("user1")).isEmpty();
        verifyNoInteractions(chatRoomRepository);
    }

    @Test
    void toResponses_severalRooms_loadsMembersOnce() {
        ChatRoom first = ChatRoom.builder().id("room1").build();
        ChatRoom second = ChatRoom.builder().id("room2").build();
        when(participantService.getParticipantUserIds(List.of("room1", "room2")))
                .thenReturn(Map.of("room1", Set.of("user1")));

        List<ChatRoomResponse> responses = chatRoomService.toResponses(List.of(first, second), "user1");

        assertThat(responses.get(0).participants()).containsExactly("user1");
        assertThat(responses.get(1).participants()).isEmpty();
        verify(participantService, never()).getParticipantUserIds(anyString());
    }

    @Test
    void getChatRoomById_isParticipant_returnsRoom() {
        User user = User.builder().id("user1").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder().id("room1").build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);

        ChatRoom result = chatRoomService.getChatRoomById("user1", "room1");

        assertThat(result.getId()).isEqualTo("room1");
    }

    @Test
    void getChatRoomById_nonParticipant_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));

        when(chatRoomRepository.findByIdAndIsActiveTrue("room1"))
                .thenReturn(Optional.of(ChatRoom.builder().id("room1").build()));
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(false);

        assertThatThrownBy(() -> chatRoomService.getChatRoomById("user1", "room1"))
                .isInstanceOf(ChatRoomNotFoundException.class);
    }

    @Test
    void getChatRoomById_deletedRoom_throwsNotFound() {
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(User.builder().id("user1").build()));
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> chatRoomService.getChatRoomById("user1", "room1"))
                .isInstanceOf(ChatRoomNotFoundException.class);
    }

    @Test
    void updateChatRoomById_creator_updatesSuccessfully() {
        User user = User.builder().id("user1").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.PUBLIC)
                .name("Old")
                .maxParticipants(5)
                .build();
        ChatRoom updatedRoom = ChatRoom.builder().id("room1").name("New Name").build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1"))
                .thenReturn(Optional.of(room), Optional.of(updatedRoom));
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
        when(participantService.findMembership("room1", "user1")).thenReturn(Optional.of(member(Role.OWNER)));
        when(chatRoomRepository.updateEditableFields(eq("room1"), eq("New Name"), eq("New Desc"), eq(10),
                argThat(settings -> settings != null && settings.isAllowFileSharing()
                        && "Welcome".equals(settings.getWelcomeMessage())), any())).thenReturn(1L);

        UpdateChatRoomRequest request = new UpdateChatRoomRequest();
        request.setRoomName(" New Name ");
        request.setDescription("New Desc");
        request.setMaxUsers(10);
        request.setSettings(new com.lnt.chatmee.dto.request.RoomSettingsRequest(true, false, false, "Welcome"));

        when(participantService.getParticipantUserIds("room1")).thenReturn(Set.of("user1", "user2"));
        when(participantService.getParticipantUserIds(List.of("room1"))).thenReturn(Map.of("room1", Set.of("user1", "user2")));
        ChatRoom result = chatRoomService.updateChatRoomById("user1", "room1", request);

        verify(userEvents).roomUpdated(eq("user1"), argThat(r -> r.roomName().equals("New Name")));
        verify(userEvents).roomUpdated(eq("user2"), argThat(r -> r.roomName().equals("New Name")));
        verifyNoMoreInteractions(userEvents);
        assertThat(result.getName()).isEqualTo("New Name");
        verify(chatRoomRepository, never()).save(any());
    }

    @Test
    void updateChatRoomById_emptyRequest_keepsCurrentValues() {
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(User.builder().id("user1").build()));
        ChatRoom.RoomSettings settings = ChatRoom.RoomSettings.builder().build();
        ChatRoom room = ChatRoom.builder().id("room1").createdBy("user1").type(ChatRoom.RoomType.PUBLIC)
                .name("Name").description("Desc").maxParticipants(-1).settings(settings).build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
        when(participantService.findMembership("room1", "user1")).thenReturn(Optional.of(member(Role.OWNER)));
        when(chatRoomRepository.updateEditableFields(eq("room1"), eq("Name"), eq("Desc"), eq(-1), eq(settings), any()))
                .thenReturn(1L);

        chatRoomService.updateChatRoomById("user1", "room1", new UpdateChatRoomRequest());
        verifyNoInteractions(userEvents);

        verify(chatRoomRepository).updateEditableFields(eq("room1"), eq("Name"), eq("Desc"), eq(-1), eq(settings), any());
    }

    @Test
    void updateChatRoomById_nonCreator_throwsException() {
        User user = User.builder().id("user2").build();
        when(userRepository.findById("user2"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user2")).thenReturn(true);
        when(participantService.findMembership("room1", "user2")).thenReturn(Optional.of(member(Role.MEMBER)));

        UpdateChatRoomRequest request = new UpdateChatRoomRequest();

        assertThatThrownBy(() -> chatRoomService.updateChatRoomById("user2", "room1", request))
                .isInstanceOf(UnauthorizedRoomActionException.class);
        verify(chatRoomRepository, never()).updateEditableFields(any(), any(), any(), anyInt(), any(), any());
    }

    @Test
    void deleteChatRoomById_creator_softDeletesCleansUpAndBroadcasts() {
        User user = User.builder().id("user1").name("Alice").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.findMembership("room1", "user1")).thenReturn(Optional.of(member(Role.OWNER)));
        when(chatRoomRepository.softDelete(eq("room1"), any())).thenReturn(1L);
        when(participantService.removeAllParticipants("room1")).thenReturn(3L);
        when(participantService.getParticipantUserIds("room1")).thenReturn(Set.of("user1", "user2", "user3"));

        chatRoomService.deleteChatRoomById("user1", "room1");

        verify(chatRoomRepository, never()).delete(any());
        verify(participantService).removeAllParticipants("room1");
        verify(userEvents).roomRemoved(Set.of("user1", "user2", "user3"), "room1", "DELETED");
        verifyNoMoreInteractions(userEvents);
        ArgumentCaptor<ChatMessageResponse> event = ArgumentCaptor.forClass(ChatMessageResponse.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> headers = ArgumentCaptor.forClass(Map.class);
        var order = inOrder(participantService, chatRoomRepository, messagingTemplate);
        order.verify(participantService).getParticipantUserIds("room1");
        order.verify(chatRoomRepository).softDelete(eq("room1"), any());
        order.verify(participantService).removeAllParticipants("room1");
        order.verify(messagingTemplate).convertAndSend(eq("/topic/rooms/room1"), event.capture(), headers.capture());
        assertThat(headers.getValue().get(RoomSubscriptionInterceptor.ROOM_DELETED_RECIPIENTS_HEADER))
                .isEqualTo(Set.of("user1", "user2", "user3"));
        assertThat(headers.getValue()).doesNotContainKey("nativeHeaders");
        assertThat(event.getValue().type()).isEqualTo(Message.MessageType.SYSTEM);
        assertThat(event.getValue().content()).isEqualTo(ChatRoomService.ROOM_DELETED_MESSAGE);
        assertThat(event.getValue().chatRoomId()).isEqualTo("room1");
    }

    @Test
    void deleteChatRoomById_concurrentlyDeleted_throwsNotFoundWithoutBroadcast() {
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(User.builder().id("user1").build()));
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1"))
                .thenReturn(Optional.of(ChatRoom.builder().id("room1").createdBy("user1").build()));
        when(participantService.findMembership("room1", "user1")).thenReturn(Optional.of(member(Role.OWNER)));
        when(chatRoomRepository.softDelete(eq("room1"), any())).thenReturn(0L);

        assertThatThrownBy(() -> chatRoomService.deleteChatRoomById("user1", "room1"))
                .isInstanceOf(ChatRoomNotFoundException.class);
        verifyNoInteractions(messagingTemplate, userEvents);
        verify(participantService, never()).removeAllParticipants(any());
    }

    @Test
    void deleteChatRoomById_nonCreator_throwsException() {
        User user = User.builder().id("user2").build();
        when(userRepository.findById("user2"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> chatRoomService.deleteChatRoomById("user2", "room1"))
                .isInstanceOf(UnauthorizedRoomActionException.class);
        verify(chatRoomRepository, never()).softDelete(any(), any());
    }

    @Test
    void leaveChatRoomById_nonCreatorMember_leavesSuccessfully() {
        User user = User.builder().id("user2").build();
        when(userRepository.findById("user2"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.PUBLIC)
                .build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user2")).thenReturn(true);
        when(participantService.findMembership("room1", "user2")).thenReturn(Optional.of(member(Role.MEMBER)));
        when(participantService.removeParticipantIfRole("room1", "user2", Role.MEMBER)).thenReturn(true);

        chatRoomService.leaveChatRoomById("user2", "room1");

        verify(participantService).removeParticipantIfRole("room1", "user2", Role.MEMBER);
        verify(userEvents).roomRemoved(Set.of("user2"), "room1", "LEFT");
        verifyNoMoreInteractions(userEvents);
        verify(chatRoomRepository, never()).save(any());
    }

    @Test
    void leaveChatRoomById_owner_transfersOwnershipToEarliestAdminBeforeRemovingOwnerRow() {
        when(userRepository.findById("user1")).thenReturn(Optional.of(User.builder().id("user1").name("Alice").build()));
        ChatRoom room = ChatRoom.builder().id("room1").createdBy("user1").type(ChatRoom.RoomType.PUBLIC).build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
        when(participantService.findMembership("room1", "user1")).thenReturn(Optional.of(member(Role.OWNER)));
        when(participantService.findSuccessor("room1", "user1"))
                .thenReturn(Optional.of(Participant.builder().chatRoomId("room1").userId("admin1").role(Role.ADMIN).build()));
        when(participantService.changeRoleIfCurrent("room1", "admin1", Role.ADMIN, Role.OWNER)).thenReturn(true);
        when(participantService.removeParticipantIfRole("room1", "user1", Role.OWNER)).thenReturn(true);

        chatRoomService.leaveChatRoomById("user1", "room1");

        InOrder order = inOrder(participantService);
        order.verify(participantService).changeRoleIfCurrent("room1", "admin1", Role.ADMIN, Role.OWNER);
        order.verify(participantService).removeParticipantIfRole("room1", "user1", Role.OWNER);
        verify(participantService).announceOwnerTransfer("room1", "admin1");
        verify(userEvents).roomUpdated(eq("admin1"), any());
        verify(userEvents).roomRemoved(Set.of("user1"), "room1", "LEFT");
        verify(chatRoomRepository, never()).softDelete(any(), any());
    }

    @Test
    void leaveChatRoomById_soleOwner_softDeletesRoomAndNotifiesMembers() {
        when(userRepository.findById("user1")).thenReturn(Optional.of(User.builder().id("user1").name("Alice").build()));
        ChatRoom room = ChatRoom.builder().id("room1").createdBy("user1").type(ChatRoom.RoomType.PUBLIC).build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
        when(participantService.findMembership("room1", "user1")).thenReturn(Optional.of(member(Role.OWNER)));
        when(participantService.findSuccessor("room1", "user1")).thenReturn(Optional.empty());
        when(participantService.getParticipantUserIds("room1")).thenReturn(Set.of("user1"));
        when(chatRoomRepository.softDelete(eq("room1"), any())).thenReturn(1L);

        chatRoomService.leaveChatRoomById("user1", "room1");

        verify(chatRoomRepository).softDelete(eq("room1"), any());
        verify(participantService, never()).removeParticipantIfRole(any(), any(), any());
        verify(userEvents).roomRemoved(Set.of("user1"), "room1", "DELETED");
    }

    @Test
    void leaveChatRoomById_successorTakenByConcurrentLeave_retriesWithNextSuccessor() {
        when(userRepository.findById("user1")).thenReturn(Optional.of(User.builder().id("user1").name("Alice").build()));
        ChatRoom room = ChatRoom.builder().id("room1").createdBy("user1").type(ChatRoom.RoomType.PUBLIC).build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
        when(participantService.findMembership("room1", "user1")).thenReturn(Optional.of(member(Role.OWNER)));
        Participant admin = Participant.builder().chatRoomId("room1").userId("admin1").role(Role.ADMIN).build();
        Participant member = Participant.builder().chatRoomId("room1").userId("member1").role(Role.MEMBER).build();
        when(participantService.findSuccessor("room1", "user1")).thenReturn(Optional.of(admin), Optional.of(member));
        when(participantService.changeRoleIfCurrent("room1", "admin1", Role.ADMIN, Role.OWNER)).thenReturn(false);
        when(participantService.changeRoleIfCurrent("room1", "member1", Role.MEMBER, Role.OWNER)).thenReturn(true);
        when(participantService.removeParticipantIfRole("room1", "user1", Role.OWNER)).thenReturn(true);

        chatRoomService.leaveChatRoomById("user1", "room1");

        verify(participantService).announceOwnerTransfer("room1", "member1");
        verify(participantService, never()).announceOwnerTransfer("room1", "admin1");
    }

    @Test
    void leaveChatRoomById_ownerRowAlreadyRemoved_revertsSuccessorSoOneOwnerRemains() {
        when(userRepository.findById("user1")).thenReturn(Optional.of(User.builder().id("user1").name("Alice").build()));
        ChatRoom room = ChatRoom.builder().id("room1").createdBy("user1").type(ChatRoom.RoomType.PUBLIC).build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
        when(participantService.findMembership("room1", "user1"))
                .thenReturn(Optional.of(member(Role.OWNER)), Optional.empty());
        Participant admin = Participant.builder().chatRoomId("room1").userId("admin1").role(Role.ADMIN).build();
        when(participantService.findSuccessor("room1", "user1")).thenReturn(Optional.of(admin));
        when(participantService.changeRoleIfCurrent("room1", "admin1", Role.ADMIN, Role.OWNER)).thenReturn(true);
        when(participantService.removeParticipantIfRole("room1", "user1", Role.OWNER)).thenReturn(false);

        assertThatThrownBy(() -> chatRoomService.leaveChatRoomById("user1", "room1"))
                .isInstanceOf(UnauthorizedRoomActionException.class);
        verify(participantService).changeRoleIfCurrent("room1", "admin1", Role.OWNER, Role.ADMIN);
        verify(participantService, never()).announceOwnerTransfer(any(), any());
    }

    @Test
    void updateChatRoomById_adminPromotedAfterCreation_updatesRoom() {
        when(userRepository.findById("admin1")).thenReturn(Optional.of(User.builder().id("admin1").build()));
        ChatRoom room = ChatRoom.builder().id("room1").createdBy("owner1").type(ChatRoom.RoomType.PUBLIC)
                .name("Old").maxParticipants(-1).build();
        ChatRoom updated = ChatRoom.builder().id("room1").name("New").build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room), Optional.of(updated));
        when(participantService.isUserParticipant("room1", "admin1")).thenReturn(true);
        when(participantService.findMembership("room1", "admin1")).thenReturn(Optional.of(member(Role.ADMIN)));
        when(chatRoomRepository.updateEditableFields(eq("room1"), eq("New"), any(), anyInt(), any(), any())).thenReturn(1L);

        UpdateChatRoomRequest request = new UpdateChatRoomRequest();
        request.setRoomName("New");

        assertThat(chatRoomService.updateChatRoomById("admin1", "room1", request).getName()).isEqualTo("New");
    }

    @Test
    void updateChatRoomById_createdByWithoutOwnerRole_throwsUnauthorized() {
        when(userRepository.findById("owner1")).thenReturn(Optional.of(User.builder().id("owner1").build()));
        ChatRoom room = ChatRoom.builder().id("room1").createdBy("owner1").type(ChatRoom.RoomType.PUBLIC).build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "owner1")).thenReturn(true);
        when(participantService.findMembership("room1", "owner1")).thenReturn(Optional.of(member(Role.MEMBER)));

        UpdateChatRoomRequest request = new UpdateChatRoomRequest();
        request.setRoomName("New");

        assertThatThrownBy(() -> chatRoomService.updateChatRoomById("owner1", "room1", request))
                .isInstanceOf(UnauthorizedRoomActionException.class);
        verify(chatRoomRepository, never()).updateEditableFields(any(), any(), any(), anyInt(), any(), any());
    }

    @Test
    void deleteChatRoomById_adminRole_throwsUnauthorized() {
        when(userRepository.findById("admin1")).thenReturn(Optional.of(User.builder().id("admin1").build()));
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1"))
                .thenReturn(Optional.of(ChatRoom.builder().id("room1").createdBy("owner1").build()));
        when(participantService.findMembership("room1", "admin1")).thenReturn(Optional.of(member(Role.ADMIN)));

        assertThatThrownBy(() -> chatRoomService.deleteChatRoomById("admin1", "room1"))
                .isInstanceOf(UnauthorizedRoomActionException.class);
        verify(chatRoomRepository, never()).softDelete(any(), any());
    }

    private static Participant member(Role role) {
        return Participant.builder().role(role).build();
    }

    @Test
    void createRoom_userNotFound_throwsException() {
        when(userRepository.findById("user1"))
                .thenReturn(Optional.empty());

        CreateChatRoomRequest request = new CreateChatRoomRequest();

        assertThatThrownBy(() -> chatRoomService.createRoom(request, "user1"))
                .isInstanceOf(UserNotFoundException.class);
    }

    @Test
    void createRoom_directRoomWithSelf_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));
        when(userRepository.findById("user1")).thenReturn(Optional.of(user));

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId("user1"); // same as creator

        assertThatThrownBy(() -> chatRoomService.createRoom(request, "user1"))
                .isInstanceOf(InvalidRequestException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_ARGUMENT);
    }

    @Test
    void createRoom_directRoomParticipantNotFound_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));
        when(userRepository.findById("user2")).thenReturn(Optional.empty());

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId("user2");

        assertThatThrownBy(() -> chatRoomService.createRoom(request, "user1"))
                .isInstanceOf(UserNotFoundException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.USER_NOT_FOUND);
    }

    @Test
    void createRoom_databaseError_propagatesDataAccessException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.PUBLIC);
        request.setRoomName("General");

        when(chatRoomRepository.save(any(ChatRoom.class))).thenThrow(new DataIntegrityViolationException("db error"));

        assertThatThrownBy(() -> chatRoomService.createRoom(request, "user1"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessage("db error");
    }

    @Test
    void createRoom_directRoomDatabaseError_propagatesDataAccessException() {
        User user1 = User.builder().id("user1").build();
        User user2 = User.builder().id("user2").build();
        when(userRepository.findById("user1")).thenReturn(Optional.of(user1));
        when(userRepository.findById("user2")).thenReturn(Optional.of(user2));

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId("user2");

        when(chatRoomRepository.save(any(ChatRoom.class))).thenThrow(new DataIntegrityViolationException("db error"));

        assertThatThrownBy(() -> chatRoomService.createRoom(request, "user1"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessage("db error");
    }

    @Test
    void getList_userNotFound_throwsException() {
        when(userRepository.findById("user1"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> chatRoomService.getList("user1"))
                .isInstanceOf(UserNotFoundException.class);
    }

    @Test
    void findById_notFound_throwsException() {
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> chatRoomService.findById("room1"))
                .isInstanceOf(ChatRoomNotFoundException.class);
    }

    @Test
    void deleteChatRoomById_databaseError_propagatesDataAccessException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder().id("room1").createdBy("user1").build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.findMembership("room1", "user1")).thenReturn(Optional.of(member(Role.OWNER)));
        when(chatRoomRepository.softDelete(eq("room1"), any())).thenThrow(new DataIntegrityViolationException("db error"));

        assertThatThrownBy(() -> chatRoomService.deleteChatRoomById("user1", "room1"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessage("db error");
    }

    @Test
    void updateChatRoomById_directMessageInvalidUpdate_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.DIRECT_MESSAGE)
                .build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
        when(participantService.findMembership("room1", "user1")).thenReturn(Optional.of(member(Role.OWNER)));

        UpdateChatRoomRequest request = new UpdateChatRoomRequest();
        request.setMaxUsers(5); // invalid for direct message

        assertThatThrownBy(() -> chatRoomService.updateChatRoomById("user1", "room1", request))
                .isInstanceOf(InvalidRequestException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_ARGUMENT);
    }

    @Test
    void updateChatRoomById_configurableRoomInvalidMaxUsers_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.PUBLIC)
                .memberCount(2)
                .build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
        when(participantService.findMembership("room1", "user1")).thenReturn(Optional.of(member(Role.OWNER)));
        // The conditional update matches nothing because memberCount (2) > new capacity
        when(chatRoomRepository.updateEditableFields(eq("room1"), any(), any(), eq(2), any(), any())).thenReturn(0L);

        UpdateChatRoomRequest request = new UpdateChatRoomRequest();
        request.setMaxUsers(2);

        assertThatThrownBy(() -> chatRoomService.updateChatRoomById("user1", "room1", request))
                .isInstanceOf(InvalidRequestException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_ARGUMENT);
    }

    @Test
    void leaveChatRoomById_directMessage_throwsException() {
        User user = User.builder().id("user2").build();
        when(userRepository.findById("user2"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .type(ChatRoom.RoomType.DIRECT_MESSAGE)
                .build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user2")).thenReturn(true);

        assertThatThrownBy(() -> chatRoomService.leaveChatRoomById("user2", "room1"))
                .isInstanceOf(ForbiddenActionException.class);
    }

    @Test
    void leaveChatRoomById_notParticipant_throwsException() {
        User user = User.builder().id("user2").build();
        when(userRepository.findById("user2"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.PUBLIC)
                .build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        // Member when the room was read, but the row was already removed by a concurrent leave
        when(participantService.isUserParticipant("room1", "user2")).thenReturn(true);
        when(participantService.findMembership("room1", "user2"))
                .thenReturn(Optional.of(member(Role.MEMBER)), Optional.empty());
        when(participantService.removeParticipantIfRole("room1", "user2", Role.MEMBER)).thenReturn(false);

        assertThatThrownBy(() -> chatRoomService.leaveChatRoomById("user2", "room1"))
                .isInstanceOf(UnauthorizedRoomActionException.class);
    }

    @Test
    void leaveChatRoomById_databaseError_propagatesDataAccessException() {
        User user = User.builder().id("user2").build();
        when(userRepository.findById("user2"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.PUBLIC)
                .build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user2")).thenReturn(true);
        when(participantService.findMembership("room1", "user2")).thenReturn(Optional.of(member(Role.MEMBER)));
        when(participantService.removeParticipantIfRole("room1", "user2", Role.MEMBER))
                .thenThrow(new DataIntegrityViolationException("db error"));

        assertThatThrownBy(() -> chatRoomService.leaveChatRoomById("user2", "room1"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessage("db error");
    }

    @Test
    void toResponses_directRoom_showsOtherMemberAsCounterpart() {
        ChatRoom dm = ChatRoom.builder().id("dm").type(ChatRoom.RoomType.DIRECT_MESSAGE).build();
        ChatRoom group = ChatRoom.builder().id("group").type(ChatRoom.RoomType.PUBLIC).build();
        when(participantService.getParticipantUserIds(List.of("dm", "group")))
                .thenReturn(Map.of("dm", Set.of("user1", "user2"), "group", Set.of("user1", "user3")));
        when(userRepository.findAllById(Set.of("user2")))
                .thenReturn(List.of(User.builder().id("user2").name("Bob").avatarUrl("b.png").email("bob@x").build()));

        List<ChatRoomResponse> responses = chatRoomService.toResponses(List.of(dm, group), "user1");

        assertThat(responses.get(0).counterpart().id()).isEqualTo("user2");
        assertThat(responses.get(0).counterpart().name()).isEqualTo("Bob");
        assertThat(responses.get(1).counterpart()).isNull();
    }

    // CM-091: a REQUESTED DM has only the sender's row; the counterpart comes from the pair key
    @Test
    void toResponses_requestedDirectRoom_showsRecipientFromPairKeyAsCounterpart() {
        ChatRoom dm = ChatRoom.builder().id("dm").type(ChatRoom.RoomType.DIRECT_MESSAGE)
                .state(RoomState.REQUESTED).memberKey("user1:user2").build();
        when(participantService.getParticipantUserIds(List.of("dm"))).thenReturn(Map.of("dm", Set.of("user1")));
        when(userRepository.findAllById(Set.of("user2")))
                .thenReturn(List.of(User.builder().id("user2").name("Bob").avatarUrl("b.png").email("bob@x").build()));

        List<ChatRoomResponse> responses = chatRoomService.toResponses(List.of(dm), "user1");

        assertThat(responses.get(0).counterpart().id()).isEqualTo("user2");
        assertThat(responses.get(0).counterpart().name()).isEqualTo("Bob");
    }

    // CM-077: a DM whose other member no longer exists keeps a "Deleted user" counterpart (AC-009-28)
    @Test
    void toResponses_directRoomWithMissingUser_showsDeletedUserCounterpart() {
        ChatRoom dm = ChatRoom.builder().id("dm").type(ChatRoom.RoomType.DIRECT_MESSAGE).build();
        ChatRoom nameless = ChatRoom.builder().id("dm2").type(ChatRoom.RoomType.DIRECT_MESSAGE).build();
        when(participantService.getParticipantUserIds(List.of("dm", "dm2")))
                .thenReturn(Map.of("dm", Set.of("user1", "gone"), "dm2", Set.of("user1", "user3")));
        when(userRepository.findAllById(Set.of("gone", "user3")))
                .thenReturn(List.of(User.builder().id("user3").avatarUrl("c.png").build()));

        List<ChatRoomResponse> responses = chatRoomService.toResponses(List.of(dm, nameless), "user1");

        assertThat(responses.get(0).counterpart().id()).isEqualTo("gone");
        assertThat(responses.get(0).counterpart().name()).isEqualTo("Deleted user");
        assertThat(responses.get(0).counterpart().avatarUrl()).isNull();
        assertThat(responses.get(1).counterpart().id()).isEqualTo("user3");
        assertThat(responses.get(1).counterpart().name()).isEqualTo("Deleted user");
    }

    // CM-073: blocked is true only in the blocker's view of the DM (AC-009-19)

    @Test
    void toResponses_dmBlockedByCaller_flagsBlockedForBlockerOnly() {
        ChatRoom dm = ChatRoom.builder().id("dm").type(ChatRoom.RoomType.DIRECT_MESSAGE).memberKey("user1:user2").build();
        ChatRoom group = ChatRoom.builder().id("group").type(ChatRoom.RoomType.PUBLIC).build();
        when(participantService.getParticipantUserIds(List.of("dm", "group")))
                .thenReturn(Map.of("dm", Set.of("user1", "user2"), "group", Set.of("user1", "user2")));
        when(participantService.getParticipantUserIds(List.of("dm"))).thenReturn(Map.of("dm", Set.of("user1", "user2")));
        when(blocks.blockedBy("user1", Set.of("user2"))).thenReturn(Set.of("user2"));

        List<ChatRoomResponse> blockerView = chatRoomService.toResponses(List.of(dm, group), "user1");
        ChatRoomResponse blockedView = chatRoomService.toResponse(dm, "user2");

        assertThat(blockerView.get(0).blocked()).isTrue();
        assertThat(blockerView.get(1).blocked()).isFalse();
        assertThat(blockedView.blocked()).isFalse();
    }

    @Test
    void toResponses_requestedDmBlockedBySender_flagsBlockedFromMemberKey() {
        ChatRoom dm = ChatRoom.builder().id("dm").type(ChatRoom.RoomType.DIRECT_MESSAGE).memberKey("user1:user2")
                .state(RoomState.REQUESTED).build();
        when(participantService.getParticipantUserIds(List.of("dm"))).thenReturn(Map.of("dm", Set.of("user1")));
        when(blocks.blockedBy("user1", Set.of("user2"))).thenReturn(Set.of("user2"));

        assertThat(chatRoomService.toResponse(dm, "user1").blocked()).isTrue();
    }

    @Test
    void findExistingDirectRoom_activePair_returnsThatRoomWithOrderIndependentKey() {
        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId("user1");
        ChatRoom existing = ChatRoom.builder().id("dm").type(ChatRoom.RoomType.DIRECT_MESSAGE).memberKey("user1:user2").build();
        when(chatRoomRepository.findByMemberKeyAndIsActiveTrue("user1:user2")).thenReturn(Optional.of(existing));
        when(participantService.getParticipantUserIds(List.of("dm"))).thenReturn(Map.of("dm", Set.of("user1", "user2")));

        Optional<ChatRoomResponse> found = chatRoomService.findExistingDirectRoom(request, "user2");

        assertThat(found).map(ChatRoomResponse::id).contains("dm");
    }

    @Test
    void findExistingDirectRoom_groupRoom_neverLooksUp() {
        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.PUBLIC);
        request.setRoomName("General");

        assertThat(chatRoomService.findExistingDirectRoom(request, "user1")).isEmpty();
        verify(chatRoomRepository, never()).findByMemberKeyAndIsActiveTrue(anyString());
    }

    @Test
    void createRoom_concurrentDuplicateDirectRoom_returnsTheRoomThatWon() {
        when(userRepository.findById("user1")).thenReturn(Optional.of(User.builder().id("user1").build()));
        when(userRepository.findById("user2")).thenReturn(Optional.of(User.builder().id("user2").build()));
        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId("user2");
        when(chatRoomRepository.save(any(ChatRoom.class)))
                .thenThrow(new org.springframework.dao.DuplicateKeyException("memberKey"));
        ChatRoom winner = ChatRoom.builder().id("dm").type(ChatRoom.RoomType.DIRECT_MESSAGE).memberKey("user1:user2").build();
        when(chatRoomRepository.findByMemberKeyAndIsActiveTrue("user1:user2")).thenReturn(Optional.of(winner));
        when(participantService.getParticipantUserIds(List.of("dm"))).thenReturn(Map.of("dm", Set.of("user1", "user2")));

        ChatRoomResponse response = chatRoomService.createRoom(request, "user1");

        assertThat(response.id()).isEqualTo("dm");
        verify(participantService, never()).createParticipant(anyString(), anyString(), any());
    }

    @Mock private com.lnt.chatmee.repository.MessageRepository messageRepository;

    @Test
    void toResponses_readMarker_countsUnreadAndIncludesRole() {
        var marker = Instant.parse("2026-10-12T10:00:00Z");
        var room = ChatRoom.builder().id("room1").build();
        var member = com.lnt.chatmee.model.Participant.builder().chatRoomId("room1").userId("user1")
            .role(com.lnt.chatmee.model.Participant.Role.ADMIN).lastReadAt(marker).build();
        when(participantService.getParticipantUserIds(List.of("room1"))).thenReturn(Map.of("room1", Set.of("user1")));
        when(participantService.getMemberships("user1")).thenReturn(List.of(member));
        when(messageRepository.countUnread("room1", "user1", marker)).thenReturn(2L);
        var response = chatRoomService.toResponse(room, "user1");
        assertThat(response.unreadCount()).isEqualTo(2);
        assertThat(response.myRole()).isEqualTo(com.lnt.chatmee.model.Participant.Role.ADMIN);
    }

    @Test
    void toResponses_missingReadMarker_returnsZeroWithoutCounting() {
        var room = ChatRoom.builder().id("room1").build();
        when(participantService.getMemberships("user1")).thenReturn(List.of(
            com.lnt.chatmee.model.Participant.builder().chatRoomId("room1").userId("user1")
                .role(com.lnt.chatmee.model.Participant.Role.MEMBER).build()));
        var response = chatRoomService.toResponse(room, "user1");
        assertThat(response.unreadCount()).isZero();
        verifyNoInteractions(messageRepository);
    }

    @Test
    void getList_activityAndCreatedAtFallback_sortsDescending() {
        when(userRepository.findById("user1")).thenReturn(Optional.of(User.builder().id("user1").build()));
        when(participantService.getMemberships("user1")).thenReturn(memberships("user1", "old", "new", "empty"));
        var time = Instant.parse("2026-10-12T10:00:00Z");
        var old = ChatRoom.builder().id("old").lastActivityAt(time.minusSeconds(10)).build();
        var latest = ChatRoom.builder().id("new").lastActivityAt(time).build();
        var empty = ChatRoom.builder().id("empty").createdAt(java.time.LocalDateTime.ofInstant(
            time.minusSeconds(5), java.time.ZoneId.systemDefault())).build();
        when(chatRoomRepository.findByIdInAndIsActiveTrue(List.of("old", "new", "empty")))
            .thenReturn(List.of(old, empty, latest));
        assertThat(chatRoomService.getList("user1")).extracting(ChatRoom::getId).containsExactly("new", "empty", "old");
    }

    // CM-072 AC4: REQUESTED rooms are listed for the sender only (AC-009-11)

    @Test
    void getList_requestedDm_includedForSenderWithStateAndExcludedForRecipient() {
        when(userRepository.findById("sender")).thenReturn(Optional.of(User.builder().id("sender").build()));
        when(userRepository.findById("recipient")).thenReturn(Optional.of(User.builder().id("recipient").build()));
        ChatRoom requested = ChatRoom.builder().id("dm").type(ChatRoom.RoomType.DIRECT_MESSAGE)
                .state(RoomState.REQUESTED).isActive(true).build();
        when(participantService.getMemberships("sender")).thenReturn(memberships("sender", "dm"));
        when(participantService.getMemberships("recipient")).thenReturn(List.of());
        when(chatRoomRepository.findByIdInAndIsActiveTrue(List.of("dm"))).thenReturn(List.of(requested));
        when(participantService.getParticipantUserIds(List.of("dm"))).thenReturn(Map.of("dm", Set.of("sender")));

        List<ChatRoomResponse> senderRooms = chatRoomService.toResponses(chatRoomService.getList("sender"), "sender");
        List<ChatRoom> recipientRooms = chatRoomService.getList("recipient");

        assertThat(senderRooms).singleElement().satisfies(view -> {
            assertThat(view.id()).isEqualTo("dm");
            assertThat(view.state()).isEqualTo(RoomState.REQUESTED);
        });
        assertThat(recipientRooms).isEmpty();
    }

    @Test
    void toResponses_roomWithoutStoredState_reportsActive() {
        ChatRoom legacy = ChatRoom.builder().id("old").type(ChatRoom.RoomType.PUBLIC).build();
        when(participantService.getParticipantUserIds(List.of("old"))).thenReturn(Map.of("old", Set.of("user1")));

        assertThat(chatRoomService.toResponse(legacy, "user1").state()).isEqualTo(RoomState.ACTIVE);
    }

    private static List<Participant> memberships(String userId, String... roomIds) {
        return java.util.Arrays.stream(roomIds)
            .map(roomId -> Participant.builder().chatRoomId(roomId).userId(userId).role(Role.MEMBER).build())
            .toList();
    }

    // CM-075 AC1: hiding a DM is per user (AC-009-21)

    @Test
    void hideRoom_directMessage_hidesForCallerOnlyAndNotifiesCallerSessions() {
        when(userRepository.findById("alice")).thenReturn(Optional.of(User.builder().id("alice").build()));
        when(chatRoomRepository.findByIdAndIsActiveTrue("dm")).thenReturn(Optional.of(directMessage("dm")));
        when(participantService.isUserParticipant("dm", "alice")).thenReturn(true);
        when(participantRepository.hide(eq("dm"), eq("alice"), any(Instant.class))).thenReturn(1L);

        chatRoomService.hideRoom("alice", "dm");

        var order = inOrder(participantRepository, userEvents);
        order.verify(participantRepository).hide(eq("dm"), eq("alice"), any(Instant.class));
        order.verify(userEvents).roomRemoved(Set.of("alice"), "dm", "HIDDEN");
        verifyNoMoreInteractions(participantRepository, userEvents);
    }

    @Test
    void getList_roomHiddenByCaller_excludedForCallerOnly() {
        when(userRepository.findById("alice")).thenReturn(Optional.of(User.builder().id("alice").build()));
        when(userRepository.findById("bob")).thenReturn(Optional.of(User.builder().id("bob").build()));
        var hidden = Participant.builder().chatRoomId("dm").userId("alice").role(Role.OWNER)
            .hiddenAt(Instant.parse("2026-10-12T10:00:00Z")).build();
        var group = Participant.builder().chatRoomId("group").userId("alice").role(Role.MEMBER).build();
        when(participantService.getMemberships("alice")).thenReturn(List.of(hidden, group));
        when(participantService.getMemberships("bob")).thenReturn(memberships("bob", "dm"));
        when(chatRoomRepository.findByIdInAndIsActiveTrue(List.of("group")))
            .thenReturn(List.of(ChatRoom.builder().id("group").build()));
        when(chatRoomRepository.findByIdInAndIsActiveTrue(List.of("dm"))).thenReturn(List.of(directMessage("dm")));

        assertThat(chatRoomService.getList("alice")).extracting(ChatRoom::getId).containsExactly("group");
        assertThat(chatRoomService.getList("bob")).extracting(ChatRoom::getId).containsExactly("dm");
    }

    @Test
    void hideRoom_groupRoom_throwsInvalidRequestWithoutHiding() {
        when(userRepository.findById("alice")).thenReturn(Optional.of(User.builder().id("alice").build()));
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(
            ChatRoom.builder().id("room1").type(ChatRoom.RoomType.PRIVATE).isActive(true).build()));
        when(participantService.isUserParticipant("room1", "alice")).thenReturn(true);

        assertThatThrownBy(() -> chatRoomService.hideRoom("alice", "room1"))
            .isInstanceOf(InvalidRequestException.class);
        verifyNoInteractions(participantRepository, userEvents);
    }

    @Test
    void hideRoom_nonMember_throwsNotFoundWithoutHiding() {
        when(userRepository.findById("mallory")).thenReturn(Optional.of(User.builder().id("mallory").build()));
        when(chatRoomRepository.findByIdAndIsActiveTrue("dm")).thenReturn(Optional.of(directMessage("dm")));
        when(participantService.isUserParticipant("dm", "mallory")).thenReturn(false);

        assertThatThrownBy(() -> chatRoomService.hideRoom("mallory", "dm"))
            .isInstanceOf(ChatRoomNotFoundException.class);
        verifyNoInteractions(participantRepository, userEvents);
    }

    // CM-075 AC2: a DM cannot be deleted (AC-009-22)

    @Test
    void deleteChatRoomById_directMessage_throwsForbiddenUseHide() {
        when(userRepository.findById("alice")).thenReturn(Optional.of(User.builder().id("alice").build()));
        when(chatRoomRepository.findByIdAndIsActiveTrue("dm")).thenReturn(Optional.of(directMessage("dm")));

        assertThatThrownBy(() -> chatRoomService.deleteChatRoomById("alice", "dm"))
            .isInstanceOf(ForbiddenActionException.class)
            .hasMessage("Use hide for direct messages");
        verify(chatRoomRepository, never()).softDelete(any(), any());
        verifyNoInteractions(userEvents, messagingTemplate);
    }

    private static ChatRoom directMessage(String id) {
        return ChatRoom.builder().id(id).type(ChatRoom.RoomType.DIRECT_MESSAGE).state(RoomState.ACTIVE)
            .isActive(true).build();
    }
}
