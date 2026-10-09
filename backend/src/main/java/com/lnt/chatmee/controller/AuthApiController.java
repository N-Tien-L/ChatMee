package com.lnt.chatmee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

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
import com.lnt.chatmee.service.UserService;
import com.lnt.chatmee.security.WsTokenService;

import lombok.RequiredArgsConstructor;

@RestController
@Tag(name = "Auth", description = "Session and WebSocket token endpoints")
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthApiController {

    private final UserService userService;
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
        AuthResponse authResponse = AuthResponse.builder()
                .authenticated(true).user(userService.getUserProfile(user.userId()))
                .message("User authenticated successfully").build();
        return ResponseEntity.ok(ApiResponse.success(authResponse));
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
        return ResponseEntity.ok(ApiResponse.success(userService.getUserProfile(user.userId())));
    }
}
