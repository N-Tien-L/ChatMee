package com.lnt.chatmee.service;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    private static final Logger logger = LoggerFactory.getLogger(CustomOAuth2UserService.class);
    private final UserRepository userRepository;

    @Override
    public OAuth2User loadUser(OAuth2UserRequest userRequest) {
        OAuth2User oAuth2User = super.loadUser(userRequest);
        
        String provider = userRequest.getClientRegistration().getRegistrationId();
        logger.info("=== OAuth2 Login Debug Info ===");
        logger.info("Provider: {}", provider);
        logger.info("OAuth2User Attributes: {}", oAuth2User.getAttributes());
        logger.info("OAuth2User Authorities: {}", oAuth2User.getAuthorities());
        
        String providerId;
        String email;
        String name;
        String avatarUrl;

        switch (provider) {
            case "google":
                providerId = oAuth2User.getAttribute("sub");
                email = oAuth2User.getAttribute("email");
                name = oAuth2User.getAttribute("name");
                avatarUrl = oAuth2User.getAttribute("picture");
                logger.info("Google OAuth - ProviderId: {}, Email: {}, Name: {}", providerId, email, name);
                break;

            case "github":
                Object githubId = oAuth2User.getAttribute("id");
                providerId = githubId != null ? githubId.toString() : null;
                email = oAuth2User.getAttribute("email"); 
                name = oAuth2User.getAttribute("login");
                avatarUrl = oAuth2User.getAttribute("avatar_url");
                logger.info("GitHub OAuth - Raw ID: {} (type: {}), ProviderId: {}, Email: {}, Name: {}", 
                           githubId, githubId != null ? githubId.getClass().getSimpleName() : "null", 
                           providerId, email, name);
                break;

            default:
                logger.error("Unsupported provider: {}", provider);
                throw new IllegalArgumentException("Unsupported provider: " + provider);
        }

        User user = userRepository
                .findByProviderAndProviderId(provider, providerId)
                .orElseGet(() -> {
                    logger.info("Creating new user for provider: {} with providerId: {}", provider, providerId);
                    return User.builder()
                            .id(UUID.randomUUID())
                            .provider(provider)
                            .providerId(providerId)
                            .email(email)
                            .name(name)
                            .avatarUrl(avatarUrl)
                            .build();
                });

        logger.info("User object before save: {}", user);
        logger.info("User ID: {}, Provider: {}, ProviderId: {}, Email: {}, Name: {}", 
                   user.getId(), user.getProvider(), user.getProviderId(), user.getEmail(), user.getName());

        User savedUser = userRepository.save(user);
        logger.info("User saved successfully with ID: {}", savedUser.getId());
        logger.info("=== End OAuth2 Login Debug Info ===");

        return oAuth2User;
    }
}
