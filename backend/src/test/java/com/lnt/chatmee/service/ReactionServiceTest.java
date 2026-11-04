package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.lnt.chatmee.dto.event.ReactionUpdatedEvent;
import com.lnt.chatmee.dto.response.ReactionSummaryResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.Reaction;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ReactionRepository;
import com.lnt.chatmee.repository.ReactionTally;
import com.lnt.chatmee.repository.UserRepository;

/** SPEC-015 reactions: authorization, validation, events and summaries. */
@ExtendWith(MockitoExtension.class)
class ReactionServiceTest {

    private static final String THUMBS = new String(Character.toChars(0x1F44D));
    private static final String HEART = new String(Character.toChars(0x2764));
    private static final Instant T0 = Instant.parse("2026-11-01T00:00:00Z");

    @Mock ReactionRepository reactions;
    @Mock MessageRepository messages;
    @Mock ChatRoomRepository rooms;
    @Mock UserRepository users;
    @Mock ParticipantService participants;
    @Mock BlockService blocks;
    @Mock UserEventPublisher events;

    @InjectMocks ReactionService service;

    private void room(ChatRoom.RoomType type, String memberKey) {
        when(rooms.findByIdAndIsActiveTrue("r1")).thenReturn(Optional.of(ChatRoom.builder().id("r1").type(type)
                .memberKey(memberKey).build()));
    }

    private void member() {
        when(participants.isUserParticipant("r1", "u1")).thenReturn(true);
    }

    private void message(Message.MessageType type) {
        when(messages.findById("m1")).thenReturn(Optional.of(Message.builder().id("m1").chatRoomId("r1")
                .senderId("u2").type(type).content("hi").createdAt(T0).build()));
    }

    @Test
    void react_member_savesPublishesAndReturnsOwnSummary() {
        room(ChatRoom.RoomType.PUBLIC, null);
        member();
        message(Message.MessageType.TEXT);
        when(reactions.tally(List.of("m1"), "u1")).thenReturn(List.of(new ReactionTally("m1", THUMBS, 2, T0, 1)));

        var response = service.react("r1", "m1", "u1", THUMBS);

        verify(reactions).setReaction(eq("m1"), eq("r1"), eq("u1"), eq(THUMBS), any(Instant.class));
        assertThat(response.reactions()).containsExactly(new ReactionSummaryResponse(THUMBS, 2, true));
    }

    @Test
    void react_publishesRoomEvent() {
        room(ChatRoom.RoomType.PUBLIC, null);
        member();
        message(Message.MessageType.TEXT);
        when(reactions.tally(List.of("m1"), "u1")).thenReturn(List.of(new ReactionTally("m1", THUMBS, 2, T0, 1)));

        service.react("r1", "m1", "u1", THUMBS);

        ArgumentCaptor<ReactionUpdatedEvent> event = ArgumentCaptor.forClass(ReactionUpdatedEvent.class);
        verify(events).reactionUpdated(eq("r1"), event.capture());
        assertThat(event.getValue().event()).isEqualTo("REACTION_UPDATED");
        assertThat(event.getValue().messageId()).isEqualTo("m1");
        // Counts only: reactedByMe is per client.
        assertThat(event.getValue().summary()).containsExactly(new ReactionUpdatedEvent.Count(THUMBS, 2));
    }

    @Test
    void react_invalidEmoji_400() {
        assertThatThrownBy(() -> service.react("r1", "m1", "u1", "ok"))
                .isInstanceOf(InvalidRequestException.class);
        verifyNoInteractions(reactions, events, messages);
    }

    @Test
    void react_nonMember_404() {
        room(ChatRoom.RoomType.PUBLIC, null);
        when(participants.isUserParticipant("r1", "u1")).thenReturn(false);

        assertThatThrownBy(() -> service.react("r1", "m1", "u1", THUMBS))
                .isInstanceOf(ChatRoomNotFoundException.class).hasMessage("Message not found");
        verify(messages, never()).findById(anyString());
    }

    @Test
    void react_unknownRoomOrMessage_404() {
        when(rooms.findByIdAndIsActiveTrue("ghost")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.react("ghost", "m1", "u1", THUMBS))
                .isInstanceOf(ChatRoomNotFoundException.class);

        room(ChatRoom.RoomType.PUBLIC, null);
        member();
        when(messages.findById("other")).thenReturn(Optional.of(Message.builder().id("other").chatRoomId("r2")
                .type(Message.MessageType.TEXT).build()));
        when(messages.findById("deleted")).thenReturn(Optional.of(Message.builder().id("deleted").chatRoomId("r1")
                .type(Message.MessageType.TEXT).isDeleted(true).build()));
        for (String id : List.of("other", "deleted", "missing")) {
            assertThatThrownBy(() -> service.react("r1", id, "u1", THUMBS))
                    .isInstanceOf(ChatRoomNotFoundException.class).hasMessage("Message not found");
        }
        verifyNoInteractions(reactions);
    }

    @Test
    void react_systemMessage_rejected() {
        room(ChatRoom.RoomType.PUBLIC, null);
        member();
        message(Message.MessageType.SYSTEM);

        assertThatThrownBy(() -> service.react("r1", "m1", "u1", THUMBS))
                .isInstanceOf(InvalidRequestException.class);
        verifyNoInteractions(reactions);
    }

