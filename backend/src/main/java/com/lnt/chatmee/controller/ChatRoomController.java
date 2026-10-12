package com.lnt.chatmee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import com.lnt.chatmee.security.CurrentUser;
import com.lnt.chatmee.security.UserPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.JoinChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateMemberRoleRequest;
import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.MemberResponse;
import com.lnt.chatmee.dto.response.ChatRoomResponse;
import com.lnt.chatmee.dto.response.PagedResponse;
import com.lnt.chatmee.dto.response.PublicRoomSummary;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.service.ChatRoomService;
import com.lnt.chatmee.service.ParticipantService;

import lombok.RequiredArgsConstructor;

@RestController
@Tag(name = "Chat rooms", description = "Create, list, update and manage membership of chat rooms")
@RequestMapping("/api/v1/rooms")
@RequiredArgsConstructor
public class ChatRoomController {


    private final ChatRoomService chatRoomService;
    private final ParticipantService participantService;

    @Operation(summary = "Create a public, private or direct-message room")
    @PostMapping
    public ResponseEntity<ApiResponse<ChatRoomResponse>> createChatRoom(@Validated @RequestBody CreateChatRoomRequest request, @CurrentUser UserPrincipal user) {
        // One DM per pair (SPEC-003): asking again returns the existing room with 200.
        var existing = chatRoomService.findExistingDirectRoom(request, user.userId());
        if (existing.isPresent()) {
            return ResponseEntity.ok(ApiResponse.success("Direct message room already exists", existing.get()));
        }
        ChatRoomResponse responseBody = chatRoomService.createRoom(request, user.userId());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Chat room created successfully", responseBody));
    }

    @Operation(summary = "List the rooms the caller belongs to")
    @GetMapping
    public ResponseEntity<ApiResponse<List<ChatRoomResponse>>> getChatRoomList(@CurrentUser UserPrincipal user) {
        List<ChatRoomResponse> responseBody = chatRoomService.toResponses(chatRoomService.getList(user.userId()), user.userId());
        return ResponseEntity.ok(ApiResponse.success(responseBody));
    }

    @Operation(summary = "Discover active public rooms the caller has not joined (paged, public metadata only)")
    @GetMapping("/discover")
    public ResponseEntity<ApiResponse<PagedResponse<PublicRoomSummary>>> discoverRooms(
            @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @CurrentUser UserPrincipal user) {
        Page<PublicRoomSummary> rooms = chatRoomService.discoverRooms(user.userId(), query, page, size);

        PagedResponse<PublicRoomSummary> pageData = PagedResponse.<PublicRoomSummary>builder()
            .content(rooms.getContent())
            .page(rooms.getNumber())
            .size(rooms.getSize())
            .totalElements(rooms.getTotalElements())
            .totalPages(rooms.getTotalPages())
            .build();

        return ResponseEntity.ok(ApiResponse.success("Rooms retrieved successfully", pageData));
    }

    @Operation(summary = "Get a room the caller belongs to")
    @GetMapping("/{roomId}")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> getChatRoomById(@CurrentUser UserPrincipal user, @PathVariable String roomId) {
        ChatRoom room = chatRoomService.getChatRoomById(user.userId(), roomId);
        ChatRoomResponse responseBody = chatRoomService.toResponse(room, user.userId());
        return ResponseEntity.ok(ApiResponse.success(responseBody));
    }

    @Operation(summary = "Update a room (creator only)")
    @PutMapping("/{roomId}")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> updateChatRoom(@CurrentUser UserPrincipal user, @PathVariable String roomId, @Validated @RequestBody UpdateChatRoomRequest request) {
        ChatRoom room = chatRoomService.updateChatRoomById(user.userId(), roomId, request);
        ChatRoomResponse responseBody = chatRoomService.toResponse(room, user.userId());
        return ResponseEntity.ok(ApiResponse.success("Chat room updated successfully", responseBody));
    }

    @Operation(summary = "Delete a room (creator only)")
    @DeleteMapping("/{roomId}")
    public ResponseEntity<ApiResponse<String>> deleteChatRoom(@CurrentUser UserPrincipal user, @PathVariable String roomId) {
        chatRoomService.deleteChatRoomById(user.userId(), roomId);
        return ResponseEntity.ok(ApiResponse.success("Chat room deleted successfully"));
    }

    @Operation(summary = "Join a public room as the caller")
    @PostMapping("/{roomId}/members/me")
    public ResponseEntity<Void> joinChatRoom(
            @CurrentUser UserPrincipal user,
            @PathVariable String roomId) {

        // Join the room as the authenticated user
        participantService.joinRoom(roomId, user.userId());

        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Mark the caller's room messages as read")
    @PutMapping("/{roomId}/members/me/read")
    public ResponseEntity<Void> markRead(@CurrentUser UserPrincipal user, @PathVariable String roomId) {
        participantService.markRead(roomId, user.userId());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "List room members and their roles (members only)")
    @GetMapping("/{roomId}/members")
    public ResponseEntity<ApiResponse<List<MemberResponse>>> getMembers(@CurrentUser UserPrincipal user, @PathVariable String roomId) {
        return ResponseEntity.ok(ApiResponse.success(participantService.getMembers(roomId, user.userId())));
    }

    @Operation(summary = "Remove a member (owner or admin, according to participant roles)")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "Member removed")
    @DeleteMapping("/{roomId}/members/{userId}")
    public ResponseEntity<Void> removeMember(@CurrentUser UserPrincipal user, @PathVariable String roomId, @PathVariable String userId) {
        participantService.removeMember(roomId, user.userId(), userId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Promote or demote a member between ADMIN and MEMBER (owner only)")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "Role changed")
    @PatchMapping("/{roomId}/members/{userId}/role")
    public ResponseEntity<Void> changeMemberRole(@CurrentUser UserPrincipal user, @PathVariable String roomId,
            @PathVariable String userId, @Validated @RequestBody UpdateMemberRoleRequest request) {
        participantService.changeMemberRole(roomId, user.userId(), userId, request.role());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Add a participant (owner or admin only)")
    @PostMapping("/{roomId}/members")
    public ResponseEntity<ApiResponse<String>> addParticipantToChatRoom(
            @CurrentUser UserPrincipal user,
            @PathVariable String roomId,
            @Validated @RequestBody JoinChatRoomRequest request) {
        participantService.addParticipant(roomId, user.userId(), request.getUserId(), request.getRole());
        return ResponseEntity.ok(ApiResponse.success("Participant successfully added to the chat room"));
    }

    @Operation(summary = "Leave a room")
    @DeleteMapping("/{roomId}/members/me")
    public ResponseEntity<ApiResponse<String>> leaveChatRoom(
        @CurrentUser UserPrincipal user,
        @PathVariable String roomId
    ) {

        chatRoomService.leaveChatRoomById(user.userId(), roomId);

        return ResponseEntity.ok(ApiResponse.success("User successfully left the room"));
    }
}
