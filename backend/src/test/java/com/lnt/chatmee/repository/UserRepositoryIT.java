package com.lnt.chatmee.repository;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.mongo.DataMongoTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import com.lnt.chatmee.model.User;
import com.lnt.chatmee.support.ContainersConfig;

@DataMongoTest
@ActiveProfiles("test")
@Import(ContainersConfig.class)
class UserRepositoryIT {

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void seed() {
        userRepository.deleteAll();
        userRepository.save(user("caller", "Alice Caller"));
        userRepository.save(user("u1", "alice smith"));
        userRepository.save(user("u2", "Bob (admin)"));
        userRepository.save(user("u3", "Carol"));
    }

    @Test
    void findByNameContainingIgnoreCaseAndIdNot_caseInsensitive_excludesCaller() {
        Page<User> page = search("ALICE");

        assertThat(page.getContent()).extracting(User::getId).containsExactly("u1");
    }

    @Test
    void findByNameContainingIgnoreCaseAndIdNot_regexWildcard_matchesLiterally() {
        assertThat(search(".*").getContent()).isEmpty();
    }

    @Test
    void findByNameContainingIgnoreCaseAndIdNot_unbalancedParenthesis_matchesLiterally() {
        assertThat(search("(").getContent()).extracting(User::getId).containsExactly("u2");
    }

    @Test
    void findByNameContainingIgnoreCaseAndIdNot_emptyQuery_returnsEveryoneButCaller() {
        assertThat(search("").getContent()).extracting(User::getId).containsExactlyInAnyOrder("u1", "u2", "u3");
    }

    private Page<User> search(String query) {
        return userRepository.findByNameContainingIgnoreCaseAndIdNot(query, "caller", PageRequest.of(0, 20));
    }

    private static User user(String id, String name) {
        return User.builder().id(id).name(name).provider("github").providerId("p-" + id).build();
    }
}
