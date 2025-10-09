package com.lnt.chatmee.controller;

import com.lnt.chatmee.dto.TypingMessage;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class TypingController {

    private final SimpMessagingTemplate messagingTemplate;

    public TypingController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/typing")
    public void handleTypingEvent(@Payload TypingMessage message) {
        String destination = "/topic/typing/" + message.getRoomId();
        messagingTemplate.convertAndSend(destination, message);
    }
}