    @Test
    void react_blockedDm_forbidden() {
        room(ChatRoom.RoomType.DIRECT_MESSAGE, "u1:u2");
        member();
        message(Message.MessageType.TEXT);
        when(blocks.isBlockedEitherWay("u1", "u2")).thenReturn(true);

        assertThatThrownBy(() -> service.react("r1", "m1", "u1", THUMBS))
                .isInstanceOf(ForbiddenActionException.class).hasMessage(BlockService.CANNOT_MESSAGE);
        assertThatThrownBy(() -> service.unreact("r1", "m1", "u1"))
                .isInstanceOf(ForbiddenActionException.class);
        verifyNoInteractions(reactions, events);
    }

    @Test
    void react_delete_idempotent() {
        room(ChatRoom.RoomType.PUBLIC, null);
        member();
        message(Message.MessageType.TEXT);
        when(reactions.deleteByMessageIdAndUserId("m1", "u1")).thenReturn(0L);

        var response = service.unreact("r1", "m1", "u1");

        // Nothing removed: success without an event.
        assertThat(response.messageId()).isEqualTo("m1");
        verify(events, never()).reactionUpdated(anyString(), any());
    }

    @Test
    void unreact_existing_publishesUpdatedCounts() {
        room(ChatRoom.RoomType.PUBLIC, null);
        member();
        message(Message.MessageType.TEXT);
        when(reactions.deleteByMessageIdAndUserId("m1", "u1")).thenReturn(1L);
        when(reactions.tally(List.of("m1"), "u1")).thenReturn(List.of());

        var response = service.unreact("r1", "m1", "u1");

        assertThat(response.reactions()).isEmpty();
        ArgumentCaptor<ReactionUpdatedEvent> event = ArgumentCaptor.forClass(ReactionUpdatedEvent.class);
        verify(events).reactionUpdated(eq("r1"), event.capture());
        assertThat(event.getValue().summary()).isEmpty();
    }

    @Test
    void summaries_topSixByCountThenFirstReaction() {
        var tallies = new java.util.ArrayList<ReactionTally>();
        for (int i = 0; i < 8; i++) {
            tallies.add(new ReactionTally("m1", "e" + i, i < 2 ? 5 : 1, T0.plusSeconds(10 - i), i == 7 ? 1 : 0));
        }
        when(reactions.tally(List.of("m1"), "u1")).thenReturn(tallies);

        List<ReactionSummaryResponse> top = service.summaries(List.of("m1"), "u1").get("m1");

        // Count desc; ties by the earliest first reaction (e7 reacted earliest among the ones).
        assertThat(top).extracting(ReactionSummaryResponse::emoji).containsExactly("e1", "e0", "e7", "e6", "e5", "e4");
        assertThat(top.get(2).reactedByMe()).isTrue();
    }

    @Test
    void summaries_noMessages_noQuery() {
        assertThat(service.summaries(List.of(), "u1")).isEmpty();
        verifyNoInteractions(reactions);
    }

    @Test
    void reactions_list_pagedAndFiltered() {
        room(ChatRoom.RoomType.PUBLIC, null);
        member();
        message(Message.MessageType.TEXT);
        List<Reaction> rows = List.of(
                Reaction.builder().id("x3").userId("u3").emoji(HEART).createdAt(T0.plusSeconds(3)).build(),
                Reaction.builder().id("x2").userId("u2").emoji(HEART).createdAt(T0.plusSeconds(2)).build(),
                Reaction.builder().id("x1").userId("u1").emoji(HEART).createdAt(T0.plusSeconds(1)).build());
        when(reactions.findPage("m1", HEART, null, null, 3)).thenReturn(rows);
        when(users.findAllById(any())).thenReturn(List.of(User.builder().id("u3").name("Cleo").build(),
                User.builder().id("u2").name("Bob").build()));

        var page = service.listReactors("r1", "m1", "u1", HEART, null, 2);

        assertThat(page.reactions()).extracting(r -> r.displayName()).containsExactly("Cleo", "Bob");
        assertThat(page.hasMore()).isTrue();
        assertThat(MessageCursor.decode(page.nextCursor())).isEqualTo(new MessageCursor(T0.plusSeconds(2), "x2"));

        when(reactions.findPage("m1", null, T0.plusSeconds(2), "x2", 21)).thenReturn(List.of(rows.get(2)));
        lenient().when(users.findAllById(any())).thenReturn(List.of());
        var next = service.listReactors("r1", "m1", "u1", " ", page.nextCursor(), 0);
        assertThat(next.reactions()).extracting(r -> r.userId()).containsExactly("u1");
        assertThat(next.reactions().get(0).displayName()).isEqualTo("Deleted user");
        assertThat(next.hasMore()).isFalse();
        assertThat(next.nextCursor()).isNull();
    }

    @Test
    void reactions_listNonMember_404() {
        room(ChatRoom.RoomType.PUBLIC, null);
        when(participants.isUserParticipant("r1", "u1")).thenReturn(false);
        assertThatThrownBy(() -> service.listReactors("r1", "m1", "u1", null, null, 20))
                .isInstanceOf(ChatRoomNotFoundException.class);
    }

    @Test
    void deleteRoom_removesReactions() {
        service.deleteForRoom("r1");
        verify(reactions).deleteByRoomId("r1");
    }
}
