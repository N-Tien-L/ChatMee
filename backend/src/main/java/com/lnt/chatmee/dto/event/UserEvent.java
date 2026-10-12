package com.lnt.chatmee.dto.event;

import java.time.Instant;
import com.fasterxml.jackson.annotation.JsonFormat;

/** User-wide event; the payload depends on type and is never logged. */
public record UserEvent<T>(String type, T payload,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant occurredAt) {}
