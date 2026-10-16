package com.lnt.chatmee.service.policy;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.function.Predicate;
import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Participant.Role;

public abstract class GroupRoomPolicy implements RoomTypePolicy {
    @Override
    public void checkUpdate(UpdateChatRoomRequest request) {
        // Capacity is checked atomically by the repository for group rooms.
    }
    @Override
    public void checkLeave(ChatRoom room, String userId) {
        // Owner succession is decided by participant roles in ChatRoomService (AC-009-24).
    }
    @Override
    public ChatRoom create(CreateChatRoomRequest request, String creatorId, Predicate<String> userExists) {
        ChatRoom.RoomSettings settings = request.getSettings() != null ? request.getSettings().toRoomSettings()
            : ChatRoom.RoomSettings.builder().allowFileSharing(false).allowGuestUsers(false)
                .moderationRequired(false).welcomeMessage("").build();
        return ChatRoom.builder().name(request.getRoomName()).description(request.getDescription())
            .type(type()).createdBy(creatorId).lastActivity(LocalDateTime.now())
            .maxParticipants(request.getMaxUsers() != null ? request.getMaxUsers() : -1)
            .memberCount(1).isActive(true).settings(settings).build();
    }
    @Override
    public Map<String, Role> initialMembers(CreateChatRoomRequest request, String creatorId) {
        return Map.of(creatorId, Role.OWNER);
    }
}
