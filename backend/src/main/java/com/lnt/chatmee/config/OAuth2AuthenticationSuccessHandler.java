package com.lnt.chatmee.config;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

@Component
public class OAuth2AuthenticationSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    @Value("${app.client.url}")
    private String clientUrl;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException, ServletException {
        
        // Ensure session is created
        HttpSession session = request.getSession(true);
        
        // Explicitly set the JSESSIONID cookie with proper attributes
        Cookie sessionCookie = new Cookie("JSESSIONID", session.getId());
        sessionCookie.setPath("/");
        sessionCookie.setHttpOnly(true);
        sessionCookie.setSecure(true); // Required for SameSite=None
        sessionCookie.setMaxAge(60 * 60 * 24); // 24 hours
        sessionCookie.setAttribute("SameSite", "None");
        
        response.addCookie(sessionCookie);
        
        // Redirect to frontend dashboard
        getRedirectStrategy().sendRedirect(request, response, clientUrl + "/dashboard");
    }
}
