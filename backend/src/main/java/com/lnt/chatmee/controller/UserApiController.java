package com.lnt.chatmee.controller;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.UserResponse;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@CrossOrigin(origins = { "http://localhost:3000" })
public class UserApiController {

    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<List<UserResponse>>> getAllUsers() {
        List<User> users = userRepository.findAll();
        List<UserResponse> userResponses = users.stream()
                .map(this::convertToUserResponse)
                .collect(Collectors.toList());

        return ResponseEntity.ok(ApiResponse.success("Users retrived successfully", userResponses));
    }

    @GetMapping("/{userId}")
    public ResponseEntity<ApiResponse<UserResponse>> getUserById(@PathVariable String userId) {
        return userRepository.findById(userId)
                .map(user -> {
                    UserResponse userResponse = convertToUserResponse(user);
                    return ResponseEntity.ok(ApiResponse.success("User found", userResponse));
                })
                .orElse(ResponseEntity.ok(ApiResponse.error("User not found")));
    }

    @GetMapping("/provider/{provider}/id/{providerId}")
    public ResponseEntity<ApiResponse<UserResponse>> getUserByProviderAndId(
            @PathVariable String provider,
            @PathVariable String providerId) {
        return userRepository.findByProviderAndProviderId(provider, providerId)
                .map(user -> {
                    UserResponse userResponse = convertToUserResponse(user);
                    return ResponseEntity.ok(ApiResponse.success("User found", userResponse));
                })
                .orElse(ResponseEntity.ok(ApiResponse.error("User not found")));
    }

    private UserResponse convertToUserResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .avatarUrl(user.getAvatarUrl())
                .provider(user.getProvider())
                .build();
    }
}