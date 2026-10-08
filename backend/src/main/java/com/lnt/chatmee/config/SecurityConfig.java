package com.lnt.chatmee.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lnt.chatmee.exception.GlobalExceptionHandler;
import com.lnt.chatmee.exception.ErrorCode;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.web.util.matcher.AnyRequestMatcher;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

import com.lnt.chatmee.security.RateLimitingFilter;
import com.lnt.chatmee.service.CustomOAuth2UserService;

import lombok.RequiredArgsConstructor;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final ObjectMapper objectMapper;
    private final CustomOAuth2UserService customOAuth2UserService;
    private final CorsConfigurationSource corsConfigurationSource;
    private final OAuth2AuthenticationSuccessHandler successHandler;
    private final RateLimitingFilter rateLimitingFilter;

    @Value("${app.client.url}")
    private String clientUrl;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf.disable())
                .addFilterBefore(rateLimitingFilter, UsernamePasswordAuthenticationFilter.class)
                .authorizeHttpRequests(authz -> authz
                        // Cross-site SockJS handshakes are public; STOMP CONNECT authenticates with a single-use token.
                        .requestMatchers("/", "/login", "/error", "/actuator/health/**", "/actuator/info", "/api/v1/auth/status", "/ws/**").permitAll()
                        .requestMatchers("/api/v1/**").authenticated()
                        .anyRequest().authenticated())

                .exceptionHandling(errors -> errors
                        .defaultAuthenticationEntryPointFor((request, response, exception) ->
                                GlobalExceptionHandler.writeProblem(objectMapper, request, response,
                                        ErrorCode.UNAUTHENTICATED, "Authentication required"),
                                new AntPathRequestMatcher("/api/**"))
                        .defaultAuthenticationEntryPointFor(
                                new LoginUrlAuthenticationEntryPoint("/login"),
                                AnyRequestMatcher.INSTANCE)
                        .defaultAccessDeniedHandlerFor((request, response, exception) ->
                                GlobalExceptionHandler.writeProblem(objectMapper, request, response,
                                        ErrorCode.FORBIDDEN_ACTION, "Access denied"),
                                new AntPathRequestMatcher("/api/**")))
                .oauth2Login(oauth2 -> oauth2
                        .userInfoEndpoint(userInfo -> userInfo
                                .userService(customOAuth2UserService))
                        .successHandler(successHandler)
                        .failureUrl(clientUrl + "/login?error=true"))
                .logout(logout -> logout
                        .logoutSuccessUrl(clientUrl)
                        .invalidateHttpSession(true)
                        .clearAuthentication(true));

        return http.build();
    }
}
