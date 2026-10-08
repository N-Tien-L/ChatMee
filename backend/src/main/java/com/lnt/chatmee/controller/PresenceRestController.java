package com.lnt.chatmee.controller;

import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.lnt.chatmee.dto.PresenceMessage;
import com.lnt.chatmee.service.PresenceService;

@RestController
@RequestMapping("/api/v1")
public class PresenceRestController {
    
    private static final Logger logger = LoggerFactory.getLogger(PresenceRestController.class);
    
    private final PresenceService PresenceService;
    private final SimpMessagingTemplate messagingTemplate;

    public PresenceRestController(PresenceService PresenceService, SimpMessagingTemplate messagingTemplate) {
        this.PresenceService = PresenceService;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping("/online-users")
    public Set<String> getOnlineUsers() {
        return PresenceService.getOnlineUsers();
    }

    @PostMapping("/presence/offline")
    public void setUserOffline(@RequestBody PresenceMessage presenceMessage) {
        logger.info("REST API: Setting user offline - userId: {}", presenceMessage.getUserId());
        
        // Update presence service
        PresenceService.userDisconnected(presenceMessage.getUserId());
        
        // Broadcast offline status
        PresenceMessage offlineMessage = new PresenceMessage(presenceMessage.getUserId(), false);
        messagingTemplate.convertAndSend("/topic/presence", offlineMessage);
        
        logger.info("REST API: Broadcasted offline status for user: {}", presenceMessage.getUserId());
    }
}
