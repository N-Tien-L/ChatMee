package com.lnt.chatmee;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import com.lnt.chatmee.support.ContainersConfig;

@SpringBootTest
@ActiveProfiles("test")
@Import(ContainersConfig.class)
class ChatmeeApplicationTests {

	@Test
	void contextLoads() {
	}

}
