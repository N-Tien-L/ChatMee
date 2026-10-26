package com.lnt.chatmee.e2e;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Loopback-only OAuth fixture. Never scanned as a Spring component or packaged. */
public final class LocalOAuthProvider implements AutoCloseable {
    private static final String CALLBACK = "http://127.0.0.1:3100/login/oauth2/code/github";
    private record Grant(String account, Instant expires) {}
    private final Map<String, Grant> codes = new ConcurrentHashMap<>();
    private final Map<String, Grant> tokens = new ConcurrentHashMap<>();
    private final HttpServer server;

    public LocalOAuthProvider() throws IOException {
        this(9100);
    }

    LocalOAuthProvider(int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/authorize", this::authorize);
        server.createContext("/token", this::token);
        server.createContext("/userinfo", this::userinfo);
        server.start();
    }

    int port() { return server.getAddress().getPort(); }

    private void authorize(HttpExchange exchange) throws IOException {
        var query = parameters(exchange.getRequestURI().getRawQuery());
        if (!"GET".equals(exchange.getRequestMethod())
                || !"e2e-client".equals(query.get("client_id"))
                || !"code".equals(query.get("response_type"))
                || !CALLBACK.equals(query.get("redirect_uri"))
                || query.getOrDefault("state", "").isBlank()) {
            reply(exchange, 400, "text/plain", "Invalid authorization request");
            return;
        }
        String fixture = query.getOrDefault("fixture", "");
        if (!fixture.isEmpty() && !fixture.matches("[a-f0-9]{16}")) {
            reply(exchange, 400, "text/plain", "Invalid synthetic fixture namespace");
            return;
        }
        String account = query.get("account");
        if (account == null) {
            String base = "/authorize?" + exchange.getRequestURI().getRawQuery().replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;");
            reply(exchange, 200, "text/html", "<h1>Local synthetic OAuth</h1><a href=\"" + base
                    + "&amp;account=alice\">Alice</a> <a href=\"" + base + "&amp;account=bob\">Bob</a>"
                    + " <a href=\"" + base + "&amp;account=deny\">Deny</a>");
            return;
        }
        if (account.equals("deny")) {
            exchange.getResponseHeaders().add("Location", CALLBACK + "?error=access_denied&state="
                    + URLEncoder.encode(query.get("state"), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
            return;
        }
        if (!account.equals("alice") && !account.equals("bob")) {
            reply(exchange, 400, "text/plain", "Unknown synthetic account");
            return;
        }
        String code = UUID.randomUUID().toString();
        codes.put(code, new Grant(account + (fixture.isEmpty() ? "" : "-" + fixture), Instant.now().plusSeconds(60)));
        exchange.getResponseHeaders().add("Location", CALLBACK + "?code=" + code + "&state="
                + URLEncoder.encode(query.get("state"), StandardCharsets.UTF_8));
        exchange.sendResponseHeaders(302, -1);
        exchange.close();
    }

    private void token(HttpExchange exchange) throws IOException {
        var form = parameters(new String(exchange.getRequestBody().readNBytes(8192), StandardCharsets.UTF_8));
        String basic = "Basic " + java.util.Base64.getEncoder()
                .encodeToString("e2e-client:e2e-synthetic-secret".getBytes(StandardCharsets.UTF_8));
        if (!"POST".equals(exchange.getRequestMethod())
                || !basic.equals(exchange.getRequestHeaders().getFirst("Authorization"))
                || !"authorization_code".equals(form.get("grant_type"))
                || !CALLBACK.equals(form.get("redirect_uri"))) {
            reply(exchange, 400, "application/json", "{\"error\":\"invalid_request\"}");
            return;
        }
        Grant grant = codes.remove(form.getOrDefault("code", ""));
        if (grant == null || grant.expires().isBefore(Instant.now())) {
            reply(exchange, 400, "application/json", "{\"error\":\"invalid_grant\"}");
            return;
        }
        String token = UUID.randomUUID().toString();
        tokens.put(token, new Grant(grant.account(), Instant.now().plusSeconds(60)));
        reply(exchange, 200, "application/json", "{\"access_token\":\"" + token
                + "\",\"token_type\":\"Bearer\",\"expires_in\":60,\"scope\":\"read:user\"}");
    }

    private void userinfo(HttpExchange exchange) throws IOException {
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        Grant grant = authorization != null && authorization.startsWith("Bearer ")
                ? tokens.remove(authorization.substring(7)) : null;
        if (grant == null || grant.expires().isBefore(Instant.now())) {
            reply(exchange, 401, "application/json", "{\"error\":\"invalid_token\"}");
            return;
        }
        reply(exchange, 200, "application/json", "{\"id\":\"e2e-" + grant.account()
                + "\",\"login\":\"E2E " + grant.account() + "\",\"email\":null,\"avatar_url\":null}");
    }

    private static Map<String, String> parameters(String raw) {
        Map<String, String> result = new HashMap<>();
        if (raw != null) for (String pair : raw.split("&")) {
            String[] parts = pair.split("=", 2);
            result.put(URLDecoder.decode(parts[0], StandardCharsets.UTF_8),
                    parts.length == 2 ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "");
        }
        return result;
    }

    private static void reply(HttpExchange exchange, int status, String type, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @Override public void close() { server.stop(0); }
}