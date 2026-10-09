package com.lnt.chatmee.service;

import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.UnauthorizedRoomActionException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.exception.ErrorCode;
import org.springframework.dao.DataIntegrityViolationException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
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
    private ParticipantRepository participantRepository;

    @InjectMocks
    private ChatRoomService chatRoomService;

    @Test
    void createRoom_directRoom_createsSuccessfully() {
        User creator = User.builder().id("user1").build();
        User participant = User.builder().id("user2").build();

        when(userRepository.findByProviderAndProviderId("local", "localId"))
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

        ChatRoomResponse response = chatRoomService.createRoom(request, "local", "localId");

        assertThat(response.getId()).isEqualTo("room1");
        verify(participantService).createParticipant("room1", "user1", Participant.Role.OWNER);
        verify(participantService).createParticipant("room1", "user2", Participant.Role.MEMBER);
    }

    @Test
    void createRoom_configurableRoom_createsSuccessfully() {
        User creator = User.builder().id("user1").build();

        when(userRepository.findByProviderAndProviderId("local", "localId"))
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

        ChatRoomResponse response = chatRoomService.createRoom(request, "local", "localId");

        assertThat(response.getId()).isEqualTo("room1");
        verify(participantService).createParticipant("room1", "user1", Participant.Role.OWNER);
    }

    @Test
    void createRoom_configurableRoomWithSettings_createsSuccessfully() {
        User creator = User.builder().id("user1").build();
        
        when(userRepository.findByProviderAndProviderId("local", "localId"))
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

        ChatRoomResponse response = chatRoomService.createRoom(request, "local", "localId");

        assertThat(response.getId()).isEqualTo("room2");
    }


    @Test
    void getList_returnsUserRooms() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder().id("room1").build();
        when(chatRoomRepository.findByParticipantsContainingAndIsActiveTrue("user1"))
                .thenReturn(List.of(room));

        List<ChatRoom> rooms = chatRoomService.getList("local", "localId");

        assertThat(rooms).hasSize(1);
        assertThat(rooms.get(0).getId()).isEqualTo("room1");
    }

    @Test
    void getChatRoomById_isParticipant_returnsRoom() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder().id("room1").build();
        when(chatRoomRepository.findByIdAndParticipantsContaining("room1", "user1"))
                .thenReturn(Optional.of(room));

        ChatRoom result = chatRoomService.getChatRoomById("local", "localId", "room1");

        assertThat(result.getId()).isEqualTo("room1");
    }

    @Test
    void getChatRoomById_nonParticipant_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        when(chatRoomRepository.findByIdAndParticipantsContaining("room1", "user1"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> chatRoomService.getChatRoomById("local", "localId", "room1"))
                .isInstanceOf(ChatRoomNotFoundException.class);
    }

    @Test
    void updateChatRoomById_creator_updatesSuccessfully() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        Set<String> participants = new HashSet<>();
        participants.add("user1");
        
        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.PUBLIC)
                .participants(participants)
                .build();
        when(chatRoomRepository.findByIdAndParticipantsContaining("room1", "user1"))
                .thenReturn(Optional.of(room));
        when(chatRoomRepository.save(any(ChatRoom.class))).thenReturn(room);

        UpdateChatRoomRequest request = new UpdateChatRoomRequest();
        request.setRoomName("New Name");
        request.setDescription("New Desc");
        request.setMaxUsers(10);
        request.setSettings(ChatRoom.RoomSettings.builder().build());

        ChatRoom result = chatRoomService.updateChatRoomById("local", "localId", "room1", request);

        assertThat(result.getName()).isEqualTo("New Name");
    }

    @Test
    void updateChatRoomById_nonCreator_throwsException() {
        User user = User.builder().id("user2").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .build();
        when(chatRoomRepository.findByIdAndParticipantsContaining("room1", "user2"))
                .thenReturn(Optional.of(room));

        UpdateChatRoomRequest request = new UpdateChatRoomRequest();

        assertThatThrownBy(() -> chatRoomService.updateChatRoomById("local", "localId", "room1", request))
                .isInstanceOf(UnauthorizedRoomActionException.class);
    }

    @Test
    void deleteChatRoomById_creator_deletesSuccessfully() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .build();
        when(chatRoomRepository.findById("room1")).thenReturn(Optional.of(room));

        chatRoomService.deleteChatRoomById("local", "localId", "room1");

        verify(chatRoomRepository).delete(room);
    }

    @Test
    void deleteChatRoomById_nonCreator_throwsException() {
        User user = User.builder().id("user2").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .build();
        when(chatRoomRepository.findById("room1")).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> chatRoomService.deleteChatRoomById("local", "localId", "room1"))
                .isInstanceOf(UnauthorizedRoomActionException.class);
    }

    @Test
    void leaveChatRoomById_nonCreatorMember_leavesSuccessfully() {
        User user = User.builder().id("user2").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        Set<String> participants = new HashSet<>();
        participants.add("user1");
        participants.add("user2");
        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.PUBLIC)
                .participants(participants)
                .build();

        when(chatRoomRepository.findByIdAndParticipantsContaining("room1", "user2"))
                .thenReturn(Optional.of(room));

        chatRoomService.leaveChatRoomById("local", "localId", "room1");

        verify(participantRepository).deleteByChatRoomIdAndUserId("room1", "user2");
        verify(chatRoomRepository).save(room);
        assertThat(room.getParticipants()).doesNotContain("user2");
    }

    @Test
    void leaveChatRoomById_creator_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        Set<String> participants = new HashSet<>();
        participants.add("user1");
        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.PUBLIC)
                .participants(participants)
                .build();

        when(chatRoomRepository.findByIdAndParticipantsContaining("room1", "user1"))
                .thenReturn(Optional.of(room));

        assertThatThrownBy(() -> chatRoomService.leaveChatRoomById("local", "localId", "room1"))
                .isInstanceOf(ForbiddenActionException.class);
    }
    @Test
    void createRoom_userNotFound_throwsException() {
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.empty());

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        
        assertThatThrownBy(() -> chatRoomService.createRoom(request, "local", "localId"))
                .isInstanceOf(UserNotFoundException.class);
    }

    @Test
    void createRoom_directRoomWithSelf_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));
        when(userRepository.findById("user1")).thenReturn(Optional.of(user));

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId("user1"); // same as creator

        assertThatThrownBy(() -> chatRoomService.createRoom(request, "local", "localId"))
                .isInstanceOf(InvalidRequestException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_ARGUMENT);
    }

    @Test
    void createRoom_directRoomParticipantNotFound_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));
        when(userRepository.findById("user2")).thenReturn(Optional.empty());

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId("user2");

        assertThatThrownBy(() -> chatRoomService.createRoom(request, "local", "localId"))
                .isInstanceOf(UserNotFoundException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.USER_NOT_FOUND);
    }

    @Test
    void createRoom_databaseError_propagatesDataAccessException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.PUBLIC);
        request.setRoomName("General");

        when(chatRoomRepository.save(any(ChatRoom.class))).thenThrow(new DataIntegrityViolationException("db error"));

        assertThatThrownBy(() -> chatRoomService.createRoom(request, "local", "localId"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessage("db error");
    }
    
    @Test
    void createRoom_directRoomDatabaseError_propagatesDataAccessException() {
        User user1 = User.builder().id("user1").build();
        User user2 = User.builder().id("user2").build();
        when(userRepository.findByProviderAndProviderId("local", "localId")).thenReturn(Optional.of(user1));
        when(userRepository.findById("user2")).thenReturn(Optional.of(user2));

        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(ChatRoom.RoomType.DIRECT_MESSAGE);
        request.setParticipantId("user2");

        when(chatRoomRepository.save(any(ChatRoom.class))).thenThrow(new DataIntegrityViolationException("db error"));

        assertThatThrownBy(() -> chatRoomService.createRoom(request, "local", "localId"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessage("db error");
    }

    @Test
    void getList_userNotFound_throwsException() {
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> chatRoomService.getList("local", "localId"))
                .isInstanceOf(UserNotFoundException.class);
    }

    @Test
    void findById_notFound_throwsException() {
        when(chatRoomRepository.findById("room1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> chatRoomService.findById("room1"))
                .isInstanceOf(ChatRoomNotFoundException.class);
    }

    @Test
    void deleteChatRoomById_databaseError_propagatesDataAccessException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder().id("room1").createdBy("user1").build();
        when(chatRoomRepository.findById("room1")).thenReturn(Optional.of(room));
        
        doThrow(new DataIntegrityViolationException("db error"))
            .when(chatRoomRepository).delete(room);

        assertThatThrownBy(() -> chatRoomService.deleteChatRoomById("local", "localId", "room1"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessage("db error");
    }

    @Test
    void updateChatRoomById_directMessageInvalidUpdate_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.DIRECT_MESSAGE)
                .build();
        when(chatRoomRepository.findByIdAndParticipantsContaining("room1", "user1"))
                .thenReturn(Optional.of(room));

        UpdateChatRoomRequest request = new UpdateChatRoomRequest();
        request.setMaxUsers(5); // invalid for direct message

        assertThatThrownBy(() -> chatRoomService.updateChatRoomById("local", "localId", "room1", request))
                .isInstanceOf(InvalidRequestException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_ARGUMENT);
    }

    @Test
    void updateChatRoomById_configurableRoomInvalidMaxUsers_throwsException() {
        User user = User.builder().id("user1").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        Set<String> participants = new HashSet<>();
        participants.add("user1");
        participants.add("user2");
        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.PUBLIC)
                .participants(participants)
                .build();
        when(chatRoomRepository.findByIdAndParticipantsContaining("room1", "user1"))
                .thenReturn(Optional.of(room));

        UpdateChatRoomRequest request = new UpdateChatRoomRequest();
        request.setMaxUsers(1); // 1 is less than current 2 participants

        assertThatThrownBy(() -> chatRoomService.updateChatRoomById("local", "localId", "room1", request))
                .isInstanceOf(InvalidRequestException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_ARGUMENT);
    }

    @Test
    void leaveChatRoomById_directMessage_throwsException() {
        User user = User.builder().id("user2").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .type(ChatRoom.RoomType.DIRECT_MESSAGE)
                .build();
        when(chatRoomRepository.findByIdAndParticipantsContaining("room1", "user2"))
                .thenReturn(Optional.of(room));

        assertThatThrownBy(() -> chatRoomService.leaveChatRoomById("local", "localId", "room1"))
                .isInstanceOf(ForbiddenActionException.class);
    }

    @Test
    void leaveChatRoomById_notParticipant_throwsException() {
        User user = User.builder().id("user2").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        Set<String> participants = new HashSet<>();
        participants.add("user1");
        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .type(ChatRoom.RoomType.PUBLIC)
                .participants(participants) // user2 not in participants
                .build();
        when(chatRoomRepository.findByIdAndParticipantsContaining("room1", "user2"))
                .thenReturn(Optional.of(room));

        assertThatThrownBy(() -> chatRoomService.leaveChatRoomById("local", "localId", "room1"))
                .isInstanceOf(UnauthorizedRoomActionException.class);
    }

    @Test
    void leaveChatRoomById_databaseError_propagatesDataAccessException() {
        User user = User.builder().id("user2").build();
        when(userRepository.findByProviderAndProviderId("local", "localId"))
                .thenReturn(Optional.of(user));

        Set<String> participants = new HashSet<>();
        participants.add("user1");
        participants.add("user2");
        ChatRoom room = ChatRoom.builder()
                .id("room1")
                .createdBy("user1")
                .type(ChatRoom.RoomType.PUBLIC)
                .participants(participants)
                .build();
        when(chatRoomRepository.findByIdAndParticipantsContaining("room1", "user2"))
                .thenReturn(Optional.of(room));

        doThrow(new DataIntegrityViolationException("db error"))
            .when(participantRepository).deleteByChatRoomIdAndUserId("room1", "user2");

        assertThatThrownBy(() -> chatRoomService.leaveChatRoomById("local", "localId", "room1"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessage("db error");
    }
}
