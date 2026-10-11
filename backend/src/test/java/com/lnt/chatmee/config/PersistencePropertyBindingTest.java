package com.lnt.chatmee.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.data.mongodb.autoconfigure.DataMongoAutoConfiguration;
import org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration;
import org.springframework.boot.data.redis.autoconfigure.DataRedisConnectionDetails;
import org.springframework.boot.mongodb.autoconfigure.MongoAutoConfiguration;
import org.springframework.boot.mongodb.autoconfigure.MongoConnectionDetails;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.mongodb.core.mapping.MongoMappingContext;

import com.mongodb.client.MongoClient;

/**
 * Loads the real application.properties and profile files (Boot config data) and checks that the Mongo URI,
 * auto-index-creation and the Redis URL are bound by the Boot 4 property names, still read from the
 * MONGO_URI_PROD / MONGO_URI_DEV / REDIS_URL variables. Integration tests cannot catch a wrong key because
 * Testcontainers' @ServiceConnection replaces the connection details. The local profile is not loaded here:
 * it imports an optional .env file.
 */
class PersistencePropertyBindingTest {

    private static final String PROD_MONGO_URI = "mongodb://binding-check.invalid:27017/chatmee-prod";
    private static final String DEV_MONGO_URI = "mongodb://binding-check.invalid:27017/chatmee-dev";
    private static final String PROD_REDIS_URL = "redis://binding-check.invalid:6380";

    // The MongoClient is mocked so nothing connects; connection details and the mapping context are still
    // built by the real auto-configuration from the bound properties.
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(MongoAutoConfiguration.class, DataMongoAutoConfiguration.class,
                    DataRedisAutoConfiguration.class))
            .withBean(MongoClient.class, () -> mock(MongoClient.class));

    @Test
    void prodProfile_envVariables_bindMongoUriAutoIndexAndRedisUrl() {
        runner.withPropertyValues("spring.profiles.active=prod", "MONGO_URI_PROD=" + PROD_MONGO_URI,
                        "REDIS_URL=" + PROD_REDIS_URL)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(MongoConnectionDetails.class).getConnectionString().getConnectionString())
                            .isEqualTo(PROD_MONGO_URI);
                    assertThat(context.getBean(MongoMappingContext.class).isAutoIndexCreation()).isTrue();
                    DataRedisConnectionDetails.Standalone redis =
                            context.getBean(DataRedisConnectionDetails.class).getStandalone();
                    assertThat(redis.getHost()).isEqualTo("binding-check.invalid");
                    assertThat(redis.getPort()).isEqualTo(6380);
                });
    }

    @Test
    void devProfile_envVariable_bindsMongoUriAndAutoIndex() {
        runner.withPropertyValues("spring.profiles.active=dev", "MONGO_URI_DEV=" + DEV_MONGO_URI)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(MongoConnectionDetails.class).getConnectionString().getConnectionString())
                            .isEqualTo(DEV_MONGO_URI);
                    assertThat(context.getBean(MongoMappingContext.class).isAutoIndexCreation()).isTrue();
                });
    }
}
