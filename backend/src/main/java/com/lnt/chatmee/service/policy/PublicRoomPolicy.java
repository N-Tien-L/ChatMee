package com.lnt.chatmee.service.policy;

import org.springframework.stereotype.Component;
import com.lnt.chatmee.model.ChatRoom.RoomType;

@Component
public class PublicRoomPolicy extends GroupRoomPolicy {
    @Override
    public RoomType type() {
        return RoomType.PUBLIC;
    }
    @Override
    public void checkJoin() {
        // Public rooms allow self-service joins.
    }
}
