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

    long countByChatRoomId(String chatRoomId);

    /** @return the number of deleted rows (0 or 1 thanks to the unique (chatRoomId, userId) index) */
    long deleteByChatRoomIdAndUserId(String chatRoomId, String userId);

    long deleteByChatRoomId(String chatRoomId);
}
