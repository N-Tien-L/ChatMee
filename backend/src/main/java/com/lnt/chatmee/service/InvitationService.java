package com.lnt.chatmee.service;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.dto.response.InvitationResponse;
import com.lnt.chatmee.dto.response.UserSummaryResponse;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.DuplicateResourceException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.InvitationNotFoundException;
import com.lnt.chatmee.exception.InvitationNotPendingException;
import com.lnt.chatmee.exception.RoomCapacityExceededException;
import com.lnt.chatmee.exception.UserAlreadyInRoomException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.MembershipRequest;
import com.lnt.chatmee.model.MembershipRequestKind;
import com.lnt.chatmee.model.MembershipRequestStatus;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MembershipRequestRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.policy.RoomTypePolicyRegistry;

import lombok.RequiredArgsConstructor;

/**
 * Invitations into PRIVATE rooms (SPEC-009 AC-009-1..3, ADR-0006). Nobody becomes a member without accepting.
 * An invitation is visible only to its invitee, its inviter and the room's OWNER/ADMIN; everyone else gets 404.
 * Accepting follows ADR-0005: a conditional PENDING -> ACCEPTED update, then the seat and the member row, and the
 * invitation goes back to PENDING if that fails.
 */
@Service
@RequiredArgsConstructor
public class InvitationService {

    static final Duration INVITATION_TTL = Duration.ofDays(7);

    private static final Logger logger = LoggerFactory.getLogger(InvitationService.class);
    private static final String NOT_FOUND = "Invitation not found";
    private static final String NOT_PENDING = "Invitation is no longer pending";

    private final MembershipRequestRepository requests;
    private final ChatRoomRepository chatRoomRepository;
    private final UserRepository userRepository;
    private final ParticipantService participantService;
    private final ChatRoomService chatRoomService;
    private final RoomTypePolicyRegistry policies;
    private final UserEventPublisher userEvents;

    public InvitationResponse invite(String roomId, String callerId, String inviteeId) {
        ChatRoom room = activeRoom(roomId);
        Participant caller = membership(roomId, callerId);
        policies.get(room.getType()).checkInvite();
        requireManager(caller, "Only OWNER or ADMIN can invite users");
        User inviter = userRepository.findById(callerId).orElse(null);
        User invitee = userRepository.findById(inviteeId)
            .orElseThrow(() -> new UserNotFoundException("User not found"));
        checkConsentAllowed(callerId, inviteeId);
        if (participantService.findMembership(roomId, inviteeId).isPresent()) {
            throw new UserAlreadyInRoomException("User is already in the room");
        }
        Instant now = Instant.now();
        requests.findFirstByRoomIdAndTargetUserIdAndStatus(roomId, inviteeId, MembershipRequestStatus.PENDING)
            .ifPresent(existing -> {
                if (!isExpired(existing, now)) {
                    throw new DuplicateResourceException("A pending invitation already exists for this user");
                }
                // Frees the one-pending-per-person index slot for the new invitation.
                requests.expireIfPast(existing.getId(), now);
            });
        if (room.getMaxParticipants() > 0 && room.getMemberCount() >= room.getMaxParticipants()) {
            throw new RoomCapacityExceededException("Room has reached maximum capacity");
        }
        MembershipRequest saved;
        try {
            saved = requests.insert(MembershipRequest.builder()
                .kind(MembershipRequestKind.INVITE).roomId(roomId).inviterId(callerId).targetUserId(inviteeId)
                .status(MembershipRequestStatus.PENDING).createdAt(now).expiresAt(now.plus(INVITATION_TTL))
                .build());
        } catch (DuplicateKeyException ex) {
            throw new DuplicateResourceException("A pending invitation already exists for this user");
        }
        InvitationResponse response = InvitationResponse.from(saved, room, summary(callerId, inviter),
            summary(inviteeId, invitee));
        userEvents.invitationReceived(inviteeId, response);
        logger.info("Invitation {} created for room {} by {} to {}", saved.getId(), roomId, callerId, inviteeId);
        return response;
    }

