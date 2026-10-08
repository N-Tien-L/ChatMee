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
        logger.debug("=== OAuth2 Login ===");
        logger.debug("Provider: {}", provider);
        
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
                break;

            case "github":
                Object githubId = oAuth2User.getAttribute("id");
                providerId = githubId != null ? githubId.toString() : null;
                email = oAuth2User.getAttribute("email"); 
                name = oAuth2User.getAttribute("login");
                avatarUrl = oAuth2User.getAttribute("avatar_url");
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
                        .id(UUID.randomUUID().toString())
                        .provider(provider)
                        .providerId(providerId)
                        .email(email)
                        .name(name)
                        .avatarUrl(avatarUrl)
                        .build();
                });

        User savedUser = userRepository.save(user);
        logger.debug("User logged in successfully with ID: {}", savedUser.getId());

        return oAuth2User;
    }
}
