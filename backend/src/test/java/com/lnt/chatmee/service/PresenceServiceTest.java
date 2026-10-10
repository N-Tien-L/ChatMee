package com.lnt.chatmee.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class PresenceServiceTest {

    private PresenceService presenceService;

    @BeforeEach
    void setUp() {
        presenceService = new PresenceService();
    }

    @Test
    void userConnected_addsUserToOnlineSet() {
        presenceService.userConnected("user1");

        assertThat(presenceService.isUserOnline("user1")).isTrue();
        assertThat(presenceService.getOnlineUsers()).containsExactly("user1");
    }

    @Test
    void userDisconnected_removesUserFromOnlineSet() {
        presenceService.userConnected("user1");
        presenceService.userDisconnected("user1");

        assertThat(presenceService.isUserOnline("user1")).isFalse();
        assertThat(presenceService.getOnlineUsers()).isEmpty();
    }

    @Test
    void getOnlineUsers_returnsUnmodifiableSet() {
        presenceService.userConnected("user1");
        Set<String> onlineUsers = presenceService.getOnlineUsers();
        
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> onlineUsers.add("user2"))
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
