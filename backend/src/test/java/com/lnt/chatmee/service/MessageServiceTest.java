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

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageServiceTest {
    @org.junit.jupiter.api.BeforeEach
    void caller() {
        lenient().when(userRepository.findById("user1")).thenReturn(Optional.of(User.builder().id("user1").build()));
    }

    @Mock
    private ChatRoomRepository chatRoomRepository;

    @Mock
    private ParticipantService participantService;

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
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(false);

        assertThatThrownBy(() -> messageService.getRecentMessages("room1", "user1"))
                .isInstanceOf(ForbiddenActionException.class);
    }

    @Test
    void getRecentMessages_isParticipant_returnsMessages() {
        when(chatRoomRepository.existsById("room1")).thenReturn(true);
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);

        Message msg = Message.builder()
                .id("msg1")
                .chatRoomId("room1")
                .senderId("user1")
                .content("hello")
                .type(Message.MessageType.TEXT)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .isDeleted(false)
                .isUpdated(false)
                .build();

        User user = User.builder().id("user1").name("Alice").build();

        when(messageRepository.findTop50ByChatRoomIdAndIsDeletedFalseOrderByCreatedAtDesc("room1"))
                .thenReturn(List.of(msg));
        when(userRepository.findById("user1")).thenReturn(Optional.of(user));

        List<ChatMessageResponse> responses = messageService.getRecentMessages("room1", "user1");

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).content()).isEqualTo("hello");
        assertThat(responses.get(0).senderName()).isEqualTo("Alice");
    }

    @Test
    void persistMessage_savesMessage() {
        Message msg = Message.builder()
                .id("msg1")
                .chatRoomId("room1")
                .senderId("user1")
                .content("hello")
                .build();

        when(messageRepository.save(msg)).thenReturn(msg);
        assertThat(messageService.persistMessage(msg)).isSameAs(msg);

        ArgumentCaptor<Message> captor = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository).save(captor.capture());
        
        Message saved = captor.getValue();
        assertThat(saved.getId()).isEqualTo("msg1");
        assertThat(saved.getContent()).isEqualTo("hello");
    }
    @Test
    void persistMessage_databaseFailure_propagatesFailure() {
        Message message = Message.builder().id("failed").build();
        when(messageRepository.save(message)).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("unavailable"));
        assertThatThrownBy(() -> messageService.persistMessage(message))
                .isInstanceOf(com.lnt.chatmee.exception.DatabaseOperationException.class);
    }

    @Test
    void serialize_messageResponse_usesUtcInstantAndFrontendFlagNames() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        var instant = Instant.parse("2026-10-08T12:34:56Z");
        var response = ChatMessageResponse.builder().createdAt(instant).updatedAt(instant)
                .isUpdated(true).isDeleted(false).build();
        var json = mapper.readTree(mapper.writeValueAsString(response));
        assertThat(json.path("createdAt").asText()).isEqualTo("2026-10-08T12:34:56Z");
        assertThat(json.path("updatedAt").asText()).isEqualTo("2026-10-08T12:34:56Z");
        assertThat(json.path("isUpdated").asBoolean()).isTrue();
        assertThat(json.has("isDeleted")).isTrue();
        assertThat(json.has("updated")).isFalse();
        assertThat(json.has("deleted")).isFalse();
    }

    @Test
    void mongoMapping_legacyLocalDateTimeBsonDate_preservesStoredInstant() throws Exception {
        var converter = mongoConverter();
        var legacy = new org.bson.Document();
        converter.write(java.util.Map.of("createdAt", java.time.LocalDateTime.of(2026, 10, 8, 12, 34, 56)), legacy);
        assertThat(legacy.get("createdAt")).isInstanceOf(java.util.Date.class);
        var message = converter.read(Message.class, legacy);
        assertThat(message.getCreatedAt()).isEqualTo(((java.util.Date) legacy.get("createdAt")).toInstant());
    }

    @Test
    void mongoMapping_isoString_readsInstantButRejectsTimezoneLessString() throws Exception {
        var converter = mongoConverter();
        var instant = Instant.parse("2026-10-08T12:34:56Z");
        assertThat(converter.read(Message.class, new org.bson.Document("createdAt", instant.toString())).getCreatedAt())
                .isEqualTo(instant);
        assertThatThrownBy(() -> converter.read(Message.class, new org.bson.Document("createdAt", "2026-10-08T12:34:56")))
                .isInstanceOf(org.springframework.core.convert.ConversionFailedException.class);
    }

    private org.springframework.data.mongodb.core.convert.MappingMongoConverter mongoConverter() throws Exception {
        var conversions = org.springframework.data.mongodb.core.convert.MongoCustomConversions.create(adapter -> {});
        var context = new org.springframework.data.mongodb.core.mapping.MongoMappingContext();
        context.setSimpleTypeHolder(conversions.getSimpleTypeHolder());
        context.afterPropertiesSet();
        var converter = new org.springframework.data.mongodb.core.convert.MappingMongoConverter(
                org.springframework.data.mongodb.core.convert.NoOpDbRefResolver.INSTANCE, context);
        converter.setCustomConversions(conversions);
        converter.afterPropertiesSet();
        return converter;
    }

}
