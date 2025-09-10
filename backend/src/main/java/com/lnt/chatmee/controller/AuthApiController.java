package com.lnt.chatmee.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.AuthResponse;
import com.lnt.chatmee.dto.response.UserResponse;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@CrossOrigin(origins = { "http://localhost:3000" })
public class AuthApiController {

    private final UserRepository userRepository;

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<AuthResponse>> getCurrentUser(@AuthenticationPrincipal OAuth2User principal) {
        if (principal == null) {
            AuthResponse authResponse = AuthResponse.builder()
                    .authenticated(false)
                    .message(("User not authenticated"))
                    .build();

            return ResponseEntity.ok(ApiResponse.success(authResponse));
        }

        String provider = determineProvider(principal);
        String providerId = getProviderId(principal, provider);

        User user = userRepository.findByProviderAndProviderId(provider, providerId)
                .orElse(null);

        if (user != null) {
            UserResponse userResponse = UserResponse.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .email(user.getEmail())
                    .avatarUrl(user.getAvatarUrl())
                    .provider(user.getProvider())
                    .build();

            AuthResponse authResponse = AuthResponse.builder()
                    .authenticated(true)
                    .user(userResponse)
                    .message("User authenticated successfully")
                    .build();

            return ResponseEntity.ok(ApiResponse.success(authResponse));
        } else {
            AuthResponse authResponse = AuthResponse.builder()
                    .authenticated(false)
                    .message("User not found in database")
                    .build();

            return ResponseEntity.ok(ApiResponse.success(authResponse));
        }
    }

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<Boolean>> getAuthStatus(@AuthenticationPrincipal OAuth2User principal) {
        boolean isAuthenticated = principal != null;
        return ResponseEntity.ok(ApiResponse.success("Authenticated status retrived", isAuthenticated));
    }

    @GetMapping("/user")
    public ResponseEntity<ApiResponse<UserResponse>> getUserInfo(@AuthenticationPrincipal OAuth2User principal) {
        if (principal == null) {
            return ResponseEntity.ok(ApiResponse.error("User not authenticated"));
        }

        String provider = determineProvider(principal);
        String providerId = getProviderId(principal, provider);

        User user = userRepository.findByProviderAndProviderId(provider, providerId)
                .orElse(null);

        if (user != null) {
            UserResponse userResponse = UserResponse.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .email(user.getEmail())
                    .avatarUrl(user.getAvatarUrl())
                    .provider(user.getProvider())
                    .build();

            return ResponseEntity.ok(ApiResponse.success(userResponse));
        } else {
            return ResponseEntity.ok(ApiResponse.error("User not found in database"));
        }
    }

    private String determineProvider(OAuth2User principal) {
        if (principal.getAttribute("sub") != null) {
            return "google";
        } else if (principal.getAttribute("login") != null) {
            return "github";
        }
        return "unknown";
    }

    private String getProviderId(OAuth2User principal, String provider) {
        if ("google".equals(provider)) {
            return principal.getAttribute("sub");
        } else if ("github".equals(provider)) {
            Object id = principal.getAttribute("id");
            return id != null ? id.toString() : null;
        }
        return null;
    }
}