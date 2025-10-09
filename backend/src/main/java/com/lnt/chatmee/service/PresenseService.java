package com.lnt.chatmee.service;

import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

@Service
public class PresenseService {
    
    private final Set<String> onlineUsers = ConcurrentHashMap.newKeySet();

    public void userConnected(String userId) {
        onlineUsers.add(userId);
    }

    public void userDisconnected(String userId) {
        onlineUsers.remove(userId);
    }

    public Set<String> getOnlineUsers() {
        return Collections.unmodifiableSet(onlineUsers);
    }

    public boolean isUserOnline(String userId) {
        return onlineUsers.contains(userId);
    }
}
