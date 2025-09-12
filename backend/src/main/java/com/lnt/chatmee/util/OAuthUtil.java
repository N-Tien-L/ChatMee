package com.lnt.chatmee.util;

import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Component;

@Component
public class OAuthUtil {
    
    public String determineProvider(OAuth2User principal) {
        if (principal.getAttribute("sub") != null) {
            return "google";
        } else if (principal.getAttribute("login") != null) {
            return "github";
        }
        return "unknown";
    }

    public String getProviderId(OAuth2User principal, String provider) {
        if ("google".equals(provider)) {
            return principal.getAttribute("sub");
        } else if ("github".equals(provider)) {
            Object id = principal.getAttribute("id");
            return id != null ? id.toString() : null;
        }
        return null;
    }
}
