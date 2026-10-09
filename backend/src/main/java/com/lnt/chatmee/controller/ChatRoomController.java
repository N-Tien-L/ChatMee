package com.lnt.chatmee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import com.lnt.chatmee.security.CurrentUser;
import com.lnt.chatmee.security.UserPrincipal;
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

import lombok.RequiredArgsConstructor;

@RestController
@Tag(name = "Chat rooms", description = "Create, list, update and manage membership of chat rooms")
@RequestMapping("/api/v1/chatrooms")
@RequiredArgsConstructor
public class ChatRoomController {


    private final ChatRoomService chatRoomService;
    private final ParticipantService participantService;

    @Operation(summary = "Create a public, private or direct-message room")
    @PostMapping("/create")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> createChatRoom(@Validated @RequestBody CreateChatRoomRequest request, @CurrentUser UserPrincipal user) {
        ChatRoomResponse responseBody = chatRoomService.createRoom(request, user.userId());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Chat room created successfully", responseBody));
    }

    @Operation(summary = "List the rooms the caller belongs to")
    @GetMapping
    public ResponseEntity<ApiResponse<List<ChatRoomResponse>>> getChatRoomList(@CurrentUser UserPrincipal user) {
        List<ChatRoomResponse> responseBody = chatRoomService.toResponses(chatRoomService.getList(user.userId()));
        return ResponseEntity.ok(ApiResponse.success(responseBody));
    }

    @Operation(summary = "Get a room the caller belongs to")
    @GetMapping("/{roomId}")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> getChatRoomById(@CurrentUser UserPrincipal user, @PathVariable String roomId) {
        ChatRoom room = chatRoomService.getChatRoomById(user.userId(), roomId);
        ChatRoomResponse responseBody = chatRoomService.toResponse(room);
        return ResponseEntity.ok(ApiResponse.success(responseBody));
    }

    @Operation(summary = "Update a room (creator only)")
    @PutMapping("/{roomId}")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> updateChatRoom(@CurrentUser UserPrincipal user, @PathVariable String roomId, @Validated @RequestBody UpdateChatRoomRequest request) {
        ChatRoom room = chatRoomService.updateChatRoomById(user.userId(), roomId, request);
        ChatRoomResponse responseBody = chatRoomService.toResponse(room);
        return ResponseEntity.ok(ApiResponse.success("Chat room updated successfully", responseBody));
    }

    @Operation(summary = "Delete a room (creator only)")
    @DeleteMapping("/{roomId}")
    public ResponseEntity<ApiResponse<String>> deleteChatRoom(@CurrentUser UserPrincipal user, @PathVariable String roomId) {
        chatRoomService.deleteChatRoomById(user.userId(), roomId);
        return ResponseEntity.ok(ApiResponse.success("Chat room deleted successfully"));
    }

    @Operation(summary = "Join a public room")
    @PostMapping("/{roomId}/join")
    public ResponseEntity<ApiResponse<String>> joinChatRoom(
            @CurrentUser UserPrincipal user,
            @PathVariable String roomId) {

        // Join the room as the authenticated user
        participantService.joinRoom(roomId, user.userId());

        return ResponseEntity.ok(ApiResponse.success("Successfully joined the chat room"));
    }

    @Operation(summary = "Add a participant (owner or admin only)")
    @PostMapping("/{roomId}/add-participant")
    public ResponseEntity<ApiResponse<String>> addParticipantToChatRoom(
            @CurrentUser UserPrincipal user,
            @PathVariable String roomId,
            @Validated @RequestBody JoinChatRoomRequest request) {
        participantService.addParticipant(roomId, user.userId(), request.getUserId(), request.getRole());
        return ResponseEntity.ok(ApiResponse.success("Participant successfully added to the chat room"));
    }

    @Operation(summary = "Leave a room")
    @PostMapping("/{roomId}/leave")
    public ResponseEntity<ApiResponse<String>> leaveChatRoom(
        @CurrentUser UserPrincipal user,
        @PathVariable String roomId
    ) {

        chatRoomService.leaveChatRoomById(user.userId(), roomId);

        return ResponseEntity.ok(ApiResponse.success("User successfully left the room"));
    }
}
