package com.lnt.chatmee.service;

import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageServiceTest {

    @Mock
    private ChatRoomRepository chatRoomRepository;

    @Mock
    private ParticipantRepository participantRepository;

    @Mock
    private MessageRepository messageRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private MessageService messageService;

    @Test
    void getRecentMessages_roomNotFound_throwsException() {
        when(chatRoomRepository.existsById("room1")).thenReturn(false);

        assertThatThrownBy(() -> messageService.getRecentMessages("room1", "user1"))
                .isInstanceOf(ChatRoomNotFoundException.class);
    }

    @Test
    void getRecentMessages_nonParticipant_throwsException() {
        when(chatRoomRepository.existsById("room1")).thenReturn(true);
        when(participantRepository.existsByChatRoomIdAndUserId("room1", "user1")).thenReturn(false);

        assertThatThrownBy(() -> messageService.getRecentMessages("room1", "user1"))
                .isInstanceOf(ForbiddenActionException.class);
    }

    @Test
    void getRecentMessages_isParticipant_returnsMessages() {
        when(chatRoomRepository.existsById("room1")).thenReturn(true);
        when(participantRepository.existsByChatRoomIdAndUserId("room1", "user1")).thenReturn(true);

        Message msg = Message.builder()
                .id("msg1")
                .chatRoomId("room1")
                .senderId("user1")
                .content("hello")
                .type(Message.MessageType.TEXT)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .isDeleted(false)
                .isUpdated(false)
                .build();

        User user = User.builder().id("user1").name("Alice").build();

        when(messageRepository.findTop50ByChatRoomIdAndIsDeletedFalseOrderByCreatedAtDesc("room1"))
                .thenReturn(List.of(msg));
        when(userRepository.findById("user1")).thenReturn(Optional.of(user));

        List<ChatMessageResponse> responses = messageService.getRecentMessages("room1", "user1");

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).getContent()).isEqualTo("hello");
        assertThat(responses.get(0).getSenderName()).isEqualTo("Alice");
    }

    @Test
    void persistMessageAsync_savesMessage() {
        Message msg = Message.builder()
                .id("msg1")
                .chatRoomId("room1")
                .senderId("user1")
                .content("hello")
                .build();

        messageService.persistMessageAsync(msg);

        ArgumentCaptor<Message> captor = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository).save(captor.capture());
        
        Message saved = captor.getValue();
        assertThat(saved.getId()).isEqualTo("msg1");
        assertThat(saved.getContent()).isEqualTo("hello");
    }
}
