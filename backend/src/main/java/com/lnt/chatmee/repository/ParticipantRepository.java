package com.lnt.chatmee.repository;

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

    long countByChatRoomId(String chatRoomId);

    /** @return the number of deleted rows (0 or 1 thanks to the unique (chatRoomId, userId) index) */
    long deleteByChatRoomIdAndUserId(String chatRoomId, String userId);

    long deleteByChatRoomId(String chatRoomId);
}
