package com.lnt.chatmee.model;

import java.time.Instant;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
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
@Document(collection = "reports")
@CompoundIndex(name = "reports_reporter_target_unique",
        def = "{'reporterId': 1, 'targetType': 1, 'targetId': 1}", unique = true)
@CompoundIndex(name = "reports_target", def = "{'targetType': 1, 'targetId': 1}")
public class Report {

    @Id
    private String id;

    private String reporterId;

    private ReportTargetType targetType;

    private String targetId;

    private ReportReason reason;

    private String note; // at most 500 characters, never logged

    private Instant createdAt;
}
