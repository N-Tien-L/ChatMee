package com.lnt.chatmee.config;

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

import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

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
                .csrf(csrf -> csrf
                        // SockJS transports are cross-site and authenticated by the single-use STOMP token, not cookies.
                        .ignoringRequestMatchers("/ws/**")
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler()))
                .addFilterAfter(new CsrfCookieFilter(), org.springframework.security.web.csrf.CsrfFilter.class)
                .addFilterBefore(rateLimitingFilter, UsernamePasswordAuthenticationFilter.class)
                .authorizeHttpRequests(authz -> authz
                        // Cross-site SockJS handshakes are public; STOMP CONNECT authenticates with a single-use token.
                        .requestMatchers("/", "/login", "/error", "/actuator/health/**", "/actuator/info", "/api/v1/auth/status", "/ws/**").permitAll()
                        .requestMatchers("/api/v1/**").authenticated()
                        .anyRequest().authenticated())

                .oauth2Login(oauth2 -> oauth2
                        .userInfoEndpoint(userInfo -> userInfo
                                .userService(customOAuth2UserService))
                        .successHandler(successHandler)
                        .failureUrl(clientUrl + "/login?error=true"))
                .logout(logout -> logout
                        .logoutSuccessUrl(clientUrl)
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies("JSESSIONID"));

        return http.build();
    }
}
