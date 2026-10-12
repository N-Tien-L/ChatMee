package com.lnt.chatmee.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.DmRequestResponse;
import com.lnt.chatmee.security.CurrentUser;
import com.lnt.chatmee.security.UserPrincipal;
import com.lnt.chatmee.service.DirectMessageRequestService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;

@RestController
@Tag(name = "DM requests", description = "A stranger's direct message is a request until the recipient accepts it")
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class DirectMessageRequestController {

    private final DirectMessageRequestService dmRequestService;

    @Operation(summary = "List the caller's pending DM requests, newest first")
    @GetMapping("/dm-requests")
    public ResponseEntity<ApiResponse<List<DmRequestResponse>>> listMine(@CurrentUser UserPrincipal user) {
        return ResponseEntity.ok(ApiResponse.success(dmRequestService.listPending(user.userId())));
    }

    @Operation(summary = "Accept a DM request (recipient only) and join the conversation")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "DM request accepted")
    @PostMapping("/rooms/{roomId}/dm-request/accept")
    public ResponseEntity<Void> accept(@CurrentUser UserPrincipal user, @PathVariable String roomId) {
        dmRequestService.accept(roomId, user.userId());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Decline a DM request (recipient only)")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "DM request declined")
    @PostMapping("/rooms/{roomId}/dm-request/decline")
    public ResponseEntity<Void> decline(@CurrentUser UserPrincipal user, @PathVariable String roomId) {
        dmRequestService.decline(roomId, user.userId());
        return ResponseEntity.noContent().build();
    }
}
