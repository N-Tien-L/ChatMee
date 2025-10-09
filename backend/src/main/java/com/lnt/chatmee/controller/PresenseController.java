package com.lnt.chatmee.controller;

import java.util.Set;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.lnt.chatmee.service.PresenseService;

@RestController
@RequestMapping("/api/v1")
public class PresenseController {
    
    private final PresenseService PresenseService;

    public PresenseController(PresenseService PresenseService) {
        this.PresenseService = PresenseService;
    }

    @GetMapping("/online-users")
    public Set<String> getOnlineUsers() {
        return PresenseService.getOnlineUsers();
    }
}
