package com.lnt.chatmee.service;

import com.lnt.chatmee.util.DisplayNames;
import java.time.LocalDateTime;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.dao.DuplicateKeyException;

import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.dto.response.MemberResponse;
import org.springframework.beans.factory.ObjectProvider;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.RoomCapacityExceededException;
import com.lnt.chatmee.exception.UserAlreadyInRoomException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.util.ValidationUtil;

import com.lnt.chatmee.service.policy.RoomTypePolicyRegistry;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ParticipantService {

    private static final Logger logger = LoggerFactory.getLogger(ParticipantService.class);

    private final ParticipantRepository participantRepository;
    private final UserRepository userRepository;
    private final UserEventPublisher userEvents;
    private final ChatRoomRepository chatRoomRepository;
    private final RoomTypePolicyRegistry policies;
    // Resolve on membership changes only: MessageService also uses the membership guard.
    private final ObjectProvider<MessageService> messages;
    private final MessageRepository messageRepository;

    public void createParticipant(String chatRoomId, String userId, Role role) {
        // Validate inputs
        ValidationUtil.validateId(chatRoomId, "Chat Room ID");
        ValidationUtil.validateId(userId, "User ID");
        if (role == null) {
            throw new InvalidRequestException("Role cannot be null");
        }

        // id, joinedAt and updatedAt are filled by MongoDB and Spring Data auditing on insert
        Participant participant = Participant.builder()
            .chatRoomId(chatRoomId)
            .userId(userId)
            .role(role)
            .lastReadAt(Instant.now())
            .lastSeenAt(LocalDateTime.now())
            .isMuted(false)
            .isBlocked(false)
            .build();

        try {
            participantRepository.save(participant);
        } catch (DuplicateKeyException ex) {
            throw new UserAlreadyInRoomException("User is already in the room");
        }
        logger.info("Created participant: {} for room: {} with role: {}", userId, chatRoomId, role);
    }

    public void joinRoom(String roomId, String userId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
        ValidationUtil.validateId(roomId, "Room ID");
        ChatRoom room = chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId));
        policies.get(room.getType()).checkJoin();
        addParticipant(roomId, user.getId(), Role.MEMBER);
        chatRoomRepository.findByIdAndIsActiveTrue(roomId).ifPresent(joinedRoom ->
            userEvents.roomAdded(user.getId(), ChatRoomResponse.from(
                joinedRoom, getParticipantUserIds(roomId), null, 0, Role.MEMBER)));
    }

    /**
     * Shared entry path (PUBLIC join, accepted invitation): seat and membership row, then the "X joined" message.
     * Callers check the entry rules (policy, consent) first.
     */
    public void addParticipant(String roomId, String userId, Role role) {
        User target = insertMember(roomId, userId, role);
        announceJoin(roomId, target);
    }

    /**
     * Adds a member without a multi-document transaction: a seat is reserved with a conditional {@code $inc}
     * on the room, then the participant row is inserted (the unique index rejects duplicates), and the seat
     * is given back if the insert fails. See ADR-0005. Posts no announcement.
     *
     * @return the new member's account
     */
    public User insertMember(String roomId, String userId, Role role) {
        // Validate IDs
        ValidationUtil.validateId(roomId, "Room ID");
        ValidationUtil.validateId(userId, "User ID");

        chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Can't find chat room with id: " + roomId));

        User target = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("Participant not found"));

        if(participantRepository.existsByChatRoomIdAndUserId(roomId, userId)) {
            throw new UserAlreadyInRoomException("User is already in the room");
        }

        if (chatRoomRepository.reserveSeat(roomId, LocalDateTime.now()) == 0) {
            throw new RoomCapacityExceededException("Room has reached maximum capacity");
        }

        try {
            createParticipant(roomId, userId, role);
        } catch (RuntimeException ex) {
            chatRoomRepository.releaseSeat(roomId, LocalDateTime.now());
            throw ex;
        }
        logger.info("Added participant {} to room {}", userId, roomId);
        return target;
    }

    public void announceJoin(String roomId, User member) {
        messages.getObject().postSystemMessage(roomId, DisplayNames.of(member) + " joined");
        presenceMembershipChanged(roomId, member.getId());
    }

    /**
     * Removes a member and gives the seat back.
     *
     * @return true if the user was a member
     */
    public boolean removeParticipant(String roomId, String userId) {
        if (participantRepository.deleteByChatRoomIdAndUserId(roomId, userId) == 0) {
            return false;
        }
        chatRoomRepository.releaseSeat(roomId, LocalDateTime.now());
        presenceMembershipChanged(roomId, userId);
        logger.info("Removed participant {} from room {}", userId, roomId);
        return true;
    }

    /** Deletes every membership of a room (used when the room is soft-deleted). */
    public long removeAllParticipants(String roomId) {
        return participantRepository.deleteByChatRoomId(roomId);
    }

    private void presenceMembershipChanged(String roomId, String changedUserId) {
        Set<String> affected = new LinkedHashSet<>(getParticipantUserIds(roomId));
        affected.add(changedUserId);
        userEvents.presenceScopeChanged(affected);
    }

    public Set<String> getParticipantUserIds(String roomId) {
        return participantRepository.findByChatRoomId(roomId).stream()
            .map(Participant::getUserId)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** Member user ids per room id, in one query; rooms without members are absent from the map. */
    public Map<String, Set<String>> getParticipantUserIds(Collection<String> roomIds) {
        if (roomIds.isEmpty()) {
            return Map.of();
        }
        return participantRepository.findByChatRoomIdIn(roomIds).stream()
            .collect(Collectors.groupingBy(Participant::getChatRoomId,
                Collectors.mapping(Participant::getUserId, Collectors.toCollection(LinkedHashSet::new))));
    }

    public List<Participant> getMemberships(String userId) {
        return participantRepository.findByUserId(userId);
    }

    public void markRead(String roomId, String userId) {
        if (chatRoomRepository.findByIdAndIsActiveTrue(roomId).isEmpty()
                || (participantRepository.markRead(roomId, userId, Instant.now()) == 0
                    && !participantRepository.existsByChatRoomIdAndUserId(roomId, userId))) {
            throw new ChatRoomNotFoundException("Room membership not found");
        }
    }

    public List<String> getRoomIdsOfUser(String userId) {
        return participantRepository.findByUserId(userId).stream()
            .map(Participant::getChatRoomId)
            .toList();
    }

    /** Shared access guard: a late membership insert must not authorize a soft-deleted room. */
    public boolean isUserParticipant(String roomId, String userId) {
        return chatRoomRepository.findByIdAndIsActiveTrue(roomId).isPresent()
            && participantRepository.existsByChatRoomIdAndUserId(roomId, userId);
    }

    public List<MemberResponse> getMembers(String roomId, String callerId) {
        chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room membership not found"));
        List<Participant> members = participantRepository.findByChatRoomId(roomId);
        if (members.stream().noneMatch(row -> callerId.equals(row.getUserId()))) {
            throw new ChatRoomNotFoundException("Room membership not found");
        }
        Map<String, User> users = new java.util.HashMap<>();
        userRepository.findAllById(members.stream().map(Participant::getUserId).collect(Collectors.toSet()))
            .forEach(user -> users.put(user.getId(), user));
        return members.stream().map(row -> {
            User user = users.get(row.getUserId());
            return new MemberResponse(row.getUserId(), DisplayNames.of(user), user == null ? null : user.getAvatarUrl(), row.getRole());
        }).toList();
    }

    public void removeMember(String roomId, String callerId, String targetId) {
        ChatRoom room = chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room membership not found"));
        Participant actor = participantRepository.findByChatRoomIdAndUserId(roomId, callerId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room membership not found"));
        Participant target = participantRepository.findByChatRoomIdAndUserId(roomId, targetId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room member not found"));
        policies.get(room.getType()).checkRemoveMember(callerId, actor.getRole(), targetId, target.getRole());
        String actorName = DisplayNames.of(userRepository.findById(callerId).orElse(null));
        String targetName = DisplayNames.of(userRepository.findById(targetId).orElse(null));
        if (!removeParticipant(roomId, targetId)) {
            throw new ChatRoomNotFoundException("Room member not found");
        }
        userEvents.roomRemoved(Set.of(targetId), roomId, "REMOVED");
        messages.getObject().postSystemMessage(roomId, actorName + " removed " + targetName);
    }

    public Optional<Participant> findMembership(String roomId, String userId) {
        return participantRepository.findByChatRoomIdAndUserId(roomId, userId);
    }

    /** Next owner when the owner leaves: the earliest-joined ADMIN, else the earliest-joined MEMBER (AC-009-24). */
    public Optional<Participant> findSuccessor(String roomId, String leavingUserId) {
        List<Participant> others = participantRepository.findByChatRoomId(roomId).stream()
            .filter(row -> row.getRole() != Role.OWNER && !row.getUserId().equals(leavingUserId))
            .toList();
        return earliestJoined(others, Role.ADMIN).or(() -> earliestJoined(others, Role.MEMBER));
    }

    private static Optional<Participant> earliestJoined(List<Participant> rows, Role role) {
        return rows.stream()
            .filter(row -> row.getRole() == role)
            .min(Comparator.comparing(Participant::getJoinedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Participant::getId, Comparator.nullsLast(Comparator.naturalOrder())));
    }

    /** Conditional role write: no effect unless the row still has {@code fromRole}. */
    public boolean changeRoleIfCurrent(String roomId, String userId, Role fromRole, Role toRole) {
        return participantRepository.updateRoleIfCurrent(roomId, userId, fromRole, toRole) > 0;
    }

    /** Removes a row only if it still has {@code role}, and gives the seat back when it does. */
    public boolean removeParticipantIfRole(String roomId, String userId, Role role) {
        if (participantRepository.deleteByChatRoomIdAndUserIdAndRole(roomId, userId, role) == 0) {
            return false;
        }
        chatRoomRepository.releaseSeat(roomId, LocalDateTime.now());
        presenceMembershipChanged(roomId, userId);
        logger.info("Removed participant {} with role {} from room {}", userId, role, roomId);
        return true;
    }

    public void announceOwnerTransfer(String roomId, String newOwnerId) {
        String name = DisplayNames.of(userRepository.findById(newOwnerId).orElse(null));
        messages.getObject().postSystemMessage(roomId, name + " is now the owner");
    }

    /**
     * Owner-only change between ADMIN and MEMBER (AC-009-23). The caller comes from the authenticated principal;
     * {@code newRole} is the target role only.
     */
    public void changeMemberRole(String roomId, String callerId, String targetId, Role newRole) {
        ChatRoom room = chatRoomRepository.findByIdAndIsActiveTrue(roomId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room membership not found"));
        Participant actor = participantRepository.findByChatRoomIdAndUserId(roomId, callerId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room membership not found"));
        policies.get(room.getType()).checkRoleChange();
        if (actor.getRole() != Role.OWNER) {
            throw new ForbiddenActionException("Only the owner can change member roles");
        }
        if (callerId.equals(targetId)) {
            throw new ForbiddenActionException("The owner cannot change their own role");
        }
        if (newRole == Role.OWNER) {
            throw new InvalidRequestException("The owner role cannot be assigned");
        }
        Participant target = participantRepository.findByChatRoomIdAndUserId(roomId, targetId)
            .orElseThrow(() -> new ChatRoomNotFoundException("Room member not found"));
        if (target.getRole() == Role.OWNER) {
            throw new ForbiddenActionException("The owner role cannot be changed");
        }
        if (target.getRole() == newRole) {
            return;
        }
        if (!changeRoleIfCurrent(roomId, targetId, target.getRole(), newRole)) {
            throw new ForbiddenActionException("Member role changed concurrently, retry the request");
        }
        String actorName = DisplayNames.of(userRepository.findById(callerId).orElse(null));
        String targetName = DisplayNames.of(userRepository.findById(targetId).orElse(null));
        messages.getObject().postSystemMessage(roomId,
            actorName + " made " + targetName + (newRole == Role.ADMIN ? " an admin" : " a member"));
        long unread = target.getLastReadAt() == null ? 0
            : messageRepository.countUnread(roomId, targetId, target.getLastReadAt());
        userEvents.roomUpdated(targetId, ChatRoomResponse.from(room, getParticipantUserIds(roomId), null, unread, newRole));
    }

    public void postLeaveMessage(String roomId, String name) {
        messages.getObject().postSystemMessage(roomId, DisplayNames.of(name) + " left");
    }

}
