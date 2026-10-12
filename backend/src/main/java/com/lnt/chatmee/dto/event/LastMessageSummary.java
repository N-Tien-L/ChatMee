package com.lnt.chatmee.dto.event;

import java.time.Instant;
import com.fasterxml.jackson.annotation.JsonFormat;

public record LastMessageSummary(String id, String senderId, String senderName, String preview,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant createdAt) {}
