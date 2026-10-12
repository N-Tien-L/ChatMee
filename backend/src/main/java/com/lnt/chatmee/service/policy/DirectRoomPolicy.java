package com.lnt.chatmee.service.policy;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.function.Predicate;
import org.springframework.stereotype.Component;
import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.Participant.Role;

@Component
public class DirectRoomPolicy implements RoomTypePolicy {
    @Override
    public RoomType type() {
        return RoomType.DIRECT_MESSAGE;
    }
    @Override
    public void checkJoin() {
        throw new ForbiddenActionException("Only PUBLIC rooms can be joined");
    }
    @Override
    public void checkInvite() {
        throw new ForbiddenActionException("Cannot invite users to direct message rooms");
    }
    @Override
    public void checkRoleChange() {
        throw new ForbiddenActionException("Cannot change roles in direct message rooms");
    }
    @Override
    public void checkRemoveMember(String callerId, Role callerRole, String targetId, Role targetRole) {
        throw new ForbiddenActionException("Cannot remove members from direct message rooms");
    }

    @Override
    public void checkUpdate(UpdateChatRoomRequest request) {
        if (request.getMaxUsers() != null) {
            throw new InvalidRequestException("Cannot change max users for direct message rooms");
        }
    }
    @Override
    public void checkLeave(ChatRoom room, String userId) {
        throw new ForbiddenActionException("Cannot leave direct message rooms. Please delete the room instead.");
    }
    @Override
    public ChatRoom create(CreateChatRoomRequest request, String creatorId, Predicate<String> userExists) {
        if (!userExists.test(request.getParticipantId())) {
            throw new UserNotFoundException("Participant not found");
        }
        if (creatorId.equals(request.getParticipantId())) {
            throw new InvalidRequestException("Cannot create direct message with yourself");
        }
        return ChatRoom.builder().type(type()).createdBy(creatorId).lastActivity(LocalDateTime.now())
            .memberKey(memberKey(creatorId, request.getParticipantId()))
            .maxParticipants(2).memberCount(2).isActive(true)
            .settings(ChatRoom.RoomSettings.builder().allowFileSharing(true).allowGuestUsers(false)
                .moderationRequired(false).build()).build();
    }
    @Override
    public String memberKey(CreateChatRoomRequest request, String creatorId) {
        return request.getParticipantId() == null ? null : memberKey(creatorId, request.getParticipantId());
    }

    @Override
    public boolean showsCounterpart() {
        return true;
    }

    /** Order-independent key of a user pair: one active DM per pair. */
    public static String memberKey(String firstUserId, String secondUserId) {
        return firstUserId.compareTo(secondUserId) <= 0
            ? firstUserId + ":" + secondUserId
            : secondUserId + ":" + firstUserId;
    }

    @Override
    public Map<String, Role> initialMembers(CreateChatRoomRequest request, String creatorId) {
        return Map.of(creatorId, Role.OWNER, request.getParticipantId(), Role.MEMBER);
    }
}
