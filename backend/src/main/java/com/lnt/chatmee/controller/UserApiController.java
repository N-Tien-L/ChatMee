package com.lnt.chatmee.controller;

import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.PagedResponse;
import com.lnt.chatmee.dto.response.UserSummaryResponse;
import com.lnt.chatmee.service.UserService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserApiController {

    private final UserService userService;

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<UserSummaryResponse>>> searchUsers(
            @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal OAuth2User principal) {
        String currentUserId = userService.getCurrentUserId(principal);
        Page<UserSummaryResponse> usersPage = userService.searchUsers(query, currentUserId, page, size);

        PagedResponse<UserSummaryResponse> pageData = PagedResponse.<UserSummaryResponse>builder()
            .content(usersPage.getContent())
            .page(usersPage.getNumber())
            .size(usersPage.getSize())
            .totalElements(usersPage.getTotalElements())
            .totalPages(usersPage.getTotalPages())
            .build();

        return ResponseEntity.ok(ApiResponse.success("Users retrieved successfully", pageData));
    }

    @GetMapping("/{userId}")
    public ResponseEntity<ApiResponse<UserSummaryResponse>> getUserById(@PathVariable String userId) {
        UserSummaryResponse userResponse = userService.getUserSummary(userId);
        return ResponseEntity.ok(ApiResponse.success("User found", userResponse));
    }
}
