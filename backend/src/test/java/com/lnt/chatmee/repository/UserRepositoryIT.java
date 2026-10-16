package com.lnt.chatmee.repository;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.mongodb.test.autoconfigure.DataMongoTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

import com.lnt.chatmee.model.User;
import com.lnt.chatmee.model.UserBlock;
import com.lnt.chatmee.support.ContainersConfig;

@DataMongoTest
@ActiveProfiles("test")
@Import(ContainersConfig.class)
class UserRepositoryIT {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserBlockRepository userBlockRepository;

    @BeforeEach
    void seed() {
        userRepository.deleteAll();
        userBlockRepository.deleteAll();
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

    // CM-073 AC4: users blocked in either direction are left out of search (AC-009-17)

    @Test
    void findByNameContainingIgnoreCaseAndIdNotIn_blockedEitherWay_excludesBothDirections() {
        userBlockRepository.insert(block("caller", "u1"));
        userBlockRepository.insert(block("u3", "caller"));
        userBlockRepository.insert(block("u1", "u3"));
        Set<String> excluded = new HashSet<>(Set.of("caller"));
        userBlockRepository.findInvolving("caller").forEach(row ->
            excluded.add(row.getBlockerId().equals("caller") ? row.getBlockedId() : row.getBlockerId()));

        Page<User> page = userRepository.findByNameContainingIgnoreCaseAndIdNotIn("", excluded, PageRequest.of(0, 20));

        assertThat(excluded).containsExactlyInAnyOrder("caller", "u1", "u3");
        assertThat(page.getContent()).extracting(User::getId).containsExactly("u2");
        assertThat(page.getTotalElements()).isEqualTo(1);
    }

    @Test
    void existsEitherWay_oneDirectionalBlock_matchesBothArgumentOrders() {
        userBlockRepository.insert(block("caller", "u1"));

        assertThat(userBlockRepository.existsEitherWay("caller", "u1")).isTrue();
        assertThat(userBlockRepository.existsEitherWay("u1", "caller")).isTrue();
        assertThat(userBlockRepository.existsEitherWay("caller", "u2")).isFalse();
    }

    @Test
    void insert_sameBlockTwice_rejectedByUniqueIndex() {
        userBlockRepository.insert(block("caller", "u1"));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> userBlockRepository.insert(block("caller", "u1")))
            .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
    }

    private static UserBlock block(String blockerId, String blockedId) {
        return UserBlock.builder().blockerId(blockerId).blockedId(blockedId).createdAt(Instant.now()).build();
    }

    private Page<User> search(String query) {
        return userRepository.findByNameContainingIgnoreCaseAndIdNot(query, "caller", PageRequest.of(0, 20));
    }

    private static User user(String id, String name) {
        return User.builder().id(id).name(name).provider("github").providerId("p-" + id).build();
    }
}
