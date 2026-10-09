package com.lnt.chatmee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.JoinChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.service.ChatRoomService;
import com.lnt.chatmee.service.ParticipantService;
import com.lnt.chatmee.util.OAuthUtil;

import lombok.RequiredArgsConstructor;

@RestController
@Tag(name = "Chat rooms", description = "Create, list, update and manage membership of chat rooms")
@RequestMapping("/api/v1/chatrooms")
@RequiredArgsConstructor
public class ChatRoomController {


    private final ChatRoomService chatRoomService;
    private final ParticipantService participantService;
    private final OAuthUtil oAuthUtil;

    @Operation(summary = "Create a public, private or direct-message room")
    @PostMapping("/create")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> createChatRoom(@Validated @RequestBody CreateChatRoomRequest request, @AuthenticationPrincipal OAuth2User principal) {
        String provider = oAuthUtil.determineProvider(principal);
        String providerId = oAuthUtil.getProviderId(principal, provider);
        ChatRoomResponse responseBody = chatRoomService.createRoom(request, provider, providerId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Chat room created successfully", responseBody));
    }

    @Operation(summary = "List the rooms the caller belongs to")
    @GetMapping
    public ResponseEntity<ApiResponse<List<ChatRoomResponse>>> getChatRoomList(@AuthenticationPrincipal OAuth2User principal) {
        String provider = oAuthUtil.determineProvider(principal);
        String providerId = oAuthUtil.getProviderId(principal, provider);
        List<ChatRoom> chatRoomList = chatRoomService.getList(provider, providerId);
        List<ChatRoomResponse> responseBody = chatRoomList.stream()
            .map(this::convertToChatRoomResponse)
            .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(responseBody));
    }

    @Operation(summary = "Get a room the caller belongs to")
    @GetMapping("/{roomId}")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> getChatRoomById(@AuthenticationPrincipal OAuth2User principal, @PathVariable String roomId) {
        String provider = oAuthUtil.determineProvider(principal);
        String providerId = oAuthUtil.getProviderId(principal, provider);
        ChatRoom room = chatRoomService.getChatRoomById(provider, providerId, roomId);
        ChatRoomResponse responseBody = convertToChatRoomResponse(room);
        return ResponseEntity.ok(ApiResponse.success(responseBody));
    }

    @Operation(summary = "Update a room (creator only)")
    @PutMapping("/{roomId}")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> updateChatRoom(@AuthenticationPrincipal OAuth2User principal, @PathVariable String roomId, @Validated @RequestBody UpdateChatRoomRequest request) {
        String provider = oAuthUtil.determineProvider(principal);
        String providerId = oAuthUtil.getProviderId(principal, provider);
        ChatRoom room = chatRoomService.updateChatRoomById(provider, providerId, roomId, request);
        ChatRoomResponse responseBody = convertToChatRoomResponse(room);
        return ResponseEntity.ok(ApiResponse.success("Chat room updated successfully", responseBody));
    }

    @Operation(summary = "Delete a room (creator only)")
    @DeleteMapping("/{roomId}")
    public ResponseEntity<ApiResponse<String>> deleteChatRoom(@AuthenticationPrincipal OAuth2User principal, @PathVariable String roomId) {
        String provider = oAuthUtil.determineProvider(principal);
        String providerId = oAuthUtil.getProviderId(principal, provider);
        chatRoomService.deleteChatRoomById(provider, providerId, roomId);
        return ResponseEntity.ok(ApiResponse.success("Chat room deleted successfully"));
    }

    @Operation(summary = "Join a public room")
    @PostMapping("/{roomId}/join")
    public ResponseEntity<ApiResponse<String>> joinChatRoom(
            @AuthenticationPrincipal OAuth2User principal,
            @PathVariable String roomId) {
        String provider = oAuthUtil.determineProvider(principal);
        String providerId = oAuthUtil.getProviderId(principal, provider);

        // Join the room as the authenticated user
        participantService.joinRoom(roomId, provider, providerId);

        return ResponseEntity.ok(ApiResponse.success("Successfully joined the chat room"));
    }

    @Operation(summary = "Add a participant (owner or admin only)")
    @PostMapping("/{roomId}/add-participant")
    public ResponseEntity<ApiResponse<String>> addParticipantToChatRoom(
            @AuthenticationPrincipal OAuth2User principal,
            @PathVariable String roomId,
            @Validated @RequestBody JoinChatRoomRequest request) {
        String provider = oAuthUtil.determineProvider(principal);
        String providerId = oAuthUtil.getProviderId(principal, provider);
        participantService.addParticipant(roomId, provider, providerId, request.getUserId(), request.getRole());
        return ResponseEntity.ok(ApiResponse.success("Participant successfully added to the chat room"));
    }

    @Operation(summary = "Leave a room")
    @PostMapping("/{roomId}/leave")
    public ResponseEntity<ApiResponse<String>> leaveChatRoom(
        @AuthenticationPrincipal OAuth2User principal,
        @PathVariable String roomId
    ) {
        String provider = oAuthUtil.determineProvider(principal);
        String providerId = oAuthUtil.getProviderId(principal, provider);

        chatRoomService.leaveChatRoomById(provider, providerId, roomId);

        return ResponseEntity.ok(ApiResponse.success("User successfully left the room"));
    }

    private ChatRoomResponse convertToChatRoomResponse(ChatRoom chatRoom) {
        return ChatRoomResponse.builder()
            .id(chatRoom.getId())
            .roomName(chatRoom.getName())
            .description(chatRoom.getDescription())
            .roomType(chatRoom.getType())
            .createdBy(chatRoom.getCreatedBy())
            .createdAt(chatRoom.getCreatedAt())
            .updatedAt(chatRoom.getLastActivity())
            .maxUsers(chatRoom.getMaxParticipants())
            .settings(chatRoom.getSettings())
            .participants(chatRoom.getParticipants())
            .build();
    }

}
