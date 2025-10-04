package com.lnt.chatmee.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.ChatMessageResponse;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.MessageService;
import com.lnt.chatmee.util.OAuthUtil;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/messages")
@RequiredArgsConstructor
public class MessageController {

    private static final Logger logger = LoggerFactory.getLogger(MessageController.class);

    private final MessageService messageService;
    private final OAuthUtil oAuthUtil;
    private final UserRepository userRepository;

    @GetMapping("/room/{roomId}")
    public ResponseEntity<ApiResponse<List<ChatMessageResponse>>> getRecentMessages(
            @PathVariable String roomId,
            @AuthenticationPrincipal OAuth2User principle) {
        try {
            String provider = oAuthUtil.determineProvider(principle);
            String providerId = oAuthUtil.getProviderId(principle, provider);

            User user = userRepository.findByProviderAndProviderId(provider, providerId)
                    .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));

            List<ChatMessageResponse> messages = messageService.getRecentMessages(roomId, user.getId());

            return ResponseEntity.ok(ApiResponse.success(messages));
        } catch (Exception e) {
            logger.error("Error fetching recent messages for room: {}", roomId, e);
            throw e;
        }
    }
}
