package com.lnt.chatmee.controller;

import com.lnt.chatmee.dto.PresenceMessage;
import com.lnt.chatmee.service.PresenseService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class PresenceWebSocketController {

    private static final Logger logger = LoggerFactory.getLogger(PresenceWebSocketController.class);
    
    private final SimpMessagingTemplate messagingTemplate;
    private final PresenseService presenseService;

    public PresenceWebSocketController(SimpMessagingTemplate messagingTemplate, PresenseService presenseService) {
        this.messagingTemplate = messagingTemplate;
        this.presenseService = presenseService;
    }

    @MessageMapping("/presence")
    public void handlePresenceEvent(@Payload PresenceMessage message) {
        logger.info("Received presence event: userId={}, online={}", message.getUserId(), message.isOnline());
        
        // Update presence service
        if (message.isOnline()) {
            presenseService.userConnected(message.getUserId());
        } else {
            presenseService.userDisconnected(message.getUserId());
        }
        
        // Broadcast presence update to all subscribers
        messagingTemplate.convertAndSend("/topic/presence", message);
        
        logger.info("Broadcasted presence update for user: {}", message.getUserId());
    }
}