    /** The caller's PENDING, unexpired invitations to active rooms, newest first. */
    public List<InvitationResponse> listMine(String callerId) {
        return toResponses(requests.findByTargetUserIdAndKindAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
            callerId, MembershipRequestKind.INVITE, MembershipRequestStatus.PENDING, Instant.now()));
    }

    /** The room's PENDING, unexpired invitations, for its OWNER/ADMIN only. */
    public List<InvitationResponse> listForRoom(String roomId, String callerId) {
        activeRoom(roomId);
        requireManager(membership(roomId, callerId), "Only OWNER or ADMIN can list the room's invitations");
        return toResponses(requests.findByRoomIdAndKindAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(
            roomId, MembershipRequestKind.INVITE, MembershipRequestStatus.PENDING, Instant.now()));
    }

    public void accept(String invitationId, String callerId) {
        MembershipRequest invitation = invitationOf(invitationId, callerId);
        Instant now = Instant.now();
        requirePending(invitation, now);
        checkConsentAllowed(invitation.getInviterId(), callerId);
        if (requests.decidePending(invitationId, now, MembershipRequestStatus.ACCEPTED) == 0) {
            throw new InvitationNotPendingException(NOT_PENDING);
        }
        String roomId = invitation.getRoomId();
        User member;
        try {
            member = participantService.insertMember(roomId, callerId, Role.MEMBER);
        } catch (RuntimeException ex) {
            reopen(invitationId);
            throw ex;
        }
        participantService.announceJoin(roomId, member);
        userEvents.invitationChanged(parties(invitation), invitationId, roomId, MembershipRequestStatus.ACCEPTED);
        chatRoomRepository.findByIdAndIsActiveTrue(roomId).ifPresent(room ->
            userEvents.roomAdded(callerId, chatRoomService.toResponse(room, callerId)));
        logger.info("Invitation {} accepted by {} for room {}", invitationId, callerId, roomId);
    }

    public void decline(String invitationId, String callerId) {
        MembershipRequest invitation = invitationOf(invitationId, callerId);
        decide(invitation, MembershipRequestStatus.DECLINED);
        logger.info("Invitation {} declined by {}", invitationId, callerId);
    }

    /** Revoked by its inviter or by an OWNER/ADMIN of the room. */
    public void revoke(String invitationId, String callerId) {
        MembershipRequest invitation = findInvitation(invitationId);
        boolean manager = participantService.findMembership(invitation.getRoomId(), callerId)
            .map(row -> row.getRole() == Role.OWNER || row.getRole() == Role.ADMIN)
            .orElse(false);
        if (!callerId.equals(invitation.getInviterId()) && !manager) {
            if (callerId.equals(invitation.getTargetUserId())) {
                throw new ForbiddenActionException("Only the inviter or a room OWNER/ADMIN can revoke an invitation");
            }
            throw new InvitationNotFoundException(NOT_FOUND);
        }
        decide(invitation, MembershipRequestStatus.REVOKED);
        logger.info("Invitation {} revoked by {}", invitationId, callerId);
    }

    /**
     * The single place for consent checks between inviter and invitee, on invite and on accept.
     * Block checks (AC-009-4, "Cannot invite this user") are added here in CM-073.
     */
    private void checkConsentAllowed(String inviterId, String inviteeId) {
    }

    private void decide(MembershipRequest invitation, MembershipRequestStatus decision) {
        Instant now = Instant.now();
        requirePending(invitation, now);
        if (requests.decidePending(invitation.getId(), now, decision) == 0) {
            throw new InvitationNotPendingException(NOT_PENDING);
        }
        userEvents.invitationChanged(parties(invitation), invitation.getId(), invitation.getRoomId(), decision);
    }

    /** Compensation: a new PENDING invitation for the same person may already hold the unique slot. */
    private void reopen(String invitationId) {
        try {
            requests.reopenAccepted(invitationId);
        } catch (DuplicateKeyException ex) {
            logger.warn("Invitation {} could not be reopened: a newer pending invitation exists", invitationId);
        }
    }

    private void requirePending(MembershipRequest invitation, Instant now) {
        if (invitation.getStatus() != MembershipRequestStatus.PENDING) {
            throw new InvitationNotPendingException(NOT_PENDING);
        }
        if (isExpired(invitation, now)) {
            requests.expireIfPast(invitation.getId(), now);
            throw new InvitationNotPendingException(NOT_PENDING);
        }
    }

    private static boolean isExpired(MembershipRequest invitation, Instant now) {
        return invitation.getExpiresAt() == null || !invitation.getExpiresAt().isAfter(now);
    }

    /** An invitation the caller must answer; anyone but the invitee gets 404. */
    private MembershipRequest invitationOf(String invitationId, String callerId) {
        MembershipRequest invitation = findInvitation(invitationId);
        if (!callerId.equals(invitation.getTargetUserId())) {
            throw new InvitationNotFoundException(NOT_FOUND);
        }
        return invitation;
    }

    private MembershipRequest findInvitation(String invitationId) {
        return requests.findById(invitationId)
            .filter(request -> request.getKind() == MembershipRequestKind.INVITE)
            .orElseThrow(() -> new InvitationNotFoundException(NOT_FOUND));
    }

    private ChatRoom activeRoom(String roomId) {
        return chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room membership not found"));
    }

    private Participant membership(String roomId, String userId) {
        return participantService.findMembership(roomId, userId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room membership not found"));
    }

    private static void requireManager(Participant participant, String message) {
        if (participant.getRole() != Role.OWNER && participant.getRole() != Role.ADMIN) {
            throw new ForbiddenActionException(message);
        }
    }

    private static Set<String> parties(MembershipRequest invitation) {
        Set<String> users = new LinkedHashSet<>();
        users.add(invitation.getTargetUserId());
        users.add(invitation.getInviterId());
        users.remove(null);
        return users;
    }

    /** Maps with one room query and one user query; invitations of deleted rooms are left out. */
    private List<InvitationResponse> toResponses(List<MembershipRequest> rows) {
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
        Set<String> userIds = new HashSet<>();
        rows.forEach(row -> {
            userIds.add(row.getInviterId());
            userIds.add(row.getTargetUserId());
        });
        userIds.remove(null);
        Map<String, User> users = new HashMap<>();
        userRepository.findAllById(userIds).forEach(user -> users.put(user.getId(), user));
        return rows.stream()
            .filter(row -> rooms.containsKey(row.getRoomId()))
            .map(row -> InvitationResponse.from(row, rooms.get(row.getRoomId()),
                summary(row.getInviterId(), users.get(row.getInviterId())),
                summary(row.getTargetUserId(), users.get(row.getTargetUserId()))))
            .toList();
    }

    private static UserSummaryResponse summary(String userId, User user) {
        if (user == null || user.getName() == null || user.getName().isBlank()) {
            return new UserSummaryResponse(userId, "Deleted user", user == null ? null : user.getAvatarUrl());
        }
        return new UserSummaryResponse(userId, user.getName(), user.getAvatarUrl());
    }
}
