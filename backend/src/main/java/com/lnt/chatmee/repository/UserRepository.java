package com.lnt.chatmee.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.lnt.chatmee.model.User;

public interface UserRepository extends MongoRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    Optional<User> findByProviderAndProviderId(String provider, String providerId);
}
