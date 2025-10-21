package com.lnt.chatmee.config;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class OAuth2AuthenticationSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    @Value("${app.client.url}")
    private String clientUrl;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException, ServletException {
        
        // Ensure session is created
        HttpSession session = request.getSession(true);
        
        // Get the session ID
        String sessionId = session.getId();
        
        // Log for debugging
        log.info("=== OAuth2 Success Handler ===");
        log.info("Session ID: {}", sessionId);
        log.info("Authenticated User: {}", authentication.getName());
        log.info("Redirecting to: {}/dashboard", clientUrl);
        
        // Simple redirect to dashboard
        // Since we're using Vercel proxy, this will be same-origin
        getRedirectStrategy().sendRedirect(request, response, clientUrl + "/dashboard");
    }
}
