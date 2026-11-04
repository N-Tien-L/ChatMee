package com.lnt.chatmee.repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import com.lnt.chatmee.model.Reaction;

import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ReactionRepositoryCustomImpl implements ReactionRepositoryCustom {

    private final MongoTemplate mongo;

    @Override
    public void setReaction(String messageId, String roomId, String userId, String emoji, Instant now) {
        // Only a different emoji (or no row) is written, so the same PUT keeps its original time.
        Query differs = new Query(Criteria.where("messageId").is(messageId).and("userId").is(userId)
                .and("emoji").ne(emoji));
        Update update = new Update().set("emoji", emoji).set("createdAt", now)
                .setOnInsert("_id", UUID.randomUUID().toString()).setOnInsert("roomId", roomId);
        try {
            mongo.upsert(differs, update, Reaction.class);
        } catch (DuplicateKeyException sameEmojiOrRace) {
            // Either the row already has this emoji (the filter excluded it, so the upsert tried an insert), or a
            // concurrent first reaction won. Updating the existing row when it differs settles both.
            Query row = new Query(Criteria.where("messageId").is(messageId).and("userId").is(userId)
                    .and("emoji").ne(emoji));
            mongo.updateFirst(row, new Update().set("emoji", emoji).set("createdAt", now), Reaction.class);
        }
    }

    @Override
    public List<Reaction> findPage(String messageId, String emoji, Instant beforeCreatedAt, String beforeId,
            int limit) {
        Criteria criteria = Criteria.where("messageId").is(messageId);
        if (emoji != null) {
            criteria = criteria.and("emoji").is(emoji);
        }
        if (beforeCreatedAt != null) {
            criteria = criteria.orOperator(Criteria.where("createdAt").lt(beforeCreatedAt),
                    Criteria.where("createdAt").is(beforeCreatedAt).and("_id").lt(beforeId));
        }
        Query query = new Query(criteria).with(Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("_id")))
                .limit(limit);
        return mongo.find(query, Reaction.class);
    }
}
