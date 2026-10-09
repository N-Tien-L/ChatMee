package com.lnt.chatmee.security;

import java.io.Serializable;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;

/** Session principal whose name is the internal database identity. */
public record UserPrincipal(String userId, String provider, String providerId, String name,
        Map<String, Object> attributes, List<GrantedAuthority> authorities)
        implements OAuth2User, Serializable {
    private static final long serialVersionUID = 1L;

    public UserPrincipal {
        attributes = Collections.unmodifiableMap(new LinkedHashMap<>(attributes));
        authorities = List.copyOf(authorities);
    }

    @Override public String getName() { return userId; }
    @Override public Map<String, Object> getAttributes() { return attributes; }
    @Override public Collection<? extends GrantedAuthority> getAuthorities() { return authorities; }
}
