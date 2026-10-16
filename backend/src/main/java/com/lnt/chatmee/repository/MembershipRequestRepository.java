package com.lnt.chatmee.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.data.mongodb.repository.Update;
import org.springframework.stereotype.Repository;

import com.lnt.chatmee.model.MembershipRequest;
import com.lnt.chatmee.model.MembershipRequestKind;
import com.lnt.chatmee.model.MembershipRequestStatus;

@Repository
public interface MembershipRequestRepository extends MongoRepository<MembershipRequest, String> {

    List<MembershipRequest> findByTargetUserIdAndKindAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
            String targetUserId, MembershipRequestKind kind, MembershipRequestStatus status, Instant now);

    List<MembershipRequest> findByRoomIdAndKindAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
            String roomId, MembershipRequestKind kind, MembershipRequestStatus status, Instant now);

    Optional<MembershipRequest> findFirstByRoomIdAndTargetUserIdAndStatus(
            String roomId, String targetUserId, MembershipRequestStatus status);

    /** The pending DM request of a REQUESTED room (at most one: one PENDING row per room and person). */
    Optional<MembershipRequest> findFirstByRoomIdAndKindAndStatus(
            String roomId, MembershipRequestKind kind, MembershipRequestStatus status);

    /** Pending rows including expired ones, so a listing can expire what it finds (AC-009-13). */
    List<MembershipRequest> findByTargetUserIdAndKindAndStatusOrderByCreatedAtDesc(
            String targetUserId, MembershipRequestKind kind, MembershipRequestStatus status);

    /** True while a declined DM request holds a cooldown for the pair (AC-009-9); uses the pair cooldown index. */
    boolean existsByPairKeyAndCooldownUntilAfter(String pairKey, Instant now);

    /** A batch of PENDING rows past their expiry, for the hourly expiry job. */
    List<MembershipRequest> findByStatusAndExpiresAtLessThanEqual(MembershipRequestStatus status, Instant now,
            Pageable pageable);

    /**
     * The only way out of PENDING: one conditional update, so concurrent decisions on one request let exactly one win.
     *
     * @return 1 if the request was PENDING and unexpired, 0 otherwise
     */
    @Query("{ '_id': ?0, 'status': 'PENDING', 'expiresAt': { '$gt': ?1 } }")
    @Update("{ '$set': { 'status': ?2, 'decidedAt': ?1 } }")
    long decidePending(String id, Instant now, MembershipRequestStatus decision);

    /** Declines a PENDING, unexpired DM request and starts the pair's cooldown in the same conditional update. */
    @Query("{ '_id': ?0, 'status': 'PENDING', 'expiresAt': { '$gt': ?1 } }")
    @Update("{ '$set': { 'status': 'DECLINED', 'decidedAt': ?1, 'cooldownUntil': ?2 } }")
    long declinePending(String id, Instant now, Instant cooldownUntil);

    /** Marks a PENDING request past its expiry as EXPIRED (expiry is checked on access). */
    @Query("{ '_id': ?0, 'status': 'PENDING', 'expiresAt': { '$lte': ?1 } }")
    @Update("{ '$set': { 'status': 'EXPIRED', 'decidedAt': ?1 } }")
    long expireIfPast(String id, Instant now);

    /** Compensation when an accepted request could not add the member (ADR-0005): ACCEPTED goes back to PENDING. */
    @Query("{ '_id': ?0, 'status': 'ACCEPTED' }")
    @Update("{ '$set': { 'status': 'PENDING' }, '$unset': { 'decidedAt': '' } }")
    long reopenAccepted(String id);
}
