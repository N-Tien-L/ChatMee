package com.lnt.chatmee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.lnt.chatmee.exception.UserNotFoundException;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import com.lnt.chatmee.security.CurrentUser;
import com.lnt.chatmee.security.UserPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.AuthResponse;
import com.lnt.chatmee.dto.response.UserResponse;
import com.lnt.chatmee.dto.response.WsTokenResponse;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.security.WsTokenService;

import lombok.RequiredArgsConstructor;

@RestController
@Tag(name = "Auth", description = "Session and WebSocket token endpoints")
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthApiController {

    private final UserRepository userRepository;
    private final WsTokenService wsTokenService;

    @Operation(summary = "Issue a single-use, 60-second token for the STOMP CONNECT header")
    @PostMapping("/ws-token")
    public ResponseEntity<WsTokenResponse> getWsToken(@CurrentUser UserPrincipal user) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new WsTokenResponse(wsTokenService.issueToken(user.userId())));
    }

    @Operation(summary = "Get the authenticated user and session status")
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<AuthResponse>> getCurrentUser(@CurrentUser UserPrincipal user) {
        if (user == null) {
            throw new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException("Authentication required");
        }


        User profile = userRepository.findById(user.userId())
                .orElse(null);

        if (profile != null) {
            UserResponse userResponse = UserResponse.builder()
                    .id(profile.getId())
                    .name(profile.getName())
                    .email(profile.getEmail())
                    .avatarUrl(profile.getAvatarUrl())
                    .provider(profile.getProvider())
                    .build();

            AuthResponse authResponse = AuthResponse.builder()
                    .authenticated(true)
                    .user(userResponse)
                    .message("User authenticated successfully")
                    .build();

            return ResponseEntity.ok(ApiResponse.success(authResponse));
        } else {
            throw new UserNotFoundException("User not found in database");
        }
    }

    @Operation(summary = "Check whether the session is authenticated")
    @GetMapping("/status")
    public ResponseEntity<ApiResponse<Boolean>> getAuthStatus(org.springframework.security.core.Authentication authentication) {
        boolean isAuthenticated = authentication != null && authentication.getPrincipal() instanceof UserPrincipal;
        return ResponseEntity.ok(ApiResponse.success("Authenticated status retrieved", isAuthenticated));
    }

    @Operation(summary = "Get the authenticated user profile")
    @GetMapping("/user")
    public ResponseEntity<ApiResponse<UserResponse>> getUserInfo(@CurrentUser UserPrincipal user) {
        if (user == null) {
            throw new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException("Authentication required");
        }


        User profile = userRepository.findById(user.userId())
                .orElse(null);

        if (profile != null) {
            UserResponse userResponse = UserResponse.builder()
                    .id(profile.getId())
                    .name(profile.getName())
                    .email(profile.getEmail())
                    .avatarUrl(profile.getAvatarUrl())
                    .provider(profile.getProvider())
                    .build();

            return ResponseEntity.ok(ApiResponse.success(userResponse));
        } else {
            throw new UserNotFoundException("User not found in database");
        }
    }
}
