package com.lnt.chatmee.dto.request;

import jakarta.validation.constraints.Size;

import com.lnt.chatmee.model.ChatRoom;

/**
 * Room settings as accepted from clients (CM-085, A-02). The flags have no behaviour in v0 (SPEC-008 §2), but the
 * input is bounded so a stored value cannot grow without limit. JSON null for a flag binds to false.
 */
public record RoomSettingsRequest(
        boolean allowFileSharing,
        boolean allowGuestUsers,
        boolean moderationRequired,
        @Size(max = RoomSettingsRequest.WELCOME_MESSAGE_MAX_LENGTH,
                message = "Welcome message must not exceed 500 characters")
        String welcomeMessage) {

    public static final int WELCOME_MESSAGE_MAX_LENGTH = 500;

    public ChatRoom.RoomSettings toRoomSettings() {
        return ChatRoom.RoomSettings.builder()
                .allowFileSharing(allowFileSharing)
                .allowGuestUsers(allowGuestUsers)
                .moderationRequired(moderationRequired)
                .welcomeMessage(welcomeMessage)
                .build();
    }
}
