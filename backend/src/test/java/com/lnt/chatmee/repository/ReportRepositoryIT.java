package com.lnt.chatmee.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.mongodb.test.autoconfigure.DataMongoTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.context.ActiveProfiles;

import com.lnt.chatmee.config.MongoConfig;
import com.lnt.chatmee.model.Report;
import com.lnt.chatmee.model.ReportReason;
import com.lnt.chatmee.model.ReportTargetType;
import com.lnt.chatmee.support.ContainersConfig;

@DataMongoTest
@ActiveProfiles("test")
@Import({ContainersConfig.class, MongoConfig.class})
class ReportRepositoryIT {

    @Autowired private ReportRepository reports;
    private final List<String> insertedIds = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        reports.deleteAllById(insertedIds);
    }

    @Test
    void save_sameReporterAndTargetTwice_uniqueIndexRejectsSecondRow() {
        String targetId = UUID.randomUUID().toString();
        save("reporter-a", ReportTargetType.MESSAGE, targetId, ReportReason.SPAM);

        assertThatThrownBy(() -> save("reporter-a", ReportTargetType.MESSAGE, targetId, ReportReason.HARASSMENT))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void save_sameTargetDifferentReporter_storesBothRows() {
        String targetId = UUID.randomUUID().toString();
        save("reporter-a", ReportTargetType.USER, targetId, ReportReason.SPAM);
        save("reporter-b", ReportTargetType.USER, targetId, ReportReason.SPAM);

        assertThat(reports.findAll()).filteredOn(report -> targetId.equals(report.getTargetId())).hasSize(2);
    }

    private void save(String reporterId, ReportTargetType type, String targetId, ReportReason reason) {
        Report saved = reports.save(Report.builder().reporterId(reporterId).targetType(type).targetId(targetId)
                .reason(reason).note("note").createdAt(Instant.parse("2026-10-09T01:02:03Z")).build());
        insertedIds.add(saved.getId());
    }
}
