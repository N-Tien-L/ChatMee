package com.lnt.chatmee.dto;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PresenceMessage {
    private String userId;
    private boolean online;
}