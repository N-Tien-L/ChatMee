package com.lnt.chatmee.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.request.CreateReportRequest;
import com.lnt.chatmee.security.CurrentUser;
import com.lnt.chatmee.security.UserPrincipal;
import com.lnt.chatmee.service.ReportService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@Tag(name = "Reports", description = "Reports of users, messages and rooms")
@RequestMapping("/api/v1/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    @Operation(summary = "Report a user, message or room the caller can see; the reporter gets no response body")
    @PostMapping
    public ResponseEntity<Void> createReport(@Valid @RequestBody CreateReportRequest request,
            @CurrentUser UserPrincipal user) {
        reportService.createReport(user.userId(), request.targetType(), request.targetId(),
                request.reason(), request.note());
        return ResponseEntity.accepted().build();
    }
}
