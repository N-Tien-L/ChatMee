package com.lnt.chatmee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Set;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.service.PresenceVisibilityService;
import com.lnt.chatmee.security.CurrentUser;
import com.lnt.chatmee.security.UserPrincipal;

import lombok.RequiredArgsConstructor;

@RestController
@Tag(name = "Presence", description = "Online presence")
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class PresenceRestController {
    private final PresenceVisibilityService presenceVisibility;

    @Operation(summary = "List online ids visible through shared active rooms")
    @GetMapping("/online-users")
    public Set<String> getOnlineUsers(@CurrentUser UserPrincipal user) {
        return presenceVisibility.onlineFor(user.userId());
    }
}
