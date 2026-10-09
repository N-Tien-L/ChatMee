package com.lnt.chatmee.service.policy;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Map;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.exception.*;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.model.Participant.Role;

class RoomTypePolicyRegistryTest {
    @Test void construct_completePolicies_resolvesEveryType() {
        var publicPolicy = new PublicRoomPolicy(); var privatePolicy = new PrivateRoomPolicy(); var directPolicy = new DirectRoomPolicy();
        var registry = new RoomTypePolicyRegistry(List.of(publicPolicy, privatePolicy, directPolicy));
        assertSame(publicPolicy, registry.get(RoomType.PUBLIC)); assertSame(privatePolicy, registry.get(RoomType.PRIVATE));
        assertSame(directPolicy, registry.get(RoomType.DIRECT_MESSAGE));
    }
    @Test void construct_missingPolicy_failsFast() {
        assertEquals("Missing room type policy: DIRECT_MESSAGE", assertThrows(IllegalStateException.class,
            () -> new RoomTypePolicyRegistry(List.of(new PublicRoomPolicy(), new PrivateRoomPolicy()))).getMessage());
    }
    @Test void construct_duplicatePolicy_failsFast() {
        assertEquals("Duplicate room type policy: PUBLIC", assertThrows(IllegalStateException.class,
            () -> new RoomTypePolicyRegistry(List.of(new PublicRoomPolicy(), new PublicRoomPolicy(),
                new PrivateRoomPolicy(), new DirectRoomPolicy()))).getMessage());
    }
    @Test void get_nullType_throwsInvalidRequest() {
        var registry = new RoomTypePolicyRegistry(List.of(new PublicRoomPolicy(), new PrivateRoomPolicy(), new DirectRoomPolicy()));
        assertThrows(InvalidRequestException.class, () -> registry.get(null));
    }
}
