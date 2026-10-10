package com.lnt.chatmee.dto.validation;

import java.util.ArrayList;
import java.util.List;

import org.hibernate.validator.spi.group.DefaultGroupSequenceProvider;

import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.model.ChatRoom.RoomType;

/**
 * Activates the per-room-type validation group of {@link CreateChatRoomRequest}: a direct message
 * needs a participant, while public and private rooms need a name.
 */
public class CreateChatRoomGroupSequenceProvider implements DefaultGroupSequenceProvider<CreateChatRoomRequest> {

    @Override
    public List<Class<?>> getValidationGroups(CreateChatRoomRequest request) {
        List<Class<?>> groups = new ArrayList<>();
        groups.add(CreateChatRoomRequest.class);
        if (request == null || request.getRoomType() == null) {
            return groups;
        }
        groups.add(request.getRoomType() == RoomType.DIRECT_MESSAGE
                ? CreateChatRoomRequest.DirectMessageChecks.class
                : CreateChatRoomRequest.GroupRoomChecks.class);
        return groups;
    }
}
