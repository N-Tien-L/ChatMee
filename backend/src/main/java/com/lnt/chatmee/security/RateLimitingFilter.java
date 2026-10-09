package com.lnt.chatmee.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lnt.chatmee.exception.GlobalExceptionHandler;
import com.lnt.chatmee.exception.ErrorCode;

import com.lnt.chatmee.service.RateLimitingService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class RateLimitingFilter extends OncePerRequestFilter {

    static final String LIMIT_HEADER = "X-RateLimit-Limit";
    static final String REMAINING_HEADER = "X-RateLimit-Remaining";

    private final ObjectMapper objectMapper;
    private final RateLimitingService rateLimitingService;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        boolean isAuthenticated = authentication != null && authentication.isAuthenticated() && !"anonymousUser".equals(authentication.getPrincipal());

        // The remote address is never taken from X-Forwarded-For here: clients can forge that header.
        // Behind a proxy, server.forward-headers-strategy lets Tomcat resolve it from trusted proxies only.
        String key = isAuthenticated ? "user:" + authentication.getName() : "ip:" + request.getRemoteAddr();

        RateLimitingService.Decision decision = rateLimitingService.check(key, isAuthenticated);
        response.setHeader(LIMIT_HEADER, String.valueOf(decision.limit()));
        response.setHeader(REMAINING_HEADER, String.valueOf(decision.remaining()));

        if (!decision.allowed()) {
            response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(decision.retryAfterSeconds()));
            GlobalExceptionHandler.writeProblem(objectMapper, request, response,
                    ErrorCode.RATE_LIMITED, "Too many requests");
            return;
        }

        filterChain.doFilter(request, response);
    }
}
