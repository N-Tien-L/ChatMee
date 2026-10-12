package com.lnt.chatmee.dto.event;

public record RoomActivityPayload(String roomId, LastMessageSummary lastMessage) {}
