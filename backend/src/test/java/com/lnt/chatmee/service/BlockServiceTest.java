package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import com.lnt.chatmee.dto.response.BlockedUserResponse;
import com.lnt.chatmee.exception.ErrorCode;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.model.UserBlock;
import com.lnt.chatmee.repository.UserBlockRepository;
import com.lnt.chatmee.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class BlockServiceTest {
    @Mock UserBlockRepository blocks;
    @Mock UserRepository users;

    @InjectMocks BlockService service;

    // AC1: endpoints idempotent; self 400; unknown 404 (AC-009-15)

    @Test
    void block_newBlock_storesCallerAsBlockerWithTimestamp() {
        when(users.existsById("bob")).thenReturn(true);

        service.block("alice", "bob");

        verify(blocks).insert(argThat((UserBlock row) -> row.getBlockerId().equals("alice")
            && row.getBlockedId().equals("bob") && row.getCreatedAt() != null));
    }

    @Test
    void block_alreadyBlocked_succeedsWithoutSecondRow() {
        when(users.existsById("bob")).thenReturn(true);
        when(blocks.existsByBlockerIdAndBlockedId("alice", "bob")).thenReturn(true);

        service.block("alice", "bob");

        verify(blocks, never()).insert(any(UserBlock.class));
    }

    @Test
    void block_concurrentDuplicateInsert_succeeds() {
        when(users.existsById("bob")).thenReturn(true);
        when(blocks.insert(any(UserBlock.class))).thenThrow(new DuplicateKeyException("E11000"));

        service.block("alice", "bob");
    }

    @Test
    void block_self_throwsInvalidArgumentWithoutLookup() {
        InvalidRequestException ex = assertThrows(InvalidRequestException.class, () -> service.block("alice", "alice"));

        assertEquals(ErrorCode.INVALID_ARGUMENT, ex.getErrorCode());
        verifyNoInteractions(blocks, users);
    }

    @Test
    void block_unknownUser_throwsUserNotFoundWithoutInsert() {
        when(users.existsById("ghost")).thenReturn(false);

        assertThrows(UserNotFoundException.class, () -> service.block("alice", "ghost"));

        verify(blocks, never()).insert(any(UserBlock.class));
    }

    @Test
    void unblock_existingBlock_deletesCallersRow() {
        when(blocks.deleteByBlockerIdAndBlockedId("alice", "bob")).thenReturn(1L);

        service.unblock("alice", "bob");

        verify(blocks).deleteByBlockerIdAndBlockedId("alice", "bob");
    }

    @Test
    void unblock_noBlock_succeeds() {
        when(blocks.deleteByBlockerIdAndBlockedId("alice", "bob")).thenReturn(0L);
        when(users.existsById("bob")).thenReturn(true);

        service.unblock("alice", "bob");
    }

    @Test
    void unblock_self_throwsInvalidArgument() {
        assertThrows(InvalidRequestException.class, () -> service.unblock("alice", "alice"));

        verifyNoInteractions(blocks, users);
    }

    @Test
    void unblock_unknownUserWithoutBlock_throwsUserNotFound() {
        when(blocks.deleteByBlockerIdAndBlockedId("alice", "ghost")).thenReturn(0L);
        when(users.existsById("ghost")).thenReturn(false);

        assertThrows(UserNotFoundException.class, () -> service.unblock("alice", "ghost"));
    }

    @Test
    void unblock_deletedUserStillBlocked_removesRow() {
        when(blocks.deleteByBlockerIdAndBlockedId("alice", "ghost")).thenReturn(1L);

        service.unblock("alice", "ghost");

        verify(users, never()).existsById(anyString());
    }

    @Test
    void listBlocks_caller_mapsOwnBlocksNewestFirstWithDeletedUserFallback() {
        Instant newer = Instant.parse("2026-10-12T10:00:00Z");
        Instant older = Instant.parse("2026-10-11T10:00:00Z");
        when(blocks.findByBlockerIdOrderByCreatedAtDesc("alice")).thenReturn(List.of(
            UserBlock.builder().blockerId("alice").blockedId("bob").createdAt(newer).build(),
            UserBlock.builder().blockerId("alice").blockedId("ghost").createdAt(older).build()));
        when(users.findAllById(Set.of("bob", "ghost"))).thenReturn(List.of(
            User.builder().id("bob").name("Bob").avatarUrl("b.png").build()));

        List<BlockedUserResponse> listed = service.listBlocks("alice");

        assertThat(listed).containsExactly(
            new BlockedUserResponse("bob", "Bob", "b.png", newer),
            new BlockedUserResponse("ghost", "Deleted user", null, older));
    }

    @Test
    void listBlocks_noBlocks_returnsEmptyWithoutUserQuery() {
        when(blocks.findByBlockerIdOrderByCreatedAtDesc("alice")).thenReturn(List.of());

        assertThat(service.listBlocks("alice")).isEmpty();

        verifyNoInteractions(users);
    }

    // AC2: one check, both directions, one generic text per action (AC-009-16, AC-009-18)

    @Test
    void isBlockedEitherWay_blockInEitherDirection_returnsTrueForBothArgumentOrders() {
        when(blocks.existsEitherWay("alice", "bob")).thenReturn(true);
        when(blocks.existsEitherWay("bob", "alice")).thenReturn(true);

        assertThat(service.isBlockedEitherWay("alice", "bob")).isTrue();
        assertThat(service.isBlockedEitherWay("bob", "alice")).isTrue();
    }

    @Test
    void isBlockedEitherWay_noBlockOrMissingUser_returnsFalse() {
        when(blocks.existsEitherWay("alice", "bob")).thenReturn(false);

        assertThat(service.isBlockedEitherWay("alice", "bob")).isFalse();
        assertThat(service.isBlockedEitherWay("alice", null)).isFalse();
    }

    @Test
    void genericMessages_blockedActions_doNotNameTheBlocker() {
        assertEquals("Cannot message this user", BlockService.CANNOT_MESSAGE);
        assertEquals("Cannot invite this user", BlockService.CANNOT_INVITE);
    }

    @Test
    void blockedEitherWay_blocksBothWays_returnsTheOtherUsers() {
        when(blocks.findInvolving("alice")).thenReturn(List.of(
            UserBlock.builder().blockerId("alice").blockedId("bob").build(),
            UserBlock.builder().blockerId("carol").blockedId("alice").build()));

        assertThat(service.blockedEitherWay("alice")).containsExactlyInAnyOrder("bob", "carol");
    }

    @Test
    void blockedBy_candidates_returnsOnlyUsersTheBlockerBlocked() {
        when(blocks.findByBlockerIdAndBlockedIdIn("alice", Set.of("bob", "carol"))).thenReturn(List.of(
            UserBlock.builder().blockerId("alice").blockedId("bob").build()));

        assertThat(service.blockedBy("alice", Set.of("bob", "carol"))).containsExactly("bob");
        assertThat(service.blockedBy("alice", Set.of())).isEmpty();
    }
}
