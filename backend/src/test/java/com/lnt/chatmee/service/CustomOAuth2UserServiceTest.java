package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import java.util.Optional;
import java.io.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.security.UserPrincipal;

class CustomOAuth2UserServiceTest {
    @Test void loadUser_existingAndNewProviders_returnsSerializableInternalPrincipal() throws Exception {
        for (String provider : new String[]{"google", "github"}) {
            var users = mock(UserRepository.class);
            var service = new CustomOAuth2UserService(users);
            var rest = new RestTemplate();
            service.setRestOperations(rest);
            var server = MockRestServiceServer.bindTo(rest).build();
            String body = provider.equals("google")
                    ? "{\"sub\":\"42\",\"name\":\"Alice\",\"email\":\"alice@example.test\"}"
                    : "{\"id\":42,\"login\":\"Alice\",\"email\":null}";
            server.expect(requestTo("https://provider.test/userinfo")).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
            when(users.findByProviderAndProviderId(provider, "42")).thenReturn(provider.equals("google")
                    ? Optional.of(User.builder().id("internal").name("Alice").build()) : Optional.empty());
            when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
            var registration = ClientRegistration.withRegistrationId(provider).clientId("client")
                    .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE).redirectUri("http://localhost/login")
                    .authorizationUri("https://provider.test/auth").tokenUri("https://provider.test/token")
                    .userInfoUri("https://provider.test/userinfo").userNameAttributeName(provider.equals("google") ? "sub" : "id").build();
            var token = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "synthetic-token", null, null);
            var principal = (UserPrincipal) service.loadUser(new OAuth2UserRequest(registration, token));
            assertThat(principal.userId()).isNotBlank();
            assertThat(principal.getName()).isEqualTo(principal.userId());
            if (provider.equals("google")) assertThat(principal.userId()).isEqualTo("internal");
            assertThat(principal.provider()).isEqualTo(provider);
            assertThat(principal.providerId()).isEqualTo("42");
            assertThat(principal.name()).isEqualTo("Alice");
            assertThat(principal.getAttributes()).containsKey(provider.equals("google") ? "sub" : "id");
            var bytes = new ByteArrayOutputStream();
            try (var output = new ObjectOutputStream(bytes)) { output.writeObject(principal); }
            try (var input = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
                assertThat(((UserPrincipal) input.readObject()).getName()).isEqualTo(principal.userId());
            }
            server.verify();
        }
    }
}
