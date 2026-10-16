package com.lnt.chatmee.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.lnt.chatmee.config.SecurityConfig;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ReportRepository;
import com.lnt.chatmee.repository.UserRepository;
import com.lnt.chatmee.service.ParticipantService;
import com.lnt.chatmee.service.RateLimitingService;
import com.lnt.chatmee.service.ReportService;
import com.lnt.chatmee.support.SecuredWebMvcTestSupport;
import com.lnt.chatmee.support.TestUsers;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/** Uses the real {@link ReportService} with mocked repositories, so logging and visibility run end to end. */
@WebMvcTest(controllers = ReportController.class, properties = "app.client.url=http://localhost:3000")
@ActiveProfiles("actuator-test")
@Import({SecurityConfig.class, ReportService.class})
class ReportControllerWebMvcTest extends SecuredWebMvcTestSupport {

    private static final String REPORTS = "/api/v1/reports";
    private static final String NOTE_SECRET = "secret-note-text-7319";
    private static final String CONTENT_SECRET = "secret-message-body-4421";

    @MockitoBean ReportRepository reportRepository;
    @MockitoBean UserRepository userRepository;
    @MockitoBean MessageRepository messageRepository;
    @MockitoBean ChatRoomRepository chatRoomRepository;
    @MockitoBean ParticipantService participantService;
    @MockitoBean RateLimitingService rateLimitingService;

    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private Logger reportLogger;

    @BeforeEach
    void captureLogs() {
        reportLogger = (Logger) LoggerFactory.getLogger(ReportService.class);
        reportLogger.setLevel(Level.DEBUG);
        logs.start();
        reportLogger.addAppender(logs);
        when(userRepository.findById("u1")).thenReturn(Optional.of(User.builder().id("u1").build()));
    }

    @AfterEach
    void detachLogs() {
        reportLogger.detachAppender(logs);
    }

    @Test
    void createReport_visibleUserTarget_returns202() throws Exception {
        when(userRepository.existsById("u2")).thenReturn(true);

        mvc.perform(post(REPORTS).contentType("application/json")
                .content("{\"targetType\":\"USER\",\"targetId\":\"u2\",\"reason\":\"SPAM\"}")
                .with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader()))
                .andExpect(status().isAccepted());
    }

    @Test
    void createReport_visibleMessageTarget_returns202() throws Exception {
        when(messageRepository.findById("m1")).thenReturn(Optional.of(Message.builder().id("m1")
                .chatRoomId("room-1").content(CONTENT_SECRET).createdAt(Instant.parse("2026-10-09T01:02:03Z")).build()));
        when(participantService.isUserParticipant("room-1", "u1")).thenReturn(true);

        mvc.perform(post(REPORTS).contentType("application/json")
                .content("{\"targetType\":\"MESSAGE\",\"targetId\":\"m1\",\"reason\":\"HARASSMENT\"}")
                .with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader()))
                .andExpect(status().isAccepted());
    }

    @Test
    void createReport_visibleRoomTarget_returns202() throws Exception {
        when(chatRoomRepository.existsById("room-1")).thenReturn(true);
        when(participantService.isUserParticipant("room-1", "u1")).thenReturn(true);

        mvc.perform(post(REPORTS).contentType("application/json")
                .content("{\"targetType\":\"ROOM\",\"targetId\":\"room-1\",\"reason\":\"OTHER\"}")
                .with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader()))
                .andExpect(status().isAccepted());
    }

    @Test
    void createReport_invisibleMessageTarget_returns404Problem() throws Exception {
        when(messageRepository.findById("m9")).thenReturn(Optional.empty());

        expectProblem(mvc.perform(post(REPORTS).contentType("application/json")
                .content("{\"targetType\":\"MESSAGE\",\"targetId\":\"m9\",\"reason\":\"SPAM\"}")
                .with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader())), 404, "ROOM_NOT_FOUND");
    }

    @Test
    void createReport_roomCallerIsNotIn_returns404Problem() throws Exception {
        when(chatRoomRepository.existsById("room-2")).thenReturn(true);
        when(participantService.isUserParticipant("room-2", "u1")).thenReturn(false);

        expectProblem(mvc.perform(post(REPORTS).contentType("application/json")
                .content("{\"targetType\":\"ROOM\",\"targetId\":\"room-2\",\"reason\":\"SPAM\"}")
                .with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader())), 404, "ROOM_NOT_FOUND");
    }

    @Test
    void createReport_repeatReport_returns202Again() throws Exception {
        when(userRepository.existsById("u2")).thenReturn(true);
        when(reportRepository.save(any())).thenThrow(new DuplicateKeyException("dup"));

        mvc.perform(post(REPORTS).contentType("application/json")
                .content("{\"targetType\":\"USER\",\"targetId\":\"u2\",\"reason\":\"SPAM\"}")
                .with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader()))
                .andExpect(status().isAccepted());
    }

    @Test
    void createReport_noteOver500Characters_returns400Problem() throws Exception {
        String longNote = "x".repeat(501);

        expectProblem(mvc.perform(post(REPORTS).contentType("application/json")
                .content("{\"targetType\":\"USER\",\"targetId\":\"u2\",\"reason\":\"OTHER\",\"note\":\"" + longNote + "\"}")
                .with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader())), 400, "VALIDATION_FAILED");
    }

    @Test
    void createReport_noteAt500Characters_returns202() throws Exception {
        when(userRepository.existsById("u2")).thenReturn(true);
        String maxNote = "x".repeat(500);

        mvc.perform(post(REPORTS).contentType("application/json")
                .content("{\"targetType\":\"USER\",\"targetId\":\"u2\",\"reason\":\"OTHER\",\"note\":\"" + maxNote + "\"}")
                .with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader()))
                .andExpect(status().isAccepted());
    }

    @Test
    void createReport_withNoteAndMessageContent_logsOnlyIdsAndReason() throws Exception {
        when(messageRepository.findById("m1")).thenReturn(Optional.of(Message.builder().id("m1")
                .chatRoomId("room-1").content(CONTENT_SECRET).createdAt(Instant.parse("2026-10-09T01:02:03Z")).build()));
        when(participantService.isUserParticipant("room-1", "u1")).thenReturn(true);

        mvc.perform(post(REPORTS).contentType("application/json")
                .content("{\"targetType\":\"MESSAGE\",\"targetId\":\"m1\",\"reason\":\"SPAM\",\"note\":\"" + NOTE_SECRET + "\"}")
                .with(oauth2Login().oauth2User(TestUsers.principal("u1"))).with(csrf().asHeader()))
                .andExpect(status().isAccepted());

        assertThat(logs.list).isNotEmpty();
        assertThat(logs.list.stream().map(ILoggingEvent::getFormattedMessage))
                .allSatisfy(line -> assertThat(line).doesNotContain(NOTE_SECRET).doesNotContain(CONTENT_SECRET));
    }
}
