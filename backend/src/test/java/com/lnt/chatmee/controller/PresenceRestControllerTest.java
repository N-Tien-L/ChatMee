package com.lnt.chatmee.controller;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

class PresenceRestControllerTest {
    @Test
    void mappings_offlinePostRemoved_keepsOnlineUsersGet() throws Exception {
        for (var method : PresenceRestController.class.getDeclaredMethods()) {
            var info = AnnotatedElementUtils.findMergedAnnotation(method, RequestMapping.class);
            if (info != null) {
                assertTrue(info.method().length > 0, "Mappings must declare their HTTP method");
                assertFalse(Arrays.asList(info.method()).contains(RequestMethod.POST));
            }
        }
        assertArrayEquals(new String[]{"/api/v1"}, PresenceRestController.class.getAnnotation(RequestMapping.class).value());
        assertArrayEquals(new String[]{"/online-users"}, PresenceRestController.class
                .getDeclaredMethod("getOnlineUsers").getAnnotation(GetMapping.class).value());
    }
}
