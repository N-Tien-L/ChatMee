package com.lnt.chatmee.controller;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.DestinationVariable;
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

    @MessageMapping("/rooms/{roomId}/typing")
    public void handleTypingEvent(@DestinationVariable String roomId, @Payload TypingMessage message, Principal principal) {
        if (principal == null || roomId == null || roomId.isBlank()
                || !participantService.isUserParticipant(roomId, principal.getName())) {
            return;
        }
        message.setRoomId(roomId);
        message.setUserId(principal.getName());
        messagingTemplate.convertAndSend("/topic/rooms/" + roomId + "/typing", message);
    }
}
