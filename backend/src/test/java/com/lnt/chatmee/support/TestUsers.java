package com.lnt.chatmee.support;
import java.util.List;
import java.util.Map;
import com.lnt.chatmee.security.UserPrincipal;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
public final class TestUsers {
    private TestUsers() {}
    public static UserPrincipal principal(String id) {
        return new UserPrincipal(id, "github", "42", "Alice", Map.of("id", "42"),
                List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }
}
