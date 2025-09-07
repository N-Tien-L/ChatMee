package com.lnt.chatmee.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.lnt.chatmee.model.Participant;

@Repository
public interface ParticipantRepository extends MongoRepository<Participant, String>{

    List<Participant> findByChatRoomId(String chatRoomId);

    List<Participant> findByUserId(String userId);

    Optional<Participant> findByChatRoomIdAndUserId(String chatRoomId, String userId);

    boolean existsByChatRoomIdAndUserId(String chatRoomId, String userId);

    // the participant count will not exceed the max value of integer
    // but count() operations in MongoDB naturally return long
    // we'll not need lots of counts so the memory usage not too much compare to Int
    // so it'd be better to keep it Long type for consistency
    Long countByChatRoomId(String chatRoomId);

    void deleteByChatRoomIdAndUserId(String chatRoomId, String userId);
} 