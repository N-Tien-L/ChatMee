package com.lnt.chatmee.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.mongodb.test.autoconfigure.DataMongoTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.context.ActiveProfiles;

import com.lnt.chatmee.config.MongoConfig;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.Participant.Role;
import com.lnt.chatmee.support.ContainersConfig;

@DataMongoTest
@ActiveProfiles("test")
@Import({ ContainersConfig.class, MongoConfig.class })
class ParticipantRepositoryIT {

    @Autowired
    private ParticipantRepository participantRepository;

    @BeforeEach
    void clean() {
        participantRepository.deleteAll();
    }

    @Test
    void save_duplicateRoomAndUser_rejectedByUniqueIndex() {
        participantRepository.save(member("room", "alice"));

        assertThatThrownBy(() -> participantRepository.save(member("room", "alice")))
                .isInstanceOf(DuplicateKeyException.class);
        assertThat(participantRepository.countByChatRoomId("room")).isEqualTo(1);
    }

    @Test
    void save_sameUserInAnotherRoom_isAllowed() {
        participantRepository.save(member("room-a", "alice"));
        participantRepository.save(member("room-b", "alice"));

        assertThat(participantRepository.findByUserId("alice")).hasSize(2);
    }

    @Test
    void save_newParticipant_fillsGeneratedIdAndAuditDates() {
        Participant saved = participantRepository.save(member("room", "alice"));

        assertThat(saved.getId()).isNotBlank();
        assertThat(saved.getJoinedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();
    }

    @Test
    void deleteByChatRoomIdAndUserId_existingAndMissing_returnsDeletedCount() {
        participantRepository.save(member("room", "alice"));

        assertThat(participantRepository.deleteByChatRoomIdAndUserId("room", "alice")).isEqualTo(1);
        assertThat(participantRepository.deleteByChatRoomIdAndUserId("room", "alice")).isZero();
    }

    private static Participant member(String roomId, String userId) {
        return Participant.builder().chatRoomId(roomId).userId(userId).role(Role.MEMBER).build();
    }
}
