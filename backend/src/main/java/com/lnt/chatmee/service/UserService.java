package com.lnt.chatmee.service;

import java.util.HashSet;
import java.util.Set;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.dto.response.UserSummaryResponse;
import com.lnt.chatmee.dto.response.UserResponse;
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
    private final BlockService blockService;

    public UserResponse getUserProfile(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("User not found in database"));
        return UserResponse.from(user);
    }

    /**
     * Page is clamped to >= 0 and size to 1..MAX_PAGE_SIZE (non-positive size falls back to the default).
     * Users blocked in either direction are left out (AC-009-17).
     */
    public Page<UserSummaryResponse> searchUsers(String query, String currentUserId, int page, int size) {
        String searchQuery = query == null ? "" : query.trim();
        int pageSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        Pageable pageable = PageRequest.of(Math.max(page, 0), pageSize);
        Set<String> blocked = blockService.blockedEitherWay(currentUserId);
        if (blocked.isEmpty()) {
            return userRepository.findByNameContainingIgnoreCaseAndIdNot(searchQuery, currentUserId, pageable)
                    .map(UserService::toSummary);
        }
        Set<String> excluded = new HashSet<>(blocked);
        excluded.add(currentUserId);
        return userRepository.findByNameContainingIgnoreCaseAndIdNotIn(searchQuery, excluded, pageable)
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
