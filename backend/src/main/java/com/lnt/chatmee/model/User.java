package com.lnt.chatmee.model;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@CompoundIndex(name = "provider_providerId_idx", def = "{'provider': 1, 'providerId': 1}", unique = true)
@Document(collection = "users")
public class User {
    
    @Id
    private UUID id;

    @Indexed
    private String email;

    private String name;

    private String avatarUrl;

    private String provider;

    private String providerId;

    @Builder.Default
    private Set<String> roles = Set.of("USER");

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    @Builder.Default
    private boolean emailVerified = false;
}
