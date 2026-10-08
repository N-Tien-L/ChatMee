package com.lnt.chatmee.controller;

import java.util.Set;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.service.PresenceService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class PresenceRestController {
    private final PresenceService presenceService;

    @GetMapping("/online-users")
    public Set<String> getOnlineUsers() {
        return presenceService.getOnlineUsers();
    }
}
