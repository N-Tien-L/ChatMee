package com.lnt.chatmee.security;

import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionIdListener;
import jakarta.servlet.http.HttpSessionListener;
import java.io.IOException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageHandler;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.ExecutorChannelInterceptor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;

/** Current HTTP-session ownership on the existing single backend process. Never logs binding IDs. */
@Component
public class WsSessionRegistry implements HttpSessionListener, HttpSessionIdListener, ExecutorChannelInterceptor {
    private static final Logger log = LoggerFactory.getLogger(WsSessionRegistry.class);
    private static final long TOKEN_TTL_MS = 60_000;
    private record Pending(String userId, String httpId, long expiresAt) {}
    private record Connected(String userId, String httpId) {}
    private record SessionState(HttpSession session, Set<String> tokens, Set<String> sockets) {}
    private final StringRedisTemplate redis;
    private final Clock clock;
    private final Map<String, SessionState> sessions = new HashMap<>();
    private final Map<String, Pending> pending = new HashMap<>();
    private final Map<String, Connected> connected = new HashMap<>();
    private final Map<String, WebSocketSession> transports = new HashMap<>();
    // Prevent an issue/CONNECT racing the servlet's pre-invalidation callback from recreating a binding.
    private final Map<String, Long> revoked = new HashMap<>();

    @Autowired
    public WsSessionRegistry(StringRedisTemplate redis) { this(redis, Clock.systemUTC()); }
    WsSessionRegistry(StringRedisTemplate redis, Clock clock) { this.redis = redis; this.clock = clock; }

    public synchronized void registerToken(String token, String userId, HttpSession session) {
        String id;
        try { id = session.getId(); }
        catch (IllegalStateException invalid) { throw rejected(); }
        if (revoked.containsKey(id) || !valid(session, id)) throw rejected();
        SessionState state = sessions.computeIfAbsent(id, ignored -> new SessionState(session, new HashSet<>(), new HashSet<>()));
        pending.put(token, new Pending(userId, id, clock.millis() + TOKEN_TTL_MS));
        state.tokens().add(token);
    }

    public synchronized void bindToken(String token, String userId, String socketId) {
        Pending grant = pending.remove(token);
        if (grant == null) throw rejected();
        SessionState state = sessions.get(grant.httpId());
        if (state != null) state.tokens().remove(token);
        if (state == null || !grant.userId().equals(userId) || clock.millis() >= grant.expiresAt()
                || revoked.containsKey(grant.httpId()) || !valid(state.session(), grant.httpId())
                || socketId == null || !transports.containsKey(socketId)) {
            prune(grant.httpId());
            throw rejected();
        }
        connected.put(socketId, new Connected(userId, grant.httpId()));
        state.sockets().add(socketId);
    }

    public synchronized String userForSocket(String socketId) {
        Connected binding = connected.get(socketId);
        if (binding == null) return null;
        SessionState state = sessions.get(binding.httpId());
        return state != null && !revoked.containsKey(binding.httpId()) && valid(state.session(), binding.httpId())
                ? binding.userId() : null;
    }

    public void requireSocket(String socketId) {
        if (userForSocket(socketId) == null) throw rejected();
    }

    @Override
    public Message<?> beforeHandle(Message<?> message, MessageChannel channel, MessageHandler handler) {
        if (SimpMessageHeaderAccessor.getMessageType(message.getHeaders()) != SimpMessageType.MESSAGE) return message;
        return userForSocket(SimpMessageHeaderAccessor.getSessionId(message.getHeaders())) == null ? null : message;
    }

    public WebSocketHandler decorate(WebSocketHandler delegate) {
        return new WebSocketHandlerDecorator(delegate) {
            @Override public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                opened(session);
                boolean established = false;
                try { super.afterConnectionEstablished(session); established = true; }
                finally { if (!established) closed(session.getId()); }
            }
            @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
                closed(session.getId());
                super.afterConnectionClosed(session, status);
            }
        };
    }

    synchronized void opened(WebSocketSession session) { transports.put(session.getId(), session); }
    synchronized void closed(String socketId) {
        transports.remove(socketId);
        Connected binding = connected.remove(socketId);
        if (binding != null) {
            SessionState state = sessions.get(binding.httpId());
            if (state != null) state.sockets().remove(socketId);
            prune(binding.httpId());
        }
    }

    @Override public void sessionDestroyed(HttpSessionEvent event) { revoke(event.getSession().getId()); }
    @Override public void sessionIdChanged(HttpSessionEvent event, String oldId) { revoke(oldId); }

    @Scheduled(fixedDelay = 1000)
    public void sweep() {
        List<String> expired;
        synchronized (this) {
            long now = clock.millis();
            revoked.entrySet().removeIf(entry -> entry.getValue() <= now);
            List<String> expiredTokens = pending.entrySet().stream().filter(entry -> entry.getValue().expiresAt() <= now)
                    .map(Map.Entry::getKey).toList();
            for (String token : expiredTokens) {
                Pending grant = pending.remove(token);
                SessionState state = sessions.get(grant.httpId());
                if (state != null) state.tokens().remove(token);
                prune(grant.httpId());
            }
            expired = sessions.entrySet().stream().filter(entry -> !valid(entry.getValue().session(), entry.getKey()))
                    .map(Map.Entry::getKey).toList();
        }
        expired.forEach(this::revoke);
    }

    private void revoke(String httpId) {
        List<WebSocketSession> closing = new ArrayList<>();
        List<String> tokenKeys = new ArrayList<>();
        synchronized (this) {
            revoked.put(httpId, clock.millis() + TOKEN_TTL_MS);
            SessionState state = sessions.remove(httpId);
            if (state == null) return;
            for (String token : state.tokens()) { pending.remove(token); tokenKeys.add("ws-token:" + token); }
            for (String id : state.sockets()) {
                connected.remove(id);
                WebSocketSession transport = transports.remove(id);
                if (transport != null) closing.add(transport);
            }
        }
        // Outside the monitor: transport close callbacks may run on another thread.
        for (WebSocketSession socket : closing) {
            try { if (socket.isOpen()) socket.close(CloseStatus.POLICY_VIOLATION); }
            catch (IOException failure) { log.warn("Session transport close failed: {}", failure.getClass().getSimpleName()); }
        }
        if (!tokenKeys.isEmpty()) {
            try { redis.delete(tokenKeys); }
            catch (DataAccessException unavailable) {
                // Local bindings are already revoked; Redis keys also expire in at most 60 seconds.
                log.warn("Revoked token cleanup unavailable: {}", unavailable.getClass().getSimpleName());
            }
        }
    }

    private boolean valid(HttpSession session, String id) {
        try {
            session.getCreationTime(); // Throws on an invalidated servlet session; does not refresh access time.
            int seconds = session.getMaxInactiveInterval();
            return id.equals(session.getId()) && (seconds <= 0 || clock.millis() - session.getLastAccessedTime() < seconds * 1000L);
        } catch (IllegalStateException invalid) { return false; }
    }
    private void prune(String httpId) {
        SessionState state = sessions.get(httpId);
        if (state != null && state.tokens().isEmpty() && state.sockets().isEmpty()) sessions.remove(httpId);
    }
    private static BadCredentialsException rejected() { return new BadCredentialsException("WebSocket session ended"); }
}
