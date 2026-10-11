package com.lnt.chatmee.controller;

import java.security.Principal;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;
import com.lnt.chatmee.dto.PresenceMessage;
import com.lnt.chatmee.service.PresenceService;

@Controller
@RequiredArgsConstructor
public class PresenceWebSocketController {
    private final PresenceService presenceService;

    @MessageMapping("/presence")
    public void handlePresenceEvent(@Payload PresenceMessage message, Principal principal,
            SimpMessageHeaderAccessor headers) {
        if (principal != null) {
            presenceService.heartbeat(principal.getName(), headers.getSessionId());
        }
    }
}
