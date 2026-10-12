package com.lnt.chatmee.repository;

import java.time.LocalDateTime;
import java.time.Instant;
import com.lnt.chatmee.dto.event.LastMessageSummary;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.data.mongodb.repository.Update;
import org.springframework.stereotype.Repository;

import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomSettings;
import com.lnt.chatmee.model.ChatRoom.RoomType;

@Repository
public interface ChatRoomRepository extends MongoRepository<ChatRoom, String> {

    Optional<ChatRoom> findByIdAndIsActiveTrue(String roomId);

    Optional<ChatRoom> findByMemberKeyAndIsActiveTrue(String memberKey);

    List<ChatRoom> findByIdInAndIsActiveTrue(Collection<String> roomIds);

    List<ChatRoom> findByTypeAndIsActiveTrue(RoomType type);
    List<ChatRoom> findByCreatedByAndIsActiveTrue(String userId);
    List<ChatRoom> findByNameContainingIgnoreCaseAndTypeAndIsActiveTrue(String name, RoomType type);

    /** Derived "contains" queries quote the search text, so regex characters in it match literally. */
    Page<ChatRoom> findByTypeAndIsActiveTrueAndNameContainingIgnoreCaseAndIdNotIn(RoomType type, String name,
            Collection<String> excludedIds, Pageable pageable);

    /** Active PUBLIC rooms whose name contains {@code name} (case-insensitive, literal), minus {@code excludedIds}. */
    default Page<ChatRoom> findDiscoverable(String name, Collection<String> excludedIds, Pageable pageable) {
        return findByTypeAndIsActiveTrueAndNameContainingIgnoreCaseAndIdNotIn(RoomType.PUBLIC, name, excludedIds,
                pageable);
    }

    /**
     * Atomically takes one seat in an active room if it has capacity (maxParticipants <= 0 means unlimited).
     * A missing memberCount (rooms created before CM-028) counts as 0.
     *
     * @return 1 if a seat was taken, 0 if the room is full, inactive or missing
     */
    @Query("{ '_id': ?0, 'isActive': true, '$or': [ { 'maxParticipants': { '$lte': 0 } },"
            + " { '$expr': { '$lt': [ { '$ifNull': [ '$memberCount', 0 ] }, '$maxParticipants' ] } } ] }")
    @Update("{ '$inc': { 'memberCount': 1 }, '$set': { 'lastActivity': ?1 } }")
    long reserveSeat(String roomId, LocalDateTime now);

    /** Atomically gives back one seat; never lets memberCount go below 0. */
    @Query("{ '_id': ?0, 'memberCount': { '$gt': 0 } }")
    @Update("{ '$inc': { 'memberCount': -1 }, '$set': { 'lastActivity': ?1 } }")
    long releaseSeat(String roomId, LocalDateTime now);

    /**
     * Updates the editable fields without overwriting memberCount, and only if the new capacity still fits
     * the current members (maxParticipants <= 0 means unlimited).
     *
     * @return 1 if the room was updated, 0 if the new capacity is below memberCount or the room is missing
     */
    @Query("{ '_id': ?0, 'isActive': true, '$or': [ { '$expr': { '$lte': [ ?3, 0 ] } },"
            + " { '$expr': { '$lte': [ { '$ifNull': [ '$memberCount', 0 ] }, ?3 ] } } ] }")
    @Update("{ '$set': { 'name': ?1, 'description': ?2, 'maxParticipants': ?3, 'settings': ?4, 'lastActivity': ?5 } }")
    long updateEditableFields(String roomId, String name, String description, int maxParticipants,
            RoomSettings settings, LocalDateTime now);

    /** A late writer cannot replace a newer activity timestamp or its matching summary. */
    @Query("{ '_id': ?0, 'isActive': true, '$or': [ { 'lastActivityAt': null }, { 'lastActivityAt': { '$lt': ?1 } } ] }")
    @Update("{ '$set': { 'lastActivityAt': ?1, 'lastMessage': ?2 } }")
    long updateActivity(String roomId, Instant createdAt, LastMessageSummary summary);

    /** Soft-deletes an active room and resets its member counter. */
    @Query("{ '_id': ?0, 'isActive': true }")
    @Update("{ '$set': { 'isActive': false, 'memberCount': 0, 'deletedAt': ?1, 'lastActivity': ?1 }, '$unset': { 'memberKey': '' } }")
    long softDelete(String roomId, LocalDateTime now);
}
