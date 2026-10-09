package com.lnt.chatmee.service.policy;

import org.springframework.stereotype.Component;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.exception.ForbiddenActionException;

@Component
public class PrivateRoomPolicy extends GroupRoomPolicy {
    @Override
    public RoomType type() {
        return RoomType.PRIVATE;
    }
    @Override
    public void checkJoin() {
        throw new ForbiddenActionException("Only PUBLIC rooms can be joined");
    }
}
