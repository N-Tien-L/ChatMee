package com.lnt.chatmee.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.jar.JarFile;
import org.junit.jupiter.api.Test;

class E2ePackagingIT {
    @Test
    void e2e_packagedApplication_excludesTestAuth() throws Exception {
        try (var paths = Files.list(Path.of("target"))) {
            var jars = paths.filter(path -> path.toString().endsWith(".jar")).toList();
            assertThat(jars).hasSize(1);
            try (var jar = new JarFile(jars.get(0).toFile())) {
                var names = jar.stream().map(entry -> entry.getName()).toList();
                assertThat(names).noneMatch(name -> name.contains("/e2e/")
                        || name.contains("application-e2e") || name.contains("test-classes"));
                assertThat(names).contains("BOOT-INF/classes/com/lnt/chatmee/ChatmeeApplication.class");
            }
        }
    }
}
