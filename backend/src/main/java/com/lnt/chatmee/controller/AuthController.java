package com.lnt.chatmee.controller;

import java.security.Principal;
import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class AuthController {

    private final UserRepository userRepository;

    @GetMapping("/")
    public String home() {
        return "index";
    }

    @GetMapping("/login")
    public String login() {
        return "login";
    }

    @GetMapping("/dashboard")
    public String dashboard(Model model, @AuthenticationPrincipal OAuth2User principal) {
        if (principal != null) {
            // Get provider info from OAuth2User
            String provider = determineProvider(principal);
            String providerId = getProviderId(principal, provider);
            
            // Find user in YOUR database
            User user = userRepository.findByProviderAndProviderId(provider, providerId)
                .orElse(null);
            
            if (user != null) {
                // Use data from YOUR database
                model.addAttribute("user", user);
                model.addAttribute("name", user.getName());
                model.addAttribute("email", user.getEmail());
                model.addAttribute("picture", user.getAvatarUrl());
                model.addAttribute("provider", user.getProvider());
                model.addAttribute("userId", user.getId());
            } else {
                // Fallback to OAuth2 data if user not found in DB
                model.addAttribute("name", principal.getAttribute("name"));
                model.addAttribute("email", principal.getAttribute("email"));
                model.addAttribute("picture", principal.getAttribute("picture"));
                model.addAttribute("error", "User not found in database");
            }
        }
        return "dashboard";
    }
    
    private String determineProvider(OAuth2User principal) {
        // Simple way to determine provider based on attributes
        if (principal.getAttribute("sub") != null) {
            return "google";
        } else if (principal.getAttribute("login") != null) {
            return "github";
        }
        return "unknown";
    }
    
    private String getProviderId(OAuth2User principal, String provider) {
        if ("google".equals(provider)) {
            return principal.getAttribute("sub");
        } else if ("github".equals(provider)) {
            Object id = principal.getAttribute("id");
            return id != null ? id.toString() : null;
        }
        return null;
    }

    @GetMapping("/user")
    @ResponseBody
    public OAuth2User user(@AuthenticationPrincipal OAuth2User principal) {
        return principal; // This returns OAuth2 provider data
    }
    
    @GetMapping("/api/user")
    @ResponseBody
    public User getCurrentUser(@AuthenticationPrincipal OAuth2User principal) {
        if (principal != null) {
            String provider = determineProvider(principal);
            String providerId = getProviderId(principal, provider);
            
            return userRepository.findByProviderAndProviderId(provider, providerId)
                .orElse(null); // This returns YOUR database user
        }
        return null;
    }

    @GetMapping("/profile")
    @ResponseBody
    public String profile(Principal principal) {
        return "Hello, " + principal.getName();
    }

    @GetMapping("/api/users")
    @ResponseBody
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }
}
