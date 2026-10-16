package com.lnt.chatmee.service;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.lnt.chatmee.model.MembershipRequest;
import com.lnt.chatmee.model.MembershipRequestKind;
import com.lnt.chatmee.model.MembershipRequestStatus;
import com.lnt.chatmee.repository.MembershipRequestRepository;

import lombok.RequiredArgsConstructor;

/**
 * Hourly expiry of PENDING membership requests (SPEC-009 AC-009-13, data-model.md "Expiry"). Expiry is also checked
 * on every access, so this job is not needed for correctness. Each row moves with a conditional update, so the job is
 * idempotent; v0 runs one backend instance (D-11). Scheduling is enabled by {@code @EnableScheduling} on
 * {@link PresenceService}.
 */
@Component
@RequiredArgsConstructor
public class MembershipRequestExpiryJob {

    static final int BATCH_SIZE = 100;

    private static final Logger logger = LoggerFactory.getLogger(MembershipRequestExpiryJob.class);

    private final MembershipRequestRepository requests;
    private final DirectMessageRequestService dmRequests;

    @Scheduled(fixedDelay = 1, initialDelay = 1, timeUnit = TimeUnit.HOURS)
    public void expirePendingRequests() {
        int expired = expireDue(Instant.now());
        if (expired > 0) {
            logger.info("Expired {} pending membership requests", expired);
        }
    }

    /**
     * Expires every PENDING row past its expiry in batches. Expired rows leave the PENDING set, so each batch makes
     * progress; a batch that expires nothing ends the run.
     *
     * @return the number of rows this run expired
     */
    int expireDue(Instant now) {
        int expired = 0;
        List<MembershipRequest> batch;
        do {
            batch = requests.findByStatusAndExpiresAtLessThanEqual(MembershipRequestStatus.PENDING, now,
                PageRequest.of(0, BATCH_SIZE));
            int expiredInBatch = 0;
            for (MembershipRequest row : batch) {
                boolean done = row.getKind() == MembershipRequestKind.DM_REQUEST
                    ? dmRequests.expire(row, now)
                    : requests.expireIfPast(row.getId(), now) > 0;
                if (done) {
                    expiredInBatch++;
                }
            }
            expired += expiredInBatch;
            if (expiredInBatch == 0) {
                break;
            }
        } while (batch.size() == BATCH_SIZE);
        return expired;
    }
}
