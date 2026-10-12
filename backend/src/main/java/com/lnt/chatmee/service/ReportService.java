package com.lnt.chatmee.service;

import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import com.lnt.chatmee.exception.ChatRoomNotFoundException;
import com.lnt.chatmee.exception.DatabaseOperationException;
import com.lnt.chatmee.exception.UserNotFoundException;
import com.lnt.chatmee.model.Message;
import com.lnt.chatmee.model.Report;
import com.lnt.chatmee.model.ReportReason;
import com.lnt.chatmee.model.ReportTargetType;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ReportRepository;
import com.lnt.chatmee.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ReportService {

    private static final Logger log = LoggerFactory.getLogger(ReportService.class);

    private final ReportRepository reportRepository;
    private final UserRepository userRepository;
    private final MessageRepository messageRepository;
    private final ChatRoomRepository chatRoomRepository;
    private final ParticipantService participantService;

    /**
     * Stores a report. A target the reporter cannot see is reported as not found, so the caller learns nothing
     * about targets outside their rooms. A repeat of the same reporter and target is accepted without a second row.
     * The note is stored but never logged.
     */
    public void createReport(String reporterId, ReportTargetType targetType, String targetId,
            ReportReason reason, String note) {
        userRepository.findById(reporterId)
                .orElseThrow(() -> new UserNotFoundException("Authenticated user not found"));
        assertTargetVisible(reporterId, targetType, targetId);

        Report report = Report.builder()
                .reporterId(reporterId).targetType(targetType).targetId(targetId)
                .reason(reason).note(note).createdAt(Instant.now())
                .build();
        try {
            reportRepository.save(report);
        } catch (DuplicateKeyException ex) {
            log.debug("Duplicate report ignored reporterId={} targetType={} targetId={}",
                    reporterId, targetType, targetId);
            return;
        } catch (DataAccessException ex) {
            throw new DatabaseOperationException("Failed to save report", ex);
        }
        log.info("Report stored reporterId={} targetType={} targetId={} reason={}",
                reporterId, targetType, targetId, reason);
    }

    private void assertTargetVisible(String reporterId, ReportTargetType targetType, String targetId) {
        switch (targetType) {
            case USER -> {
                if (!userRepository.existsById(targetId)) {
                    throw new UserNotFoundException("Report target not found");
                }
            }
            case MESSAGE -> {
                // There is no MESSAGE_NOT_FOUND error code yet, so a hidden message maps to ROOM_NOT_FOUND.
                Message message = messageRepository.findById(targetId)
                        .orElseThrow(() -> new ChatRoomNotFoundException("Report target not found"));
                if (!participantService.isUserParticipant(message.getChatRoomId(), reporterId)) {
                    throw new ChatRoomNotFoundException("Report target not found");
                }
            }
            case ROOM -> {
                if (!chatRoomRepository.existsById(targetId)
                        || !participantService.isUserParticipant(targetId, reporterId)) {
                    throw new ChatRoomNotFoundException("Report target not found");
                }
            }
        }
    }
}
