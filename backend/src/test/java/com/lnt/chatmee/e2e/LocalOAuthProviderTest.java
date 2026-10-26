package com.lnt.chatmee.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class LocalOAuthProviderTest {
    @Test
    void authorizationCode_validFlow_isSingleUseAndMapsTwoAccounts() throws Exception {
        try (var provider = new LocalOAuthProvider(0)) {
            var client = HttpClient.newHttpClient();
            String callback = "http://127.0.0.1:3100/login/oauth2/code/github";
            String root = "http://127.0.0.1:" + provider.port();
            for (String fixture : new String[] {"", "0123456789abcdef", "fedcba9876543210"})
            for (String account : new String[] {"alice", "bob"}) {
                var authorize = client.send(HttpRequest.newBuilder(URI.create(root
                        + "/authorize?client_id=e2e-client&response_type=code&state=synthetic-state&redirect_uri="
                        + URLEncoder.encode(callback, StandardCharsets.UTF_8) + "&account=" + account + "&fixture=" + fixture)).build(),
                        HttpResponse.BodyHandlers.ofString());
                assertThat(authorize.statusCode()).isEqualTo(302);
                var redirect = URI.create(authorize.headers().firstValue("Location").orElseThrow());
                assertThat(redirect.getHost()).isEqualTo("127.0.0.1");
                assertThat(redirect.getQuery().endsWith("&state=synthetic-state")).isTrue();
                String code = redirect.getQuery().split("&")[0].substring(5);
                var request = HttpRequest.newBuilder(URI.create(root + "/token"))
                        .header("Authorization", "Basic " + java.util.Base64.getEncoder().encodeToString(
                                "e2e-client:e2e-synthetic-secret".getBytes(StandardCharsets.UTF_8)))
                        .POST(HttpRequest.BodyPublishers.ofString("grant_type=authorization_code&code=" + code
                                + "&redirect_uri=" + URLEncoder.encode(callback, StandardCharsets.UTF_8))).build();
                var token = client.send(request, HttpResponse.BodyHandlers.ofString());
                assertThat(token.statusCode()).isEqualTo(200);
                var json = new tools.jackson.databind.ObjectMapper().readTree(token.body());
                String bearer = json.get("access_token").asText();
                var info = client.send(HttpRequest.newBuilder(URI.create(root + "/userinfo"))
                        .header("Authorization", "Bearer " + bearer).build(), HttpResponse.BodyHandlers.ofString());
                assertThat(info.statusCode()).isEqualTo(200);
                assertThat(new tools.jackson.databind.ObjectMapper().readTree(info.body()).get("id").asText())
                        .isEqualTo("e2e-" + account + (fixture.isEmpty() ? "" : "-" + fixture));
                assertThat(client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(400);
            }
        }
    }
    @Test
    void authorize_nonLocalCallback_refusesRedirect() throws Exception {
        try (var provider = new LocalOAuthProvider(0)) {
            var client = HttpClient.newHttpClient();
            var response = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"
                    + provider.port() + "/authorize?client_id=e2e-client&response_type=code&state=state"
                    + "&redirect_uri=" + URLEncoder.encode("https://example.com/callback", StandardCharsets.UTF_8)))
                    .build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.headers().firstValue("Location")).isEmpty();
        }
    }

    @Test
    void token_unknownCode_rejectsGrant() throws Exception {
        try (var provider = new LocalOAuthProvider(0)) {
            var response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(
                    URI.create("http://127.0.0.1:" + provider.port() + "/token"))
                    .POST(HttpRequest.BodyPublishers.ofString("code=unknown")).build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(400);
        }
    }
}
