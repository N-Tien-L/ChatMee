package com.lnt.chatmee.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import com.lnt.chatmee.model.UserBlock;

@Repository
public interface UserBlockRepository extends MongoRepository<UserBlock, String> {

    boolean existsByBlockerIdAndBlockedId(String blockerId, String blockedId);

    long deleteByBlockerIdAndBlockedId(String blockerId, String blockedId);

    List<UserBlock> findByBlockerIdOrderByCreatedAtDesc(String blockerId);

    List<UserBlock> findByBlockerIdAndBlockedIdIn(String blockerId, Collection<String> blockedIds);

    /** A block between the two users in either direction: one query on the two compound indexes. */
    @Query(value = "{ '$or': [ { 'blockerId': ?0, 'blockedId': ?1 }, { 'blockerId': ?1, 'blockedId': ?0 } ] }",
        exists = true)
    boolean existsEitherWay(String firstUserId, String secondUserId);

    /** Every block the user made or received. */
    @Query("{ '$or': [ { 'blockerId': ?0 }, { 'blockedId': ?0 } ] }")
    List<UserBlock> findInvolving(String userId);
}
