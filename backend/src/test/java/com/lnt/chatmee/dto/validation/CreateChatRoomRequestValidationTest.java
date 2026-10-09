package com.lnt.chatmee.dto.validation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.lnt.chatmee.dto.request.CreateChatRoomRequest;
import com.lnt.chatmee.dto.request.UpdateChatRoomRequest;
import com.lnt.chatmee.model.ChatRoom.RoomType;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

class CreateChatRoomRequestValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    @Test
    void validate_directMessageWithoutParticipant_rejectsParticipantId() {
        assertThat(invalidFields(request(RoomType.DIRECT_MESSAGE, null, null))).containsExactly("participantId");
    }

    @Test
    void validate_directMessageWithParticipantAndNoName_isValid() {
        assertThat(invalidFields(request(RoomType.DIRECT_MESSAGE, "user-2", null))).isEmpty();
    }

    @Test
    void validate_directMessageWithMalformedParticipant_rejectsParticipantId() {
        assertThat(invalidFields(request(RoomType.DIRECT_MESSAGE, "user 2; drop", null))).containsExactly("participantId");
    }

    @ParameterizedTest
    @ValueSource(strings = { "PUBLIC", "PRIVATE" })
    void validate_groupRoomWithoutName_rejectsRoomName(String type) {
        assertThat(invalidFields(request(RoomType.valueOf(type), null, "  "))).containsExactly("roomName");
    }

    @Test
    void validate_groupRoomWithoutParticipant_isValid() {
        assertThat(invalidFields(request(RoomType.PUBLIC, null, "Phòng chung 2024"))).isEmpty();
    }

    @Test
    void validate_missingRoomType_reportsOnlyRoomType() {
        assertThat(invalidFields(request(null, null, null))).containsExactly("roomType");
    }

    @ParameterizedTest
    @ValueSource(strings = { "bad!", "<script>", "a/b" })
    void validate_roomNameWithForbiddenCharacters_rejectsRoomName(String name) {
        assertThat(invalidFields(request(RoomType.PUBLIC, null, name))).containsExactly("roomName");
    }

    @Test
    void validate_roomNameLongerThanLimitAfterTrim_rejectsRoomName() {
        assertThat(invalidFields(request(RoomType.PUBLIC, null, "x".repeat(101)))).containsExactly("roomName");
        assertThat(invalidFields(request(RoomType.PUBLIC, null, "  " + "x".repeat(100) + "  "))).isEmpty();
    }

    @Test
    void validate_updateWithInvalidName_rejectsRoomName() {
        UpdateChatRoomRequest update = new UpdateChatRoomRequest();
        update.setRoomName("bad!");

        assertThat(validator.validate(update)).extracting(v -> v.getPropertyPath().toString()).containsExactly("roomName");
    }

    @Test
    void validate_updateWithoutName_isValid() {
        assertThat(validator.validate(new UpdateChatRoomRequest())).isEmpty();
    }

    private static CreateChatRoomRequest request(RoomType type, String participantId, String roomName) {
        CreateChatRoomRequest request = new CreateChatRoomRequest();
        request.setRoomType(type);
        request.setParticipantId(participantId);
        request.setRoomName(roomName);
        return request;
    }

    private static Set<String> invalidFields(CreateChatRoomRequest request) {
        Set<ConstraintViolation<CreateChatRoomRequest>> violations = validator.validate(request);
        return violations.stream().map(v -> v.getPropertyPath().toString()).collect(Collectors.toSet());
    }
}
