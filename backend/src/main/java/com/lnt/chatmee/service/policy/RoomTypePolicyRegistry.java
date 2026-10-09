package com.lnt.chatmee.service.policy;

import java.util.EnumMap;
import java.util.List;
import org.springframework.stereotype.Component;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import com.lnt.chatmee.exception.InvalidRequestException;

@Component
public class RoomTypePolicyRegistry {
    private final EnumMap<RoomType, RoomTypePolicy> policies = new EnumMap<>(RoomType.class);

    public RoomTypePolicyRegistry(List<RoomTypePolicy> policies) {
        for (RoomTypePolicy policy : policies) {
            if (this.policies.putIfAbsent(policy.type(), policy) != null) {
                throw new IllegalStateException("Duplicate room type policy: " + policy.type());
            }
        }
        for (RoomType type : RoomType.values()) {
            if (!this.policies.containsKey(type)) {
                throw new IllegalStateException("Missing room type policy: " + type);
            }
        }
    }

    public RoomTypePolicy get(RoomType type) {
        if (type == null) {
            throw new InvalidRequestException("Invalid room type: " + type);
        }
        return policies.get(type);
    }
}
