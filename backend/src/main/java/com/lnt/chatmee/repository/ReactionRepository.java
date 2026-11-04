package com.lnt.chatmee.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.Aggregation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.lnt.chatmee.model.Reaction;

@Repository
public interface ReactionRepository extends MongoRepository<Reaction, String>, ReactionRepositoryCustom {

    Optional<Reaction> findByMessageIdAndUserId(String messageId, String userId);

    long deleteByMessageIdAndUserId(String messageId, String userId);

    long deleteByRoomId(String roomId);

    /** Per-emoji count, first reaction time and whether {@code userId} chose it, for many messages (AC-015-5). */
    @Aggregation(pipeline = {
        "{ '$match': { 'messageId': { '$in': ?0 } } }",
        "{ '$group': { '_id': { 'm': '$messageId', 'e': '$emoji' }, 'count': { '$sum': 1 },"
            + " 'firstAt': { '$min': '$createdAt' },"
            + " 'mine': { '$max': { '$cond': [ { '$eq': [ '$userId', ?1 ] }, 1, 0 ] } } } }",
        "{ '$project': { '_id': 0, 'messageId': '$_id.m', 'emoji': '$_id.e', 'count': 1, 'firstAt': 1, 'mine': 1 } }"
    })
    List<ReactionTally> tally(Collection<String> messageIds, String userId);
}
