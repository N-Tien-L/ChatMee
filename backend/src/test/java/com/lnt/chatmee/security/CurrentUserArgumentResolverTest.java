package com.lnt.chatmee.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.MethodParameter;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import com.lnt.chatmee.config.SecurityConfig;
import com.lnt.chatmee.exception.GlobalExceptionHandler;
import com.lnt.chatmee.support.SecuredWebMvcTestSupport;
import com.lnt.chatmee.support.TestUsers;

@WebMvcTest(properties = "app.client.url=http://localhost:3000")
@ContextConfiguration(classes = {CurrentUserArgumentResolverTest.Endpoint.class, GlobalExceptionHandler.class})
@Import(SecurityConfig.class)
@ActiveProfiles("actuator-test")
class CurrentUserArgumentResolverTest extends SecuredWebMvcTestSupport {
    @RestController
    static class Endpoint {
        @GetMapping("/api/test/current-user")
        public String current(@CurrentUser UserPrincipal user) { return user.userId(); }
    }
    @AfterEach void clearContext() { SecurityContextHolder.clearContext(); }
    @Test void resolveArgument_userPrincipal_returnsInternalId() throws Exception {
        mvc.perform(get("/api/test/current-user").with(oauth2Login().oauth2User(TestUsers.principal("internal"))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string("internal"));
    }
    @Test void resolveArgument_missingPrincipal_returns401Problem() throws Exception {
        expectProblem(mvc.perform(get("/api/test/current-user")), 401, "UNAUTHENTICATED");
    }
    @Test void resolveArgument_foreignPrincipal_returns401Problem() throws Exception {
        expectProblem(mvc.perform(get("/api/test/current-user").with(oauth2Login())), 401, "UNAUTHENTICATED");
    }
    @Test void resolveArgument_emptySecurityContext_throwsAuthenticationException() {
        assertThatThrownBy(() -> new CurrentUserArgumentResolver().resolveArgument(null, null, null, null))
                .isInstanceOf(AuthenticationCredentialsNotFoundException.class);
    }
    @Test void supportsParameter_annotatedUserPrincipal_acceptsParameter() throws Exception {
        var parameter = new MethodParameter(Endpoint.class.getMethod("current", UserPrincipal.class), 0);
        assertThat(new CurrentUserArgumentResolver().supportsParameter(parameter)).isTrue();
    }
}
