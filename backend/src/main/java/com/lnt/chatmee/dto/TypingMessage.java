package com.lnt.chatmee.dto;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TypingMessage {
    private String roomId;
    private String userId;
    private boolean typing;
}