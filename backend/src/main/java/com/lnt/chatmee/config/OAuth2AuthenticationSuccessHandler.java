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
        log.info("Setting session cookie. Session ID: {}", sessionId);
        log.info("Client URL: {}", clientUrl);
        
        // The session cookie should be automatically set by Spring
        // Just ensure proper CORS headers are set
        response.setHeader("Access-Control-Allow-Credentials", "true");
        response.setHeader("Access-Control-Allow-Origin", clientUrl);
        
        // Redirect to frontend dashboard
        String redirectUrl = clientUrl + "/dashboard";
        log.info("Redirecting to: {}", redirectUrl);
        log.info("=== End OAuth2 Success Handler ===");
        
        getRedirectStrategy().sendRedirect(request, response, redirectUrl);
    }
}
