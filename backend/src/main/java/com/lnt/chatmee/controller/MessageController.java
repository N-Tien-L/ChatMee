package com.lnt.chatmee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;

import org.springframework.http.ResponseEntity;
import com.lnt.chatmee.security.CurrentUser;
import com.lnt.chatmee.security.UserPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.service.MessageService;

import lombok.RequiredArgsConstructor;

@RestController
@Tag(name = "Messages", description = "Message history")
@RequestMapping("/api/v1/rooms/{roomId}/messages")
@RequiredArgsConstructor
public class MessageController {


    private final MessageService messageService;

    @Operation(summary = "Get recent messages of a room the caller belongs to")
    @GetMapping
    public ResponseEntity<ApiResponse<List<ChatMessageResponse>>> getRecentMessages(
            @PathVariable String roomId,
            @CurrentUser UserPrincipal user) {

        List<ChatMessageResponse> messages = messageService.getRecentMessages(roomId, user.userId());

        return ResponseEntity.ok(ApiResponse.success(messages));
    }
}
