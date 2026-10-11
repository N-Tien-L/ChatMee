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
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class RateLimitingFilter extends OncePerRequestFilter {

    static final String LIMIT_HEADER = "X-RateLimit-Limit";
    static final String REMAINING_HEADER = "X-RateLimit-Remaining";

    // Behind the Vercel rewrite every anonymous visitor reaches us from the proxy's address, so one shared
    // anonymous bucket would let 20 requests per minute lock everyone out of the login flow. These paths are
    // cheap and needed before login (or by health probes), so they are not counted.
    private static final List<String> EXEMPT_PATHS = List.of(
            "/actuator/health", "/actuator/health/**",
            "/oauth2/authorization/**", "/login/oauth2/code/**");
    private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();

    private final ObjectMapper objectMapper;
    private final RateLimitingService rateLimitingService;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return EXEMPT_PATHS.stream().anyMatch(pattern -> PATH_MATCHER.match(pattern, path));
    }

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
