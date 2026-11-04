package com.lnt.chatmee.e2e;

import com.lnt.chatmee.ChatmeeApplication;
import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.testcontainers.containers.GenericContainer;

/** Dedicated test-classpath entry point; no production auth or session replacements. */
public final class E2eApplication {
    public static void main(String[] args) throws Exception {
        boolean preview = args.length == 1 && "--preview".equals(args[0]);
        if (args.length != 0 && !preview) throw new IllegalArgumentException("E2E launcher accepts no target overrides");
        if (System.getenv("E2E_BASE_URL") != null && !"http://127.0.0.1:3100".equals(System.getenv("E2E_BASE_URL")))
            throw new IllegalArgumentException("E2E refuses nonlocal target overrides");
        String dockerHost = System.getenv("DOCKER_HOST");
        if (dockerHost != null && !dockerHost.startsWith("npipe://") && !dockerHost.startsWith("unix://"))
            throw new IllegalArgumentException("E2E requires a local Docker daemon");
        System.setProperty("spring.devtools.restart.enabled", "false");
        var mongo = container("mongo:7", 27017);
        var redis = container("redis:7", 6379);
        LocalOAuthProvider provider = null;
        try {
            mongo.start();
            redis.start();
            if (!java.net.InetAddress.getByName(mongo.getHost()).isLoopbackAddress()
                    || !java.net.InetAddress.getByName(redis.getHost()).isLoopbackAddress())
                throw new IllegalArgumentException("E2E requires loopback container targets");
            provider = preview ? new LocalOAuthProvider(9200, "http://127.0.0.1:3200/login/oauth2/code/github")
                    : new LocalOAuthProvider();
            var runningProvider = provider;
            var environment = new StandardEnvironment();
            // No inherited Spring configuration, external config imports, credentials or service URLs.
            environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
            environment.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
            var overrides = new java.util.HashMap<String, Object>(Map.of(
                    "spring.config.location", "classpath:/application.properties,classpath:/application-e2e.properties",
                    "spring.profiles.active", "e2e",
                    "spring.mongodb.uri", "mongodb://127.0.0.1:" + mongo.getMappedPort(27017) + "/chatmee_e2e",
                    "spring.data.redis.host", "127.0.0.1",
                    "spring.data.redis.port", redis.getMappedPort(6379)));
            if (preview) {
                overrides.put("server.port", 8200);
                overrides.put("server.servlet.session.timeout", "30m");
                overrides.put("app.client.url", "http://127.0.0.1:3200");
                overrides.put("spring.security.oauth2.client.registration.github.redirect-uri",
                        "http://127.0.0.1:3200/login/oauth2/code/github");
                for (var endpoint : Map.of("authorization-uri", "authorize", "token-uri", "token", "user-info-uri", "userinfo").entrySet())
                    overrides.put("spring.security.oauth2.client.provider.github." + endpoint.getKey(),
                            "http://127.0.0.1:9200/" + endpoint.getValue());
            }
            environment.getPropertySources().addFirst(new MapPropertySource("isolated-e2e", overrides));
            var application = new SpringApplication(ChatmeeApplication.class);
            application.setEnvironment(environment);
            application.setAddCommandLineProperties(false);
            var context = application.run();
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                context.close();
                runningProvider.close();
                redis.stop();
                mongo.stop();
            }, "e2e-cleanup"));
        } catch (Exception failure) {
            if (provider != null) provider.close();
            redis.stop();
            mongo.stop();
            throw failure;
        }
    }

    private static GenericContainer<?> container(String image, int port) {
        return new GenericContainer<>(image).withExposedPorts(port)
                .withCreateContainerCmdModifier(command -> command.getHostConfig().withPortBindings(
                        new PortBinding(Ports.Binding.bindIpAndPort("127.0.0.1", 0), new ExposedPort(port))));
    }
}