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
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.Participant;
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
import org.mockito.InjectMocks;
import org.mockito.Spy;
import com.lnt.chatmee.service.policy.*;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
    @InjectMocks
    private ChatRoomService chatRoomService;

    @Test
    void createRoom_directRoom_createsSuccessfully() {
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
                .createdBy("user1")
                .build();
        when(chatRoomRepository.save(any(ChatRoom.class))).thenReturn(savedRoom);
        when(participantService.getParticipantUserIds(List.of("room1"))).thenReturn(Map.of("room1", Set.of("user1", "user2")));

        ChatRoomResponse response = chatRoomService.createRoom(request, "user1");

        assertThat(response.id()).isEqualTo("room1");
        assertThat(response.participants()).containsExactlyInAnyOrder("user1", "user2");
        ArgumentCaptor<ChatRoom> saved = ArgumentCaptor.forClass(ChatRoom.class);
        verify(chatRoomRepository).save(saved.capture());
        assertThat(saved.getValue().getMemberCount()).isEqualTo(2);
        assertThat(saved.getValue().getMaxParticipants()).isEqualTo(2);
        verify(participantService).createParticipant("room1", "user1", Participant.Role.OWNER);
        verify(participantService).createParticipant("room1", "user2", Participant.Role.MEMBER);
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
        request.setSettings(ChatRoom.RoomSettings.builder().allowGuestUsers(true).build());

        ChatRoom savedRoom = ChatRoom.builder()
                .id("room2")
                .type(ChatRoom.RoomType.PRIVATE)
                .createdBy("user1")
                .build();
        when(chatRoomRepository.save(any(ChatRoom.class))).thenReturn(savedRoom);

        ChatRoomResponse response = chatRoomService.createRoom(request, "user1");

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
        when(participantService.getRoomIdsOfUser("user1")).thenReturn(List.of("room1"));

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
        when(participantService.getRoomIdsOfUser("user1")).thenReturn(List.of());

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
        ChatRoom.RoomSettings settings = ChatRoom.RoomSettings.builder().build();
        when(chatRoomRepository.updateEditableFields(eq("room1"), eq("New Name"), eq("New Desc"), eq(10),
                eq(settings), any())).thenReturn(1L);

        UpdateChatRoomRequest request = new UpdateChatRoomRequest();
        request.setRoomName(" New Name ");
        request.setDescription("New Desc");
        request.setMaxUsers(10);
        request.setSettings(settings);

        ChatRoom result = chatRoomService.updateChatRoomById("user1", "room1", request);

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
        when(chatRoomRepository.updateEditableFields(eq("room1"), eq("Name"), eq("Desc"), eq(-1), eq(settings), any()))
                .thenReturn(1L);

        chatRoomService.updateChatRoomById("user1", "room1", new UpdateChatRoomRequest());

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
        when(chatRoomRepository.softDelete(eq("room1"), any())).thenReturn(1L);
        when(participantService.removeAllParticipants("room1")).thenReturn(3L);

        chatRoomService.deleteChatRoomById("user1", "room1");

        verify(chatRoomRepository, never()).delete(any());
        verify(participantService).removeAllParticipants("room1");
        ArgumentCaptor<ChatMessageResponse> event = ArgumentCaptor.forClass(ChatMessageResponse.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/rooms/room1"), event.capture());
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
        when(chatRoomRepository.softDelete(eq("room1"), any())).thenReturn(0L);

        assertThatThrownBy(() -> chatRoomService.deleteChatRoomById("user1", "room1"))
                .isInstanceOf(ChatRoomNotFoundException.class);
        verifyNoInteractions(messagingTemplate);
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
        when(participantService.removeParticipant("room1", "user2")).thenReturn(true);

        chatRoomService.leaveChatRoomById("user2", "room1");

        verify(participantService).removeParticipant("room1", "user2");
        verify(chatRoomRepository, never()).save(any());
    }

    @Test
    void leaveChatRoomById_creator_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findById("user1"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.PUBLIC)
                .build();
        when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.of(room));
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);

        assertThatThrownBy(() -> chatRoomService.leaveChatRoomById("user1", "room1"))
                .isInstanceOf(ForbiddenActionException.class);
        verify(participantService, never()).removeParticipant(any(), any());
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
        when(participantService.removeParticipant("room1", "user2")).thenReturn(false);

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
        when(participantService.removeParticipant("room1", "user2"))
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
}
