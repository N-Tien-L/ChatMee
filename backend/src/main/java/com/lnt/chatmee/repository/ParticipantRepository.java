package com.lnt.chatmee.repository;

import java.time.Instant;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.data.mongodb.repository.Update;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.Participant.Role;

/** The participants collection is the single source of truth for room membership (ADR-0001, ADR-0005). */
@Repository
public interface ParticipantRepository extends MongoRepository<Participant, String> {

    List<Participant> findByChatRoomId(String chatRoomId);

    List<Participant> findByChatRoomIdIn(Collection<String> chatRoomIds);

    List<Participant> findByUserId(String userId);

    Optional<Participant> findByChatRoomIdAndUserId(String chatRoomId, String userId);

    boolean existsByChatRoomIdAndUserId(String chatRoomId, String userId);

    /** Use $max so delayed concurrent mark-read requests cannot move the marker backwards. */
    @Query("{ 'chatRoomId': ?0, 'userId': ?1 }")
    @Update("{ '$max': { 'lastReadAt': ?2 } }")
    long markRead(String roomId, String userId, Instant now);

    /** Hides the room for this member only (AC-009-21). @return 0 when the user is not a member */
    @Query("{ 'chatRoomId': ?0, 'userId': ?1 }")
    @Update("{ '$set': { 'hiddenAt': ?2 } }")
    long hide(String roomId, String userId, Instant now);

    /**
     * Conditional unhide (AC-009-21, D-06): clears {@code hiddenAt} only for members who hid the room before
     * the message was created, so a hide that happens after the message stays in effect.
     */
    @Query("{ 'chatRoomId': ?0, 'hiddenAt': { '$lt': ?1 } }")
    @Update("{ '$unset': { 'hiddenAt': '' } }")
    long unhideBefore(String roomId, Instant messageCreatedAt);

    long countByChatRoomId(String chatRoomId);

    /** @return the number of deleted rows (0 or 1 thanks to the unique (chatRoomId, userId) index) */
    long deleteByChatRoomIdAndUserId(String chatRoomId, String userId);

    /** Deletes only a row that still has {@code role}, so a concurrent role change makes the caller retry. */
    long deleteByChatRoomIdAndUserIdAndRole(String chatRoomId, String userId, Role role);

    /** Conditional role write (ADR-0005): matches only a row that still has {@code fromRole}. */
    @Query("{ 'chatRoomId': ?0, 'userId': ?1, 'role': ?2 }")
    @Update("{ '$set': { 'role': ?3 } }")
    long updateRoleIfCurrent(String chatRoomId, String userId, Role fromRole, Role toRole);

    long deleteByChatRoomId(String chatRoomId);
}
