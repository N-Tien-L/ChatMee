package com.lnt.chatmee.security;

import static org.assertj.core.api.Assertions.*;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class UserPrincipalTest {
    @Test void constructor_mutableProviderAttributes_copiesNestedCollectionsAndAllowsNulls() {
        var roles = new ArrayList<>(List.of("reader"));
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("roles", roles);
        attributes.put("email", null);
        var principal = new UserPrincipal("internal", "github", "42", "Alice", attributes, List.of());
        roles.add("writer");
        attributes.put("id", "changed");
        assertThat(principal.getAttributes()).containsEntry("roles", List.of("reader")).containsEntry("email", null);
        assertThat(principal.getAttributes()).doesNotContainKey("id");
        assertThatThrownBy(() -> principal.getAttributes().put("id", "changed"))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> ((List<?>) principal.getAttributes().get("roles")).clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThat(principal.getName()).isEqualTo("internal");
        assertThat(principal.name()).isEqualTo("Alice");
    }
}
