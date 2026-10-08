package com.lnt.chatmee.support;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.util.Objects;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Import(ContainersConfig.class)
class ContainersSmokeIT {

    @Autowired
    private MongoTemplate mongoTemplate;

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    @Test
    void testContainersAreRunningAndCanStoreData() {
        // Test Mongo
        mongoTemplate.getCollectionNames(); // just ensures it doesn't throw and works
        
        // Test Redis
        String key = "smoke-test-key";
        String value = "smoke-test-value";
        stringRedisTemplate.opsForValue().set(key, value);
        String retrievedValue = stringRedisTemplate.opsForValue().get(key);
        assertThat(retrievedValue).isEqualTo(value);
    }
}
