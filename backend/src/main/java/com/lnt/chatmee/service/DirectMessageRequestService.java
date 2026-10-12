package com.lnt.chatmee.service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.dto.response.DmRequestResponse;
import com.lnt.chatmee.dto.response.UserSummaryResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.MembershipRequest;
import com.lnt.chatmee.model.MembershipRequestKind;
import com.lnt.chatmee.model.MembershipRequestStatus;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MembershipRequestRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.policy.DirectRoomPolicy;

import lombok.RequiredArgsConstructor;

/**
 * DM requests (SPEC-009 AC-009-9..13, ADR-0006): a new DM is REQUESTED, with only the sender as member, until the
 * recipient accepts it explicitly, replies, or creates the same DM (D-04). Every decision is one conditional update
 * of the PENDING request, so concurrent accept, decline and expiry let exactly one win; accepting then adds the
 * recipient as in ADR-0005. Only the recipient can see or answer a request: everyone else gets 404.
 * Logs carry ids only, never the preview.
 */
@Service
@RequiredArgsConstructor
public class DirectMessageRequestService {

    static final Duration REQUEST_TTL = Duration.ofDays(14);
    static final Duration DECLINE_COOLDOWN = Duration.ofDays(30);

    private static final Logger logger = LoggerFactory.getLogger(DirectMessageRequestService.class);
    private static final String CANNOT_MESSAGE = "Cannot message this user";
    private static final String NOT_FOUND = "DM request not found";

    private final MembershipRequestRepository requests;
    private final ChatRoomRepository chatRoomRepository;
    private final UserRepository userRepository;
    private final ParticipantService participantService;
    private final UserEventPublisher userEvents;
    // ChatRoomService creates DMs through this service; resolve it lazily, only to render room views.
    private final ObjectProvider<ChatRoomService> chatRooms;
    private final RateLimitingService rateLimitingService;

    /**
     * Refuses a new request while a decline cooldown exists for the pair, in either direction (AC-009-9), and
     * when the sender reached the daily DM request limit (AC-009-14). Called only for a request that is about to be created.
     */
    public void checkCanRequest(String senderId, String recipientId) {
        checkConsentAllowed(senderId, recipientId);
        if (requests.existsByPairKeyAndCooldownUntilAfter(DirectRoomPolicy.memberKey(senderId, recipientId),
                Instant.now())) {
            throw new ForbiddenActionException(CANNOT_MESSAGE);
        }
        rateLimitingService.checkDailyAction(RateLimitingService.DailyAction.DM_REQUEST, senderId);
    }

    /**
     * The single place for consent checks between DM sender and recipient, on create and accept.
     * Block checks (AC-009-16, AC-009-18, "Cannot message this user") are added here in CM-073.
     */
    private void checkConsentAllowed(String senderId, String recipientId) {
    }

    /** Stores the request of a new REQUESTED room and notifies the recipient; the room is closed if that fails. */
    public void open(ChatRoom room, String senderId, String recipientId) {
        Instant now = Instant.now();
        MembershipRequest saved;
        try {
            saved = requests.insert(MembershipRequest.builder()
                .kind(MembershipRequestKind.DM_REQUEST).roomId(room.getId()).inviterId(senderId)
                .targetUserId(recipientId).status(MembershipRequestStatus.PENDING).pairKey(room.getMemberKey())
                .createdAt(now).expiresAt(now.plus(REQUEST_TTL)).build());
        } catch (RuntimeException ex) {
            // Without its request the room could never be answered: remove it so the pair can try again.
            closeRoom(room.getId());
            throw ex;
        }
        notifyRecipient(saved, room);
        logger.info("DM request {} created for room {} by {} to {}", saved.getId(), room.getId(), senderId, recipientId);
    }

