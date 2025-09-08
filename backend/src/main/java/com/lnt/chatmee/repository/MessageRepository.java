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
    
    Page<Message> findByChatRoomIdOrderByCreatedAtDesc(String chatRoomId, Pageable pageable);

    List<Message> findByChatRoomIdAndCreatedAtAfterOrderByCreatedAtAsc(String chatRoomId, LocalDateTime after);

    List<Message> findBySenderIdAndChatRoomId(String senderId, String chatRoomId);

    Long countByChatRoomId(String chatRoomId);
}
