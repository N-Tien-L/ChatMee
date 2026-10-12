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

    default void checkRemoveMember(String callerId, Role callerRole, String targetId, Role targetRole) {
        if (callerId.equals(targetId) || (callerRole != Role.OWNER
                && !(callerRole == Role.ADMIN && targetRole == Role.MEMBER))) {
            throw new com.lnt.chatmee.exception.ForbiddenActionException("Cannot remove this member");
        }
    }

    void checkUpdate(UpdateChatRoomRequest request);
    void checkLeave(ChatRoom room, String userId);
    ChatRoom create(CreateChatRoomRequest request, String creatorId, Predicate<String> userExists);
    Map<String, Role> initialMembers(CreateChatRoomRequest request, String creatorId);

    /** Key that makes a room unique for its members (one DM per pair), or null when rooms of this type may repeat. */
    default String memberKey(CreateChatRoomRequest request, String creatorId) {
        return null;
    }

    /** Whether responses show the other member as the room's counterpart (DMs have no name of their own). */
    default boolean showsCounterpart() {
        return false;
    }
}