    /**
     * Same-pair rules for an existing REQUESTED DM (AC-009-9): its sender gets the room back, its recipient accepts
     * it (D-04). An expired request closes the room and returns empty, so a new request can be made.
     */
    public Optional<ChatRoomResponse> resolveRequested(ChatRoom room, String callerId) {
        Optional<MembershipRequest> pending = pendingFor(room.getId());
        if (pending.isEmpty()) {
            // Decided concurrently: show the room as it is now, if it still exists.
            return chatRoomRepository.findByIdAndIsActiveTrue(room.getId()).map(current -> view(current, callerId));
        }
        MembershipRequest request = pending.get();
        Instant now = Instant.now();
        if (isExpired(request, now)) {
            expire(request, now);
            return Optional.empty();
        }
        if (callerId.equals(request.getTargetUserId())) {
            acceptPending(request, now);
            return chatRoomRepository.findByIdAndIsActiveTrue(room.getId()).map(current -> view(current, callerId));
        }
        return Optional.of(view(room, callerId));
    }

    /** The caller's pending requests, newest first; expired rows found here are expired (AC-009-11, -13). */
    public List<DmRequestResponse> listPending(String recipientId) {
        Instant now = Instant.now();
        List<MembershipRequest> open = new ArrayList<>();
        for (MembershipRequest row : requests.findByTargetUserIdAndKindAndStatusOrderByCreatedAtDesc(
                recipientId, MembershipRequestKind.DM_REQUEST, MembershipRequestStatus.PENDING)) {
            if (isExpired(row, now)) {
                expire(row, now);
            } else {
                open.add(row);
            }
        }
        return toResponses(open);
    }

    public void accept(String roomId, String callerId) {
        acceptPending(requestOf(roomId, callerId), Instant.now());
    }

    /** Declining closes the room, frees the pair key and starts the pair's 30-day cooldown (AC-009-12). */
    public void decline(String roomId, String callerId) {
        MembershipRequest request = requestOf(roomId, callerId);
        Instant now = Instant.now();
        if (requests.declinePending(request.getId(), now, now.plus(DECLINE_COOLDOWN)) == 0) {
            throw new ChatRoomNotFoundException(NOT_FOUND);
        }
        closeRoom(request.getRoomId());
        userEvents.roomRemoved(Set.of(request.getInviterId()), roomId, "DECLINED");
        logger.info("DM request {} declined by {} for room {}", request.getId(), callerId, roomId);
    }

    /**
     * A message from the recipient to a REQUESTED room addressed to them accepts it (AC-009-12).
     *
     * @return true if the caller may send to the room now (accepted here or concurrently)
     */
    public boolean acceptByReply(String roomId, String callerId) {
        Optional<MembershipRequest> pending = pendingFor(roomId)
            .filter(request -> callerId.equals(request.getTargetUserId()));
        if (pending.isEmpty()) {
            return participantService.isUserParticipant(roomId, callerId);
        }
        Instant now = Instant.now();
        if (isExpired(pending.get(), now)) {
            expire(pending.get(), now);
            return false;
        }
        try {
            acceptPending(pending.get(), now);
        } catch (ChatRoomNotFoundException lost) {
            return participantService.isUserParticipant(roomId, callerId);
        }
        return true;
    }

    /** Expiry on send (AC-009-13): true when the room's request had expired and the room is now closed. */
    public boolean expireIfDue(String roomId) {
        Instant now = Instant.now();
        return pendingFor(roomId)
            .filter(request -> isExpired(request, now))
            .map(request -> expire(request, now))
            .orElse(false);
    }

    /** The sender's one message set the preview: the recipient gets the request again (client upserts by roomId). */
    public void previewChanged(String roomId) {
        pendingFor(roomId).ifPresent(request -> chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .ifPresent(room -> notifyRecipient(request, room)));
    }

    /**
     * Expires a PENDING DM request past its expiry: the room is soft-deleted, its pair key cleared and the sender
     * told; no cooldown is set (AC-009-13). Idempotent: a row decided meanwhile is left alone.
     *
     * @return true if this call expired the request
     */
    public boolean expire(MembershipRequest request, Instant now) {
        if (requests.expireIfPast(request.getId(), now) == 0) {
            return false;
        }
        closeRoom(request.getRoomId());
        userEvents.roomRemoved(Set.of(request.getInviterId()), request.getRoomId(), "EXPIRED");
        logger.info("DM request {} expired for room {}", request.getId(), request.getRoomId());
        return true;
    }

