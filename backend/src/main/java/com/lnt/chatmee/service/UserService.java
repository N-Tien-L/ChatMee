package com.lnt.chatmee.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.dto.response.UserSummaryResponse;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class UserService {

    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 50;

    private final UserRepository userRepository;

    /** Page is clamped to >= 0 and size to 1..MAX_PAGE_SIZE (non-positive size falls back to the default). */
    public Page<UserSummaryResponse> searchUsers(String query, String currentUserId, int page, int size) {
        String searchQuery = query == null ? "" : query.trim();
        int pageSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        Pageable pageable = PageRequest.of(Math.max(page, 0), pageSize);
        return userRepository.findByNameContainingIgnoreCaseAndIdNot(searchQuery, currentUserId, pageable)
                .map(UserService::toSummary);
    }

    public UserSummaryResponse getUserSummary(String userId) {
        return userRepository.findById(userId)
                .map(UserService::toSummary)
                .orElseThrow(() -> new UserNotFoundException("User not found"));
    }

    private static UserSummaryResponse toSummary(User user) {
        return UserSummaryResponse.builder()
                .id(user.getId())
                .name(user.getName())
                .avatarUrl(user.getAvatarUrl())
                .build();
    }
}
