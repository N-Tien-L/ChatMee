package com.lnt.chatmee.dto.request;

import com.lnt.chatmee.model.ReportReason;
import com.lnt.chatmee.model.ReportTargetType;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateReportRequest(
        @NotNull ReportTargetType targetType,
        @NotBlank String targetId,
        @NotNull ReportReason reason,
        @Size(max = 500) String note) {
}