    /** PENDING -> ACCEPTED first, then the recipient's seat and row; the request is reopened if that fails. */
    private void acceptPending(MembershipRequest request, Instant now) {
        checkConsentAllowed(request.getInviterId(), request.getTargetUserId());
        if (requests.decidePending(request.getId(), now, MembershipRequestStatus.ACCEPTED) == 0) {
            throw new ChatRoomNotFoundException(NOT_FOUND);
        }
        String roomId = request.getRoomId();
        try {
            participantService.insertMember(roomId, request.getTargetUserId(), Role.MEMBER);
        } catch (RuntimeException ex) {
            requests.reopenAccepted(request.getId());
            throw ex;
        }
        chatRoomRepository.activateRequested(roomId, LocalDateTime.now());
        chatRoomRepository.findByIdAndIsActiveTrue(roomId).ifPresent(room -> {
            userEvents.roomAdded(request.getTargetUserId(), view(room, request.getTargetUserId()));
            userEvents.roomUpdated(request.getInviterId(), view(room, request.getInviterId()));
        });
        logger.info("DM request {} accepted by {} for room {}", request.getId(), request.getTargetUserId(), roomId);
    }

    /** Soft-deletes a still REQUESTED room (clearing memberKey) and removes the sender's row. */
    private void closeRoom(String roomId) {
        if (chatRoomRepository.softDeleteRequested(roomId, LocalDateTime.now()) > 0) {
            participantService.removeAllParticipants(roomId);
        }
    }

    /** The pending request of the room addressed to the caller; anyone else, or no pending request, gets 404. */
    private MembershipRequest requestOf(String roomId, String callerId) {
        MembershipRequest request = pendingFor(roomId)
            .filter(row -> callerId.equals(row.getTargetUserId()))
            .orElseThrow(() -> new ChatRoomNotFoundException(NOT_FOUND));
        Instant now = Instant.now();
        if (isExpired(request, now)) {
            expire(request, now);
            throw new ChatRoomNotFoundException(NOT_FOUND);
        }
        return request;
    }

    private Optional<MembershipRequest> pendingFor(String roomId) {
        return requests.findFirstByRoomIdAndKindAndStatus(roomId, MembershipRequestKind.DM_REQUEST,
            MembershipRequestStatus.PENDING);
    }

    private static boolean isExpired(MembershipRequest request, Instant now) {
        return request.getExpiresAt() == null || !request.getExpiresAt().isAfter(now);
    }

    private ChatRoomResponse view(ChatRoom room, String userId) {
        return chatRooms.getObject().toResponse(room, userId);
    }

    private void notifyRecipient(MembershipRequest request, ChatRoom room) {
        User sender = userRepository.findById(request.getInviterId()).orElse(null);
        userEvents.dmRequestReceived(request.getTargetUserId(),
            DmRequestResponse.from(request, summary(request.getInviterId(), sender), room));
    }

    /** Maps with one room query and one user query; requests of deleted rooms are left out. */
    private List<DmRequestResponse> toResponses(List<MembershipRequest> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<String, ChatRoom> rooms = new HashMap<>();
        chatRoomRepository.findAllById(rows.stream().map(MembershipRequest::getRoomId).collect(Collectors.toSet()))
            .forEach(room -> {
                if (room.isActive()) {
                    rooms.put(room.getId(), room);
                }
            });
        Map<String, User> senders = new HashMap<>();
        userRepository.findAllById(rows.stream().map(MembershipRequest::getInviterId).collect(Collectors.toSet()))
            .forEach(user -> senders.put(user.getId(), user));
        return rows.stream()
            .filter(row -> rooms.containsKey(row.getRoomId()))
            .map(row -> DmRequestResponse.from(row, summary(row.getInviterId(), senders.get(row.getInviterId())),
                rooms.get(row.getRoomId())))
            .toList();
    }

    private static UserSummaryResponse summary(String userId, User user) {
        if (user == null || user.getName() == null || user.getName().isBlank()) {
            return new UserSummaryResponse(userId, "Deleted user", user == null ? null : user.getAvatarUrl());
        }
        return new UserSummaryResponse(userId, user.getName(), user.getAvatarUrl());
    }
}
