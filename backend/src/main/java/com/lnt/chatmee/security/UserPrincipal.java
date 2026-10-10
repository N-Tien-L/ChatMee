package com.lnt.chatmee.security;

import java.io.Serializable;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.ArrayList;
import java.util.Objects;
import java.util.Map;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;

/** Session principal whose name is the internal database identity. */
public record UserPrincipal(String userId, String provider, String providerId, String name,
        Map<String, Object> attributes, List<GrantedAuthority> authorities)
        implements OAuth2User, Serializable {
    private static final long serialVersionUID = 1L;

    public UserPrincipal {
        Objects.requireNonNull(userId, "userId");
        attributes = freezeAttributes(attributes);
        authorities = List.copyOf(authorities);
    }

    private static Map<String, Object> freezeAttributes(Map<String, Object> source) {
        Map<String, Object> copy = new LinkedHashMap<>();
        source.forEach((key, value) -> copy.put(key, freeze(value)));
        return Collections.unmodifiableMap(copy);
    }

    private static Object freeze(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<Object, Object> copy = new LinkedHashMap<>();
            map.forEach((key, nested) -> copy.put(key, freeze(nested)));
            return Collections.unmodifiableMap(copy);
        }
        if (value instanceof Collection<?> collection) {
            List<Object> copy = new ArrayList<>();
            collection.forEach(nested -> copy.add(freeze(nested)));
            return Collections.unmodifiableList(copy);
        }
        return value;
    }

    @Override public String getName() { return userId; }
    @Override public Map<String, Object> getAttributes() { return attributes; }
    @Override public Collection<? extends GrantedAuthority> getAuthorities() { return authorities; }
}
