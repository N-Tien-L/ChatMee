package com.lnt.chatmee.controller;

import java.util.List;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import com.lnt.chatmee.exception.ForbiddenActionException;
import com.lnt.chatmee.exception.UnauthorizedRoomActionException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ParticipantRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.ChatRoomService;
import com.lnt.chatmee.service.ParticipantService;
import com.lnt.chatmee.util.OAuthUtil;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/chatrooms")
@RequiredArgsConstructor
public class ChatRoomController {

    private static final Logger logger = LoggerFactory.getLogger(ChatRoomService.class);

    private final ChatRoomService chatRoomService;
    private final ParticipantService participantService;
    private final UserRepository userRepository;
    private final ParticipantRepository participantRepository;
    private final OAuthUtil oAuthUtil;
    
    @PostMapping("/create")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> createChatRoom(@Validated @RequestBody CreateChatRoomRequest request, @AuthenticationPrincipal OAuth2User principle) {
        try {
            String provider = oAuthUtil.determineProvider(principle);
            String providerId = oAuthUtil.getProviderId(principle, provider);
            ChatRoomResponse responseBody = chatRoomService.createRoom(request, provider, providerId);
            return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Chat room created successfully", responseBody));
        } catch (Exception e) {
            logger.error("Error creating chat room: ", e);
            throw e;
        }
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ChatRoomResponse>>> getChatRoomList(@AuthenticationPrincipal OAuth2User principle) {
        try {
            String provider = oAuthUtil.determineProvider(principle);
            String providerId = oAuthUtil.getProviderId(principle, provider);
            List<ChatRoom> chatRoomList = chatRoomService.getList(provider, providerId);
            List<ChatRoomResponse> responseBody = chatRoomList.stream()
                .map(this::convertToChatRoomResponse)
                .collect(Collectors.toList());
            return ResponseEntity.ok(ApiResponse.success(responseBody));
        } catch (Exception e) {
            logger.error("Error getting chat room list: ", e);
            throw e;
        }
    }

    @GetMapping("/{roomId}")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> getChatRoomById(@AuthenticationPrincipal OAuth2User principle, @PathVariable String roomId) {
        try {
            String provider = oAuthUtil.determineProvider(principle);
            String providerId = oAuthUtil.getProviderId(principle, provider);
            ChatRoom room = chatRoomService.getChatRoomById(provider, providerId, roomId);
            ChatRoomResponse responseBody = convertToChatRoomResponse(room);
            return ResponseEntity.ok(ApiResponse.success(responseBody));
        } catch (Exception e) {
            logger.error("Error getting chat room by id ", e);
            throw e;
        }
    }

    @PutMapping("/{roomId}")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> updateChatRoom(@AuthenticationPrincipal OAuth2User principle, @PathVariable String roomId, @Validated @RequestBody UpdateChatRoomRequest request) {
        try {
            String provider = oAuthUtil.determineProvider(principle);
            String providerId = oAuthUtil.getProviderId(principle, provider);
            ChatRoom room = chatRoomService.updateChatRoomById(provider, providerId, roomId, request);
            ChatRoomResponse responseBody = convertToChatRoomResponse(room);
            return ResponseEntity.ok(ApiResponse.success("Chat room updated successfully", responseBody));
        } catch (Exception e) {
            logger.error("Error updating chat room: ", e);
            throw e;
        }
    }

    @DeleteMapping("/{roomId}")
    public ResponseEntity<ApiResponse<String>> deleteChatRoom(@AuthenticationPrincipal OAuth2User principle, @PathVariable String roomId) {
        try {
            String provider = oAuthUtil.determineProvider(principle);
            String providerId = oAuthUtil.getProviderId(principle, provider);
            chatRoomService.deleteChatRoomById(provider, providerId, roomId);
            return ResponseEntity.ok(ApiResponse.success("Chat room deleted successfully"));
        } catch (Exception e) {
            logger.error("Error during deleting chat room: ", e);
            throw e;
        }
    }

    @PostMapping("/{roomId}/join")
    public ResponseEntity<ApiResponse<String>> joinChatRoom(
            @AuthenticationPrincipal OAuth2User principal, 
            @PathVariable String roomId) {
        try {
            String provider = oAuthUtil.determineProvider(principal);
            String providerId = oAuthUtil.getProviderId(principal, provider);
            
            // Join the room as the authenticated user
            participantService.joinRoom(roomId, provider, providerId);
            
            return ResponseEntity.ok(ApiResponse.success("Successfully joined the chat room"));
        } catch (Exception e) {
            logger.error("Error joining chat room: ", e);
            throw e;
        }
    }
    
    @PostMapping("/{roomId}/add-participant")
    public ResponseEntity<ApiResponse<String>> addParticipantToChatRoom(
            @AuthenticationPrincipal OAuth2User principal, 
            @PathVariable String roomId,
            @Validated @RequestBody JoinChatRoomRequest request) {
        try {
            String provider = oAuthUtil.determineProvider(principal);
            String providerId = oAuthUtil.getProviderId(principal, provider);

            User authenticatedUser = userRepository.findByProviderAndProviderId(provider, providerId)
                .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
            
            Participant authenticatedParticipant = participantRepository.findByChatRoomIdAndUserId(roomId, authenticatedUser.getId())
                .orElseThrow(() -> new UnauthorizedRoomActionException("User is not a participant of the chat room"));
            if (authenticatedParticipant.getRole() != Participant.Role.ADMIN && authenticatedParticipant.getRole() != Participant.Role.OWNER ) {
                throw new ForbiddenActionException("Only ADMIN or OWNER can add participants to the chat room");
            }
            
            Participant.Role role = Participant.Role.MEMBER;
            if (request.getRole() != null && !request.getRole().trim().isEmpty()) {
                try {
                    role = Participant.Role.valueOf(request.getRole().toUpperCase());
                } catch (IllegalArgumentException e) {
                    throw new IllegalArgumentException("Invalid role specified: " + request.getRole());
                }
            }
            
            // Add the participant to the room
            participantService.addParticipant(roomId, request.getUserId(), role);
            
            return ResponseEntity.ok(ApiResponse.success("Participant successfully added to the chat room"));
        } catch (Exception e) {
            logger.error("Error adding participant to chat room: ", e);
            throw e;
        }
    }

    private ChatRoomResponse convertToChatRoomResponse(ChatRoom chatRoom) {
        return ChatRoomResponse.builder()
            .id(chatRoom.getId())
            .roomName(chatRoom.getName())
            .description(chatRoom.getDescription())
            .roomType(chatRoom.getType())
            .createdBy(chatRoom.getCreatedBy())
            .createdAt(chatRoom.getCreatedAt())
            .maxUsers(chatRoom.getMaxParticipants())
            .settings(chatRoom.getSettings())
            .build();
    }

}
