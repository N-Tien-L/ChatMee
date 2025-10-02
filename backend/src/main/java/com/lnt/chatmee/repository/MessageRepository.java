package com.lnt.chatmee.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Page;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.lnt.chatmee.model.Message;

@Repository
public interface MessageRepository extends MongoRepository<Message, String> {
    
    // Retrieve message for a specific chat room, ordered by creation time in descending order
    // use for loading older messages with pagination (e.g.: infinite roll in chat history)
    Page<Message> findByChatRoomIdOrderByCreatedAtDesc(String chatRoomId, Pageable pageable);

    // Retrieve all messages in a chat room that were created after a specific time
    // ordered by creation time in ascending order
    // use for fetching new messages in real-time updates or long-polling
    List<Message> findByChatRoomIdAndCreatedAtAfterOrderByCreatedAtAsc(String chatRoomId, LocalDateTime after);

    // Retrieve all message send by a specific user in a given chat room
    List<Message> findBySenderIdAndChatRoomId(String senderId, String chatRoomId);

    // Count the total number of messages in a specific chat room
    Long countByChatRoomId(String chatRoomId);

    // Find messages by room ordered by creation time (ascending for chat display)
    List<Message> findByChatRoomIdOrderByCreatedAtAsc(String chatRoomId);
    
    // Find non-deleted messages for active chat display (ignoring deleted ones) in the chat UI
    List<Message> findByChatRoomIdAndIsDeletedFalseOrderByCreatedAtAsc(String chatRoomId);
    
    // Find recent messages with limit for initial chat load
    List<Message> findTop50ByChatRoomIdAndIsDeletedFalseOrderByCreatedAtDesc(String chatRoomId);
}
