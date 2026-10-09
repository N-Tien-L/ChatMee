package com.lnt.chatmee.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Shared session registry; local sessions are retained only for outage recovery. */
@Service
@EnableScheduling
public class PresenceService {
    private static final Logger log = LoggerFactory.getLogger(PresenceService.class);
    @SuppressWarnings("rawtypes")
    private static final DefaultRedisScript<List> REGISTRY = new DefaultRedisScript<>();
    static {
        REGISTRY.setLocation(new ClassPathResource("presence-registry.lua"));
        REGISTRY.setResultType(List.class);
    }
    private final StringRedisTemplate redis;
    private final String instanceId;
    private final String prefix;
    private final long instanceTtlMs;
    private final long graceMs;
    private final Map<String, Set<String>> localSessions = new HashMap<>();

    public PresenceService(StringRedisTemplate redis,
            @Value("${presence.instance-id:}") String instanceId,
            @Value("${presence.registry-prefix:presence:{registry}:}") String prefix,
            @Value("${presence.instance-ttl-ms:30000}") long instanceTtlMs,
            @Value("${presence.grace-ms:10000}") long graceMs) {
        this.redis = redis;
        this.instanceId = instanceId.isBlank() ? UUID.randomUUID().toString() : instanceId;
        this.prefix = prefix;
        this.instanceTtlMs = instanceTtlMs;
        this.graceMs = graceMs;
    }

    public synchronized void userConnected(String userId, String sessionId) {
        if (userId == null || userId.isBlank() || sessionId == null || sessionId.isBlank()) return;
        localSessions.computeIfAbsent(userId, ignored -> new HashSet<>()).add(sessionId);
        execute("add", userId, sessionId);
    }

    public synchronized void userDisconnected(String userId, String sessionId) {
        Set<String> sessions = localSessions.get(userId);
        if (sessions != null) {
            sessions.remove(sessionId);
            if (sessions.isEmpty()) localSessions.remove(userId);
        }
        // Still remove from Redis on duplicate events / recovery; HDEL is idempotent.
        if (userId != null && sessionId != null) execute("remove", userId, sessionId);
    }

    /** A client cannot create sessions or change online state through this heartbeat. */
    public synchronized void heartbeat(String userId, String sessionId) {
        Set<String> sessions = localSessions.get(userId);
        if (sessions != null && sessions.contains(sessionId)) refresh();
    }

    @Scheduled(fixedDelayString = "${presence.refresh-ms:10000}")
    public synchronized void refresh() {
        List<String> sessions = new ArrayList<>();
        localSessions.forEach((user, ids) -> ids.forEach(id -> {
            sessions.add(user);
            sessions.add(id);
        }));
        execute("refresh", sessions.toArray(String[]::new));
    }

    @Scheduled(fixedDelayString = "${presence.sweep-ms:1000}")
    public synchronized void sweep() {
        execute("sweep");
    }

    public synchronized Set<String> getOnlineUsers() {
        return execute("read");
    }

    public boolean isUserOnline(String userId) {
        return getOnlineUsers().contains(userId);
    }

    private Set<String> execute(String operation, String... arguments) {
        List<String> args = new ArrayList<>(List.of(prefix, operation, instanceId,
                Long.toString(instanceTtlMs), Long.toString(graceMs)));
        args.addAll(List.of(arguments));
        try {
            List<?> users = redis.execute(REGISTRY, List.of(prefix + "online", prefix + "pending"),
                    args.toArray());
            if (users != null) {
                Set<String> result = new HashSet<>();
                users.forEach(user -> result.add((String) user));
                return Set.copyOf(result);
            }
        } catch (DataAccessException ex) {
            log.warn("Presence registry unavailable: {}", ex.getClass().getSimpleName());
        }
        // Fail open: never reject STOMP / REST because presence storage is unavailable.
        return Set.copyOf(localSessions.keySet());
    }
}
