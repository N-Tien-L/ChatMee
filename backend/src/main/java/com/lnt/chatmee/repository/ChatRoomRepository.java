package com.lnt.chatmee.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;

@Repository
public interface ChatRoomRepository extends MongoRepository<ChatRoom, String> {

    Optional<ChatRoom> findByIdAndParticipantsContaining(String roomId, String userId);
    
    List<ChatRoom> findByTypeAndIsActiveTrue(RoomType type);

    List<ChatRoom> findByParticipantsContainingAndIsActiveTrue(String userId);

    List<ChatRoom> findByCreatedByAndIsActiveTrue(String userId);

    List<ChatRoom> findByNameContainingIgnoreCaseAndTypeAndIsActiveTrue(String name, RoomType type);
    
}
