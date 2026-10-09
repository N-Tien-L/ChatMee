package com.lnt.chatmee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import com.lnt.chatmee.security.CurrentUser;
import com.lnt.chatmee.security.UserPrincipal;
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
@Tag(name = "Users", description = "User search without private fields")
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserApiController {

    private final UserService userService;

    @Operation(summary = "Search users by name (paged, excludes the caller, no emails)")
    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<UserSummaryResponse>>> searchUsers(
            @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @CurrentUser UserPrincipal user) {
        String currentUserId = user.userId();
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

    @Operation(summary = "Get a user summary by id")
    @GetMapping("/{userId}")
    public ResponseEntity<ApiResponse<UserSummaryResponse>> getUserById(@PathVariable String userId) {
        UserSummaryResponse userResponse = userService.getUserSummary(userId);
        return ResponseEntity.ok(ApiResponse.success("User found", userResponse));
    }
}
