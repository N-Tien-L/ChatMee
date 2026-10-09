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
    public void checkAddParticipant() {
        throw new ForbiddenActionException("Cannot add participants to direct message rooms");
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
            .maxParticipants(2).memberCount(2).isActive(true)
            .settings(ChatRoom.RoomSettings.builder().allowFileSharing(true).allowGuestUsers(false)
                .moderationRequired(false).build()).build();
    }
    @Override
    public Map<String, Role> initialMembers(CreateChatRoomRequest request, String creatorId) {
        return Map.of(creatorId, Role.OWNER, request.getParticipantId(), Role.MEMBER);
    }
}
