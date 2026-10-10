package com.lnt.chatmee.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import com.lnt.chatmee.dto.response.UserSummaryResponse;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;


    @InjectMocks
    private UserService userService;

    @Test
    void searchUsers_matchingUsers_mapsToSummaryWithoutEmail() {
        User user = User.builder().id("1").name("Test User").avatarUrl("avatar").email("test@example.com").build();
        when(userRepository.findByNameContainingIgnoreCaseAndIdNot(eq("test"), eq("2"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(user)));

        Page<UserSummaryResponse> result = userService.searchUsers("test", "2", 0, 20);

        assertEquals(1, result.getContent().size());
        UserSummaryResponse summary = result.getContent().get(0);
        assertEquals("1", summary.id());
        assertEquals("Test User", summary.name());
        assertEquals("avatar", summary.avatarUrl());
        assertThrows(NoSuchMethodException.class, () -> UserSummaryResponse.class.getMethod("email"));
    }

    @Test
    void searchUsers_anyQuery_excludesCaller() {
        when(userRepository.findByNameContainingIgnoreCaseAndIdNot(any(), any(), any(Pageable.class)))
                .thenReturn(Page.empty());

        userService.searchUsers("alice", "caller-id", 0, 20);

        verify(userRepository).findByNameContainingIgnoreCaseAndIdNot("alice", "caller-id", PageRequest.of(0, 20));
    }

    @Test
    void searchUsers_blankOrNullQuery_searchesWithEmptyString() {
        when(userRepository.findByNameContainingIgnoreCaseAndIdNot(any(), any(), any(Pageable.class)))
                .thenReturn(Page.empty());

        userService.searchUsers("   ", "1", 0, 20);
        userService.searchUsers(null, "1", 0, 20);

        verify(userRepository, times(2)).findByNameContainingIgnoreCaseAndIdNot("", "1", PageRequest.of(0, 20));
    }

    @Test
    void searchUsers_oversizedOrInvalidPaging_clampsPageAndSize() {
        when(userRepository.findByNameContainingIgnoreCaseAndIdNot(any(), any(), any(Pageable.class)))
                .thenReturn(Page.empty());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        userService.searchUsers("a", "1", 3, 500);
        userService.searchUsers("a", "1", -2, 0);

        verify(userRepository, times(2)).findByNameContainingIgnoreCaseAndIdNot(eq("a"), eq("1"), pageable.capture());
        assertEquals(PageRequest.of(3, UserService.MAX_PAGE_SIZE), pageable.getAllValues().get(0));
        assertEquals(PageRequest.of(0, UserService.DEFAULT_PAGE_SIZE), pageable.getAllValues().get(1));
    }

    @Test
    void searchUsers_regexCharacters_passedVerbatimToDerivedQuery() {
        when(userRepository.findByNameContainingIgnoreCaseAndIdNot(any(), any(), any(Pageable.class)))
                .thenReturn(Page.empty());

        assertDoesNotThrow(() -> userService.searchUsers(".*", "1", 0, 20));
        verify(userRepository).findByNameContainingIgnoreCaseAndIdNot(".*", "1", PageRequest.of(0, 20));
    }

    @Test
    void getUserSummary_existingUser_returnsSummary() {
        User user = User.builder().id("1").name("Test User").avatarUrl("avatar").build();
        when(userRepository.findById("1")).thenReturn(Optional.of(user));

        UserSummaryResponse result = userService.getUserSummary("1");

        assertEquals(new UserSummaryResponse("1", "Test User", "avatar"), result);
    }

    @Test
    void getUserSummary_missingUser_throwsUserNotFound() {
        when(userRepository.findById("1")).thenReturn(Optional.empty());

        assertThrows(UserNotFoundException.class, () -> userService.getUserSummary("1"));
    }

    @Test
    void getUserProfile_knownUser_returnsUserId() {
        when(userRepository.findById("u-1")).thenReturn(Optional.of(User.builder().id("u-1").build()));
        assertEquals("u-1", userService.getUserProfile("u-1").id());
    }
    @Test
    void getUserProfile_unknownUser_throwsUserNotFound() {
        when(userRepository.findById("missing")).thenReturn(Optional.empty());
        assertThrows(UserNotFoundException.class, () -> userService.getUserProfile("missing"));
    }
    @Test
    void getUserProfile_nullId_throwsUserNotFound() {
        assertThrows(UserNotFoundException.class, () -> userService.getUserProfile(null));
    }
}
