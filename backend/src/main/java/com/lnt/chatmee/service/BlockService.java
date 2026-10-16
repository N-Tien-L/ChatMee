package com.lnt.chatmee.service;

import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.dto.response.BlockedUserResponse;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.model.UserBlock;
import com.lnt.chatmee.repository.UserBlockRepository;
import com.lnt.chatmee.repository.UserRepository;

import lombok.RequiredArgsConstructor;

/**
 * Blocks (SPEC-009 AC-009-15..19, ADR-0006). The blocker is always the caller. Every blocked action answers with the
 * same generic text in both directions, so the blocked user cannot tell that a block exists (AC-009-18).
 * Logs carry ids only.
 */
@Service
@RequiredArgsConstructor
public class BlockService {

    public static final String CANNOT_MESSAGE = "Cannot message this user";
    public static final String CANNOT_INVITE = "Cannot invite this user";

    private static final Logger logger = LoggerFactory.getLogger(BlockService.class);

    private final UserBlockRepository blocks;
    private final UserRepository userRepository;

    /** Idempotent: blocking twice keeps one row. */
    public void block(String blockerId, String blockedId) {
        requireOther(blockerId, blockedId);
        if (!userRepository.existsById(blockedId)) {
            throw new UserNotFoundException("User not found");
        }
        if (blocks.existsByBlockerIdAndBlockedId(blockerId, blockedId)) {
            return;
        }
        try {
            blocks.insert(UserBlock.builder().blockerId(blockerId).blockedId(blockedId).createdAt(Instant.now()).build());
        } catch (DuplicateKeyException ex) {
            // A concurrent request stored the same block first.
            return;
        }
        logger.info("User {} blocked user {}", blockerId, blockedId);
    }

    /** Idempotent: unblocking without a block succeeds. A block of a since-deleted user can still be removed. */
    public void unblock(String blockerId, String blockedId) {
        requireOther(blockerId, blockedId);
        if (blocks.deleteByBlockerIdAndBlockedId(blockerId, blockedId) > 0) {
            logger.info("User {} unblocked user {}", blockerId, blockedId);
            return;
        }
        if (!userRepository.existsById(blockedId)) {
            throw new UserNotFoundException("User not found");
        }
    }

    /** The caller's own blocks, newest first, with one user query. */
    public List<BlockedUserResponse> listBlocks(String blockerId) {
        List<UserBlock> rows = blocks.findByBlockerIdOrderByCreatedAtDesc(blockerId);
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<String, User> users = new HashMap<>();
        userRepository.findAllById(rows.stream().map(UserBlock::getBlockedId).collect(Collectors.toSet()))
            .forEach(user -> users.put(user.getId(), user));
        return rows.stream().map(row -> {
            User user = users.get(row.getBlockedId());
            String name = user == null || user.getName() == null || user.getName().isBlank() ? "Deleted user" : user.getName();
            return new BlockedUserResponse(row.getBlockedId(), name, user == null ? null : user.getAvatarUrl(),
                row.getCreatedAt());
        }).toList();
    }

    /** The one block check (AC-009-16): true if either user blocked the other. */
    public boolean isBlockedEitherWay(String firstUserId, String secondUserId) {
        if (firstUserId == null || secondUserId == null) {
            return false;
        }
        return blocks.existsEitherWay(firstUserId, secondUserId);
    }

    /** Users the given user blocked or was blocked by, for search exclusion (AC-009-17) and request filtering. */
    public Set<String> blockedEitherWay(String userId) {
        Set<String> others = new HashSet<>();
        blocks.findInvolving(userId).forEach(row ->
            others.add(userId.equals(row.getBlockerId()) ? row.getBlockedId() : row.getBlockerId()));
        return others;
    }

    /** The candidates the blocker blocked: drives {@code blocked} in the blocker's room view only (AC-009-19). */
    public Set<String> blockedBy(String blockerId, Collection<String> candidateIds) {
        if (candidateIds.isEmpty()) {
            return Set.of();
        }
        return blocks.findByBlockerIdAndBlockedIdIn(blockerId, candidateIds).stream()
            .map(UserBlock::getBlockedId)
            .collect(Collectors.toSet());
    }

    private static void requireOther(String callerId, String targetId) {
        if (callerId.equals(targetId)) {
            throw new InvalidRequestException("You cannot block yourself");
        }
    }
}
