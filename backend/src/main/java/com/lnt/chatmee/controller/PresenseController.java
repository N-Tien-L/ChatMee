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
import com.lnt.chatmee.service.PresenseService;

@RestController
@RequestMapping("/api/v1")
public class PresenseController {
    
    private static final Logger logger = LoggerFactory.getLogger(PresenseController.class);
    
    private final PresenseService PresenseService;
    private final SimpMessagingTemplate messagingTemplate;

    public PresenseController(PresenseService PresenseService, SimpMessagingTemplate messagingTemplate) {
        this.PresenseService = PresenseService;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping("/online-users")
    public Set<String> getOnlineUsers() {
        return PresenseService.getOnlineUsers();
    }

    @PostMapping("/presence/offline")
    public void setUserOffline(@RequestBody PresenceMessage presenceMessage) {
        logger.info("REST API: Setting user offline - userId: {}", presenceMessage.getUserId());
        
        // Update presence service
        PresenseService.userDisconnected(presenceMessage.getUserId());
        
        // Broadcast offline status
        PresenceMessage offlineMessage = new PresenceMessage(presenceMessage.getUserId(), false);
        messagingTemplate.convertAndSend("/topic/presence", offlineMessage);
        
        logger.info("REST API: Broadcasted offline status for user: {}", presenceMessage.getUserId());
    }
}
