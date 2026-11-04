package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Pageable;

import com.lnt.chatmee.dto.request.ChatMessageRequest;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.dto.response.MessageContextResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;

import tools.jackson.databind.ObjectMapper;

/** SPEC-014 contextual reply: server-derived snapshot, target checks, redaction and the context window. */
@ExtendWith(MockitoExtension.class)
class MessageReplyServiceTest {

    private static final Instant T0 = Instant.parse("2026-11-01T00:00:00Z");

    @Mock ChatRoomRepository chatRoomRepository;
    @Mock ParticipantService participantService;
    @Mock MessageRepository messageRepository;
    @Mock UserRepository userRepository;
    @Mock UserEventPublisher userEvents;
    @Mock DirectMessageRequestService dmRequests;
    @Mock ParticipantRepository participantRepository;
    @Mock BlockService blocks;

    @InjectMocks MessageService messageService;

    @BeforeEach
    void users() {
        lenient().when(userRepository.findById("user1"))
                .thenReturn(Optional.of(User.builder().id("user1").name("Alice").build()));
        lenient().when(userRepository.findById("user2"))
                .thenReturn(Optional.of(User.builder().id("user2").name("Bob").build()));
        lenient().when(messageRepository.save(any(Message.class))).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void sendMessage_reply_storesServerDerivedSnapshot() {
        member("user1");
        String longText = "x".repeat(130);
        target(Message.builder().id("t1").chatRoomId("room1").senderId("user2").content(longText)
                .type(Message.MessageType.TEXT).createdAt(T0).build());

        ChatMessageResponse response = messageService.sendMessage(reply("t1", "c1"), "user1");

        Message saved = savedMessage();
        assertThat(saved.getReplyTo()).isEqualTo(new Message.ReplySnapshot("t1", "user2", "Bob",
                "x".repeat(120), Message.MessageType.TEXT));
        assertThat(response.replyTo().preview()).hasSize(120);
        assertThat(response.replyTo().senderName()).isEqualTo("Bob");
    }

    @Test
    void sendMessage_replyPayloadSnapshotIgnored() throws Exception {
        member("user1");
        target(Message.builder().id("t1").chatRoomId("room1").senderId("user2").content("real")
                .type(Message.MessageType.TEXT).createdAt(T0).build());
        // A client cannot supply the snapshot: unknown request fields are dropped on binding.
        ChatMessageRequest request = new ObjectMapper().readValue("""
                {"roomId":"room1","content":"hi","tempId":"c1","replyToMessageId":"t1",
                 "replyTo":{"messageId":"t1","senderId":"x","senderName":"Forged","preview":"forged","type":"TEXT"}}
                """, ChatMessageRequest.class);

        messageService.sendMessage(request, "user1");

        assertThat(savedMessage().getReplyTo().senderName()).isEqualTo("Bob");
        assertThat(savedMessage().getReplyTo().preview()).isEqualTo("real");
    }

    @Test
    void sendMessage_replyToOtherRoom_rejected() {
        member("user1");
        target(Message.builder().id("t1").chatRoomId("other-room").senderId("user2").content("secret")
                .type(Message.MessageType.TEXT).createdAt(T0).build());

        assertThatThrownBy(() -> messageService.sendMessage(reply("t1", "c1"), "user1"))
                .isInstanceOf(InvalidRequestException.class).hasMessage("Reply target unavailable");
        verify(messageRepository, never()).save(any());
    }

    @Test
    void sendMessage_replyToDeleted_rejected() {
        member("user1");
        target(Message.builder().id("t1").chatRoomId("room1").senderId("user2").content("gone")
                .type(Message.MessageType.TEXT).createdAt(T0).isDeleted(true).build());

        assertThatThrownBy(() -> messageService.sendMessage(reply("t1", "c1"), "user1"))
                .isInstanceOf(InvalidRequestException.class).hasMessage("Reply target unavailable");
        verify(messageRepository, never()).save(any());
    }

    @Test
    void sendMessage_replyToMissing_rejectedWithSameText() {
        member("user1");
        when(messageRepository.findById("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> messageService.sendMessage(reply("nope", "c1"), "user1"))
                .isInstanceOf(InvalidRequestException.class).hasMessage("Reply target unavailable");
    }

    @Test
    void sendMessage_replyToUnreadable_rejected() {
        // A non-member cannot read the room's history, so the target is never read or copied (AC-014-2).
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(false);
        when(dmRequests.acceptByReply("room1", "user1")).thenReturn(false);

        assertThatThrownBy(() -> messageService.sendMessage(reply("t1", "c1"), "user1"))
                .isInstanceOf(ForbiddenActionException.class);
        verify(messageRepository, never()).findById(anyString());
        verify(messageRepository, never()).save(any());
    }

    @Test
    void sendMessage_replyRetry_keepsSnapshot() {
        member("user1");
        Message stored = Message.builder().id("m1").chatRoomId("room1").senderId("user1").clientMessageId("c1")
                .content("hi").type(Message.MessageType.TEXT).createdAt(T0)
                .replyTo(new Message.ReplySnapshot("t1", "user2", "Bob", "original", Message.MessageType.TEXT))
                .build();
        when(messageRepository.findFirstByChatRoomIdAndSenderIdAndClientMessageId("room1", "user1", "c1"))
                .thenReturn(Optional.of(stored));
        when(messageRepository.save(any(Message.class))).thenThrow(new DuplicateKeyException("E11000"));

        ChatMessageResponse retry = messageService.sendMessage(reply("t1", "c1"), "user1");

        // The target is not re-read, even if it changed or was deleted after the first attempt.
        verify(messageRepository, never()).findById("t1");
        assertThat(retry.id()).isEqualTo("m1");
        assertThat(retry.replyTo().preview()).isEqualTo("original");
    }

    @Test
    void sendMessage_systemTarget_usesTypeLabelWithEmptyPreview() {
        member("user1");
        target(Message.builder().id("t1").chatRoomId("room1").senderId("SYSTEM").content("Bob joined")
                .type(Message.MessageType.SYSTEM).createdAt(T0).build());

        messageService.sendMessage(reply("t1", "c1"), "user1");

        assertThat(savedMessage().getReplyTo()).isEqualTo(new Message.ReplySnapshot("t1", "SYSTEM", "System", "",
                Message.MessageType.SYSTEM));
    }

    @Test
    void history_legacyMessage_replyToNull() {
        historyRoom();
        when(messageRepository.findPage(eq("room1"), any(Pageable.class))).thenReturn(new ArrayList<>(List.of(
                Message.builder().id("m1").chatRoomId("room1").senderId("user2").content("old")
                        .type(Message.MessageType.TEXT).createdAt(T0).build())));

        var page = messageService.getMessages("room1", "user1", null, 50);

        assertThat(page.messages().get(0).replyTo()).isNull();
        // No reply on the page: no extra target query.
        verify(messageRepository, never()).findByIdInAndIsDeletedTrue(any());
    }

    @Test
    void history_replyToDeletedTarget_redactsPreview() {
        historyRoom();
        Message reply = Message.builder().id("m2").chatRoomId("room1").senderId("user1").content("re")
                .type(Message.MessageType.TEXT).createdAt(T0)
                .replyTo(new Message.ReplySnapshot("t1", "user2", "Bob", "original", Message.MessageType.TEXT))
                .build();
        Message liveReply = Message.builder().id("m3").chatRoomId("room1").senderId("user1").content("re2")
                .type(Message.MessageType.TEXT).createdAt(T0.plusSeconds(1))
                .replyTo(new Message.ReplySnapshot("t2", "user2", "Bob", "still here", Message.MessageType.TEXT))
                .build();
        when(messageRepository.findPage(eq("room1"), any(Pageable.class)))
                .thenReturn(new ArrayList<>(List.of(liveReply, reply)));
        when(messageRepository.findByIdInAndIsDeletedTrue(any()))
                .thenReturn(List.of(Message.builder().id("t1").isDeleted(true).build()));

        var messages = messageService.getMessages("room1", "user1", null, 50).messages();

        assertThat(messages.get(0).replyTo().preview()).isNull();
        assertThat(messages.get(0).replyTo().senderName()).isEqualTo("Bob");
        assertThat(messages.get(1).replyTo().preview()).isEqualTo("still here");
    }

    @Test
    void context_nonMember_returns404() {
        when(chatRoomRepository.existsById("room1")).thenReturn(true);
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(false);

        assertThatThrownBy(() -> messageService.getMessageContext("room1", "t1", "user1", 20))
                .isInstanceOf(ChatRoomNotFoundException.class);
        verify(messageRepository, never()).findById(anyString());
    }

    @Test
    void context_unknownRoomOrDeletedOrForeignTarget_returns404() {
        when(chatRoomRepository.existsById("ghost")).thenReturn(false);
        assertThatThrownBy(() -> messageService.getMessageContext("ghost", "t1", "user1", 20))
                .isInstanceOf(ChatRoomNotFoundException.class);

        when(chatRoomRepository.existsById("room1")).thenReturn(true);
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
        when(messageRepository.findById("deleted")).thenReturn(Optional.of(Message.builder().id("deleted")
                .chatRoomId("room1").isDeleted(true).build()));
        when(messageRepository.findById("foreign")).thenReturn(Optional.of(Message.builder().id("foreign")
                .chatRoomId("other").build()));
        when(messageRepository.findById("missing")).thenReturn(Optional.empty());
        for (String id : List.of("deleted", "foreign", "missing")) {
            assertThatThrownBy(() -> messageService.getMessageContext("room1", id, "user1", 20))
                    .isInstanceOf(ChatRoomNotFoundException.class).hasMessage("Message not found");
        }
    }

    @Test
    void context_limitClamped() {
        when(chatRoomRepository.existsById("room1")).thenReturn(true);
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
        Message target = msg("t", 0);
        when(messageRepository.findById("t")).thenReturn(Optional.of(target));
        ArgumentCaptor<Pageable> before = ArgumentCaptor.forClass(Pageable.class);
        ArgumentCaptor<Pageable> after = ArgumentCaptor.forClass(Pageable.class);
        when(messageRepository.findPageBefore(eq("room1"), eq(T0), eq("t"), before.capture())).thenReturn(List.of());
        when(messageRepository.findPageAfter(eq("room1"), eq(T0), eq("t"), after.capture())).thenReturn(List.of());

        messageService.getMessageContext("room1", "t", "user1", 500);
        messageService.getMessageContext("room1", "t", "user1", 0);

        // One extra row per side detects hasBefore/hasAfter.
        assertThat(before.getAllValues()).extracting(Pageable::getPageSize).containsExactly(51, 21);
        assertThat(after.getAllValues()).extracting(Pageable::getPageSize).containsExactly(51, 21);
    }

    @Test
    void context_window_ordersOldestFirstWithCursorsOnlyWhenMore() {
        when(chatRoomRepository.existsById("room1")).thenReturn(true);
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
        Message target = msg("t", 0);
        when(messageRepository.findById("t")).thenReturn(Optional.of(target));
        // Repository returns newest-first before the target and oldest-first after it.
        when(messageRepository.findPageBefore(eq("room1"), eq(T0), eq("t"), any()))
                .thenReturn(List.of(msg("b1", -1), msg("b2", -2), msg("b3", -3)));
        when(messageRepository.findPageAfter(eq("room1"), eq(T0), eq("t"), any()))
                .thenReturn(List.of(msg("a1", 1)));

        MessageContextResponse context = messageService.getMessageContext("room1", "t", "user1", 2);

        assertThat(context.messages()).extracting(ChatMessageResponse::id).containsExactly("b2", "b1", "t", "a1");
        assertThat(context.targetId()).isEqualTo("t");
        assertThat(context.hasBefore()).isTrue();
        assertThat(context.hasAfter()).isFalse();
        assertThat(MessageCursor.decode(context.beforeCursor()))
                .isEqualTo(new MessageCursor(T0.minusSeconds(2), "b2"));
        assertThat(context.afterCursor()).isNull();
    }

    private Message msg(String id, int seconds) {
        return Message.builder().id(id).chatRoomId("room1").senderId("user2").content(id)
                .type(Message.MessageType.TEXT).createdAt(T0.plusSeconds(seconds)).build();
    }

    private void member(String userId) {
        when(participantService.isUserParticipant("room1", userId)).thenReturn(true);
        lenient().when(chatRoomRepository.findByIdAndIsActiveTrue("room1")).thenReturn(Optional.empty());
    }

    private void historyRoom() {
        when(chatRoomRepository.existsById("room1")).thenReturn(true);
        when(participantService.isUserParticipant("room1", "user1")).thenReturn(true);
    }

    private void target(Message target) {
        when(messageRepository.findById(target.getId())).thenReturn(Optional.of(target));
    }

    private Message savedMessage() {
        ArgumentCaptor<Message> saved = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository, org.mockito.Mockito.atLeastOnce()).save(saved.capture());
        return saved.getValue();
    }

    private static ChatMessageRequest reply(String targetId, String tempId) {
        ChatMessageRequest request = new ChatMessageRequest();
        request.setRoomId("room1");
        request.setContent("reply");
        request.setTempId(tempId);
        request.setReplyToMessageId(targetId);
        return request;
    }
}
