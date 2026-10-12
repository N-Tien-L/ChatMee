package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.DatabaseOperationException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.Report;
import com.lnt.chatmee.model.ReportReason;
import com.lnt.chatmee.model.ReportTargetType;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ReportRepository;
import com.lnt.chatmee.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class ReportServiceTest {

    @Mock private ReportRepository reportRepository;
    @Mock private UserRepository userRepository;
    @Mock private MessageRepository messageRepository;
    @Mock private ChatRoomRepository chatRoomRepository;
    @Mock private ParticipantService participantService;
    @InjectMocks private ReportService reportService;

    @Test
    void createReport_visibleUserTarget_savesReport() {
        when(userRepository.findById("reporter")).thenReturn(Optional.of(User.builder().id("reporter").build()));
        when(userRepository.existsById("target")).thenReturn(true);

        reportService.createReport("reporter", ReportTargetType.USER, "target", ReportReason.SPAM, "note");

        Report saved = captureSaved();
        assertSaved(saved, "reporter", ReportTargetType.USER, "target", ReportReason.SPAM, "note");
    }

    @Test
    void createReport_unknownUserTarget_throwsUserNotFound() {
        when(userRepository.findById("reporter")).thenReturn(Optional.of(User.builder().id("reporter").build()));
        when(userRepository.existsById("ghost")).thenReturn(false);

        assertThatThrownBy(() -> reportService.createReport("reporter", ReportTargetType.USER, "ghost",
                ReportReason.OTHER, null))
                .isInstanceOf(UserNotFoundException.class);
        verify(reportRepository, never()).save(any());
    }

    @Test
    void createReport_messageInReporterRoom_savesReport() {
        stubReporter();
        when(messageRepository.findById("m1")).thenReturn(Optional.of(message("m1", "room1")));
        when(participantService.isUserParticipant("room1", "reporter")).thenReturn(true);

        reportService.createReport("reporter", ReportTargetType.MESSAGE, "m1", ReportReason.HARASSMENT, null);

        assertSaved(captureSaved(), "reporter", ReportTargetType.MESSAGE, "m1", ReportReason.HARASSMENT, null);
    }

    @Test
    void createReport_messageInRoomReporterIsNotIn_throwsRoomNotFound() {
        stubReporter();
        when(messageRepository.findById("m1")).thenReturn(Optional.of(message("m1", "room1")));
        when(participantService.isUserParticipant("room1", "reporter")).thenReturn(false);

        assertThatThrownBy(() -> reportService.createReport("reporter", ReportTargetType.MESSAGE, "m1",
                ReportReason.SPAM, null))
                .isInstanceOf(ChatRoomNotFoundException.class);
        verify(reportRepository, never()).save(any());
    }

    @Test
    void createReport_unknownMessage_throwsRoomNotFound() {
        stubReporter();
        when(messageRepository.findById("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reportService.createReport("reporter", ReportTargetType.MESSAGE, "missing",
                ReportReason.SPAM, null))
                .isInstanceOf(ChatRoomNotFoundException.class);
        verify(reportRepository, never()).save(any());
    }

    @Test
    void createReport_roomReporterIsMember_savesReport() {
        stubReporter();
        when(chatRoomRepository.existsById("room1")).thenReturn(true);
        when(participantService.isUserParticipant("room1", "reporter")).thenReturn(true);

        reportService.createReport("reporter", ReportTargetType.ROOM, "room1", ReportReason.INAPPROPRIATE, null);

        assertSaved(captureSaved(), "reporter", ReportTargetType.ROOM, "room1", ReportReason.INAPPROPRIATE, null);
    }

    @Test
    void createReport_roomReporterIsNotMember_throwsRoomNotFound() {
        stubReporter();
        when(chatRoomRepository.existsById("room1")).thenReturn(true);
        when(participantService.isUserParticipant("room1", "reporter")).thenReturn(false);

        assertThatThrownBy(() -> reportService.createReport("reporter", ReportTargetType.ROOM, "room1",
                ReportReason.SPAM, null))
                .isInstanceOf(ChatRoomNotFoundException.class);
        verify(reportRepository, never()).save(any());
    }

    @Test
    void createReport_duplicateReport_countedOnceWithoutError() {
        stubReporter();
        when(userRepository.existsById("target")).thenReturn(true);
        doThrow(new DuplicateKeyException("duplicate")).when(reportRepository).save(any(Report.class));

        assertThatCode(() -> reportService.createReport("reporter", ReportTargetType.USER, "target",
                ReportReason.SPAM, null)).doesNotThrowAnyException();
    }

    @Test
    void createReport_databaseFailure_throwsDatabaseOperationException() {
        stubReporter();
        when(userRepository.existsById("target")).thenReturn(true);
        doThrow(new org.springframework.dao.DataAccessResourceFailureException("down"))
                .when(reportRepository).save(any(Report.class));

        assertThatThrownBy(() -> reportService.createReport("reporter", ReportTargetType.USER, "target",
                ReportReason.SPAM, null))
                .isInstanceOf(DatabaseOperationException.class);
    }

    private void stubReporter() {
        when(userRepository.findById("reporter")).thenReturn(Optional.of(User.builder().id("reporter").build()));
    }

    private Report captureSaved() {
        ArgumentCaptor<Report> captor = ArgumentCaptor.forClass(Report.class);
        verify(reportRepository).save(captor.capture());
        return captor.getValue();
    }

    private static void assertSaved(Report report, String reporterId, ReportTargetType type, String targetId,
            ReportReason reason, String note) {
        org.assertj.core.api.Assertions.assertThat(report.getReporterId()).isEqualTo(reporterId);
        org.assertj.core.api.Assertions.assertThat(report.getTargetType()).isEqualTo(type);
        org.assertj.core.api.Assertions.assertThat(report.getTargetId()).isEqualTo(targetId);
        org.assertj.core.api.Assertions.assertThat(report.getReason()).isEqualTo(reason);
        org.assertj.core.api.Assertions.assertThat(report.getNote()).isEqualTo(note);
        org.assertj.core.api.Assertions.assertThat(report.getCreatedAt()).isNotNull();
    }

    private static Message message(String id, String roomId) {
        return Message.builder().id(id).chatRoomId(roomId).senderId("someone").content("secret body")
                .createdAt(Instant.parse("2026-10-09T01:02:03Z")).build();
    }
}
