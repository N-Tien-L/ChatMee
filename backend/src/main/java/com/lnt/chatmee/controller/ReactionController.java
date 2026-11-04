package com.lnt.chatmee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.request.ReactionRequest;
import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.MessageReactionsResponse;
import com.lnt.chatmee.dto.response.ReactorPageResponse;
import com.lnt.chatmee.security.CurrentUser;
import com.lnt.chatmee.security.UserPrincipal;
import com.lnt.chatmee.service.ReactionService;

import lombok.RequiredArgsConstructor;

/** SPEC-015 message reactions; identity is the principal, never the body. */
@RestController
@Tag(name = "Reactions", description = "Message reactions")
@RequestMapping("/api/v1/rooms/{roomId}/messages/{messageId}")
@RequiredArgsConstructor
public class ReactionController {

    private final ReactionService reactionService;

    @Operation(summary = "Set the caller's reaction to a message, replacing any previous one")
    @PutMapping("/reaction")
    public ResponseEntity<ApiResponse<MessageReactionsResponse>> react(@PathVariable String roomId,
            @PathVariable String messageId, @CurrentUser UserPrincipal user,
            @Valid @RequestBody ReactionRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                reactionService.react(roomId, messageId, user.userId(), request.emoji())));
    }

    @Operation(summary = "Remove the caller's reaction to a message")
    @DeleteMapping("/reaction")
    public ResponseEntity<ApiResponse<MessageReactionsResponse>> unreact(@PathVariable String roomId,
            @PathVariable String messageId, @CurrentUser UserPrincipal user) {
        return ResponseEntity.ok(ApiResponse.success(reactionService.unreact(roomId, messageId, user.userId())));
    }

    @Operation(summary = "List who reacted to a message, newest first")
    @GetMapping("/reactions")
    public ResponseEntity<ApiResponse<ReactorPageResponse>> reactors(@PathVariable String roomId,
            @PathVariable String messageId, @CurrentUser UserPrincipal user,
            @RequestParam(required = false) String emoji,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(ApiResponse.success(
                reactionService.listReactors(roomId, messageId, user.userId(), emoji, cursor, limit)));
    }
}
