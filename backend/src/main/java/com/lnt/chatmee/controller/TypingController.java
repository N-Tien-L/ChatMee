package com.lnt.chatmee.controller;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.lnt.chatmee.dto.TypingMessage;
import com.lnt.chatmee.service.ParticipantService;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class TypingController {

    private final SimpMessagingTemplate messagingTemplate;
    private final ParticipantService participantService;

    @MessageMapping("/typing")
    public void handleTypingEvent(@Payload TypingMessage message, Principal principal) {
        if (principal == null || message.getRoomId() == null || message.getRoomId().isBlank()
                || !participantService.isUserParticipant(message.getRoomId(), principal.getName())) {
            return;
        }
        message.setUserId(principal.getName());
        String destination = "/topic/rooms/" + message.getRoomId() + "/typing";
        messagingTemplate.convertAndSend(destination, message);
    }
}
