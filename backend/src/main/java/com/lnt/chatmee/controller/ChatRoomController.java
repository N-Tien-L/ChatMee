package com.lnt.chatmee.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.response.CreateChatRoomResponse;
import com.lnt.chatmee.service.ChatRoomService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/chatrooms")
@RequiredArgsConstructor
public class ChatRoomController {

    private static final Logger logger = LoggerFactory.getLogger(ChatRoomService.class);

    private final ChatRoomService chatRoomService;
    
    @PostMapping("/create")
    public ResponseEntity<CreateChatRoomResponse> createChatRoom(@Validated @RequestBody CreateChatRoomRequest request) {
        try {
            CreateChatRoomResponse responseBody = chatRoomService.createRoom(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(responseBody);
        } catch (Exception e) {
            logger.error("Error creating chat room: ", e);
            throw e;
        }
    }

}
