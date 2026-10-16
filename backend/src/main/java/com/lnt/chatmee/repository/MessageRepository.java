package com.lnt.chatmee.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.bson.types.ObjectId;

import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Page;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import com.lnt.chatmee.model.Message;

@Repository
public interface MessageRepository extends MongoRepository<Message, String> {

    @Query(value = "{ 'chatRoomId': ?0, 'isDeleted': false }",
            sort = "{ 'createdAt': -1, '_id': -1 }")
    List<Message> findPage(String roomId, Pageable pageable);

    default List<Message> findPageBefore(String roomId, Instant beforeCreatedAt, String beforeId, Pageable pageable) {
        // Match the existing @Id mapping: valid 24-hex IDs are stored as ObjectIds, others as strings.
        Object storedId = ObjectId.isValid(beforeId) ? new ObjectId(beforeId) : beforeId;
        return findPageBeforeKey(roomId, beforeCreatedAt, storedId, pageable);
    }

    @Query(value = "{ 'chatRoomId': ?0, 'isDeleted': false, '$or': ["
            + "{ 'createdAt': { '$lt': ?1 } },"
            + "{ 'createdAt': ?1, '$expr': { '$lt': ['$_id', { '$literal': ?2 }] } }] }",
            sort = "{ 'createdAt': -1, '_id': -1 }")
    List<Message> findPageBeforeKey(String roomId, Instant beforeCreatedAt, Object beforeId, Pageable pageable);
    
    /** Idempotency lookup for a send retried with the same client id (SPEC-008 AC-008-13). */
    Optional<Message> findFirstByChatRoomIdAndSenderIdAndClientMessageId(String chatRoomId, String senderId,
            String clientMessageId);

    // Retrieve message for a specific chat room, ordered by creation time in descending order
    // use for loading older messages with pagination (e.g.: infinite roll in chat history)
    Page<Message> findByChatRoomIdOrderByCreatedAtDesc(String chatRoomId, Pageable pageable);

    // Retrieve all messages in a chat room that were created after a specific time
    // ordered by creation time in ascending order
    // use for fetching new messages in real-time updates or long-polling
    List<Message> findByChatRoomIdAndCreatedAtAfterOrderByCreatedAtAsc(String chatRoomId, Instant after);

    // Retrieve all message send by a specific user in a given chat room
    List<Message> findBySenderIdAndChatRoomId(String senderId, String chatRoomId);

    @Query(value = "{ 'chatRoomId': ?0, 'senderId': { '$ne': ?1 }, 'createdAt': { '$gt': ?2 },"
            + " 'type': { '$ne': 'SYSTEM' }, 'isDeleted': false }", count = true)
    long countUnread(String roomId, String callerId, Instant lastReadAt);

    // Count the total number of messages in a specific chat room
    Long countByChatRoomId(String chatRoomId);

    // Find messages by room ordered by creation time (ascending for chat display)
    List<Message> findByChatRoomIdOrderByCreatedAtAsc(String chatRoomId);
    
    // Find non-deleted messages for active chat display (ignoring deleted ones) in the chat UI
    List<Message> findByChatRoomIdAndIsDeletedFalseOrderByCreatedAtAsc(String chatRoomId);
    
    // Find recent messages with limit for initial chat load
    List<Message> findTop50ByChatRoomIdAndIsDeletedFalseOrderByCreatedAtDesc(String chatRoomId);
}
