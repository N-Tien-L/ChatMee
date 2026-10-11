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
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

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

        when(messageRepository.findPage("room1", PageRequest.of(0, 51)))
                .thenReturn(List.of(msg));
        when(userRepository.findAllById(Set.of("user1"))).thenReturn(List.of(user));

        List<ChatMessageResponse> responses = messageService.getRecentMessages("room1", "user1");

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).content()).isEqualTo("hello");
        assertThat(responses.get(0).senderName()).isEqualTo("Alice");
    }

    @Test
    void getMessages_oversizedOrInvalidLimit_clampsLimit() {
        allowHistory();
        when(messageRepository.findPage(eq("room1"), any(Pageable.class))).thenReturn(List.of());
        for (int limit : new int[]{0, -1, Integer.MIN_VALUE, 1, 100, Integer.MAX_VALUE}) {
            var page = messageService.getMessages("room1", "user1", null, limit);
            assertThat(page.messages()).isEmpty();
            assertThat(page.nextCursor()).isNull();
            assertThat(page.hasMore()).isFalse();
        }
        ArgumentCaptor<Pageable> requests = ArgumentCaptor.forClass(Pageable.class);
        verify(messageRepository, times(6)).findPage(eq("room1"), requests.capture());
        assertThat(requests.getAllValues()).extracting(Pageable::getPageSize)
                .containsExactly(51, 51, 51, 2, 101, 101);
        verify(userRepository, never()).findAllById(any());
    }

    @Test
    void getMessages_pageOfMessages_loadsSenderNamesInOneQuery() {
        allowHistory();
        Instant time = Instant.parse("2026-10-09T01:02:03.123Z");
        when(messageRepository.findPage("room1", PageRequest.of(0, 4))).thenReturn(List.of(
                historyMessage("m3", "sender-a", time), historyMessage("m2", "sender-b", time),
                historyMessage("m1", "sender-a", time), historyMessage("m0", "overfetch-sender", time)));
        when(userRepository.findAllById(Set.of("sender-a", "sender-b"))).thenReturn(List.of(
                User.builder().id("sender-a").name("Alice").build(),
                User.builder().id("sender-b").name("Bob").build()));

        var page = messageService.getMessages("room1", "user1", null, 3);

        assertThat(page.messages()).extracting(ChatMessageResponse::id).containsExactly("m1", "m2", "m3");
        assertThat(page.messages()).extracting(ChatMessageResponse::senderName).containsExactly("Alice", "Bob", "Alice");
        assertThat(page.nextCursor()).isEqualTo(cursor("1791507723123:m1"));
        assertThat(page.hasMore()).isTrue();
        verify(userRepository).findAllById(Set.of("sender-a", "sender-b"));
        verify(userRepository, times(1)).findById("user1");
        verify(userRepository, never()).findById("sender-a");
        verify(userRepository, never()).findById("sender-b");
        verifyNoMoreInteractions(userRepository);
    }

    @Test
    void getMessages_validCursor_queriesStrictlyBeforeTimeAndId() {
        allowHistory();
        Instant time = Instant.ofEpochMilli(1791507723123L);
        when(messageRepository.findPageBefore("room1", time, "m2", PageRequest.of(0, 3)))
                .thenReturn(List.of(historyMessage("m1", "unknown", time)));

        var page = messageService.getMessages("room1", "user1", cursor("1791507723123:m2"), 2);

        assertThat(page.messages()).extracting(ChatMessageResponse::id).containsExactly("m1");
        assertThat(page.messages().get(0).senderName()).isEqualTo("Unknown User");
        assertThat(page.nextCursor()).isNull();
        assertThat(page.hasMore()).isFalse();
        verify(messageRepository).findPageBefore("room1", time, "m2", PageRequest.of(0, 3));
        verify(messageRepository, never()).findPage(anyString(), any());
    }

    @Test
    void getMessages_malformedCursor_rejectsWithoutQueryingMessages() {
        allowHistory();
        for (String invalid : List.of("", "not-a-cursor", "%%%", cursor("missing-delimiter"),
                cursor("not-a-time:m1"), cursor("9223372036854775808:m1"), cursor("1:"),
                cursor("1: "), cursor("+1:m1"), cursor("01:m1"), cursor("1:m1") + "=",
                Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[]{(byte) 0xff}))) {
            assertThatThrownBy(() -> messageService.getMessages("room1", "user1", invalid, 50))
                    .isInstanceOf(com.lnt.chatmee.exception.InvalidRequestException.class)
                    .hasMessage("Malformed message cursor");
        }
        verifyNoInteractions(messageRepository);
    }

    @Test
    void getMessages_exactLimitWithoutOlderRows_hasNoNextCursor() {
        allowHistory();
        Instant time = Instant.parse("2026-10-09T01:02:03Z");
        when(messageRepository.findPage("room1", PageRequest.of(0, 3))).thenReturn(List.of(
                historyMessage("m2", "unknown", time), historyMessage("m1", "unknown", time.minusSeconds(1))));

        var page = messageService.getMessages("room1", "user1", null, 2);

        assertThat(page.messages()).extracting(ChatMessageResponse::id).containsExactly("m1", "m2");
        assertThat(page.nextCursor()).isNull();
        assertThat(page.hasMore()).isFalse();
    }

    @Test
    void getMessages_databaseFailure_preservesRetrievalFailureMapping() {
        allowHistory();
        when(messageRepository.findPage("room1", PageRequest.of(0, 51)))
                .thenThrow(new org.springframework.dao.DataAccessResourceFailureException("unavailable"));
        assertThatThrownBy(() -> messageService.getMessages("room1", "user1", null, 50))
                .isInstanceOf(com.lnt.chatmee.exception.DatabaseOperationException.class)
                .hasMessage("Failed to fetch messages");
    }

    private void allowHistory() {
        when(chatRoomRepository.existsById("room1")).thenReturn(true);
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
    }

    private static Message historyMessage(String id, String senderId, Instant time) {
        return Message.builder().id(id).chatRoomId("room1").senderId(senderId).content("History message")
                .type(Message.MessageType.TEXT).createdAt(time).updatedAt(time).isDeleted(false).build();
    }

    private static String cursor(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
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
        var mapper = new tools.jackson.databind.ObjectMapper();
        var instant = Instant.parse("2026-10-08T12:34:56Z");
        var response = ChatMessageResponse.builder().createdAt(instant).updatedAt(instant)
                .isUpdated(true).isDeleted(false).build();
        var json = mapper.readTree(mapper.writeValueAsString(response));
        assertThat(json.path("createdAt").asString()).isEqualTo("2026-10-08T12:34:56Z");
        assertThat(json.path("updatedAt").asString()).isEqualTo("2026-10-08T12:34:56Z");
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
