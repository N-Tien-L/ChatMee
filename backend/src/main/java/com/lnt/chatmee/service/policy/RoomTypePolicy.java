package com.lnt.chatmee.service.policy;

import java.util.Map;
import java.util.function.Predicate;
import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Participant.Role;

/** Type-specific rules and construction; persistence stays in the services. */
public interface RoomTypePolicy {
    ChatRoom.RoomType type();
    void checkJoin();
    void checkAddParticipant();
    void checkUpdate(UpdateChatRoomRequest request);
    void checkLeave(ChatRoom room, String userId);
    ChatRoom create(CreateChatRoomRequest request, String creatorId, Predicate<String> userExists);
    Map<String, Role> initialMembers(CreateChatRoomRequest request, String creatorId);
}
