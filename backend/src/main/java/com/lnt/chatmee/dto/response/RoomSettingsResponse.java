package com.lnt.chatmee.dto.response;

import com.lnt.chatmee.model.ChatRoom;

/**
 * Room settings as returned to clients (CM-067, completes A-02): the API exposes this record, not the entity class.
 * Same JSON properties as before; the flags have no behaviour in v0 (SPEC-008 §2).
 */
public record RoomSettingsResponse(
        boolean allowFileSharing,
        boolean allowGuestUsers,
        boolean moderationRequired,
        String welcomeMessage) {

    public static RoomSettingsResponse from(ChatRoom.RoomSettings settings) {
        if (settings == null) return null;
        return new RoomSettingsResponse(settings.isAllowFileSharing(), settings.isAllowGuestUsers(),
                settings.isModerationRequired(), settings.getWelcomeMessage());
    }
}
