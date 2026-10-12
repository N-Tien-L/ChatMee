package com.lnt.chatmee.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.request.CreateInvitationRequest;
import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.InvitationResponse;
import com.lnt.chatmee.security.CurrentUser;
import com.lnt.chatmee.security.UserPrincipal;
import com.lnt.chatmee.service.InvitationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@Tag(name = "Invitations", description = "Invitations into private rooms; membership needs the invitee's consent")
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class InvitationController {

    private final InvitationService invitationService;

    @Operation(summary = "Invite a user into a private room (owner or admin only)")
    @PostMapping("/rooms/{roomId}/invitations")
    public ResponseEntity<ApiResponse<InvitationResponse>> invite(@CurrentUser UserPrincipal user,
            @PathVariable String roomId, @Valid @RequestBody CreateInvitationRequest request) {
        InvitationResponse invitation = invitationService.invite(roomId, user.userId(), request.userId());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Invitation sent", invitation));
    }

    @Operation(summary = "List the room's pending invitations (owner or admin only)")
    @GetMapping("/rooms/{roomId}/invitations")
    public ResponseEntity<ApiResponse<List<InvitationResponse>>> listForRoom(@CurrentUser UserPrincipal user,
            @PathVariable String roomId) {
        return ResponseEntity.ok(ApiResponse.success(invitationService.listForRoom(roomId, user.userId())));
    }

    @Operation(summary = "List the caller's pending invitations")
    @GetMapping("/invitations")
    public ResponseEntity<ApiResponse<List<InvitationResponse>>> listMine(@CurrentUser UserPrincipal user) {
        return ResponseEntity.ok(ApiResponse.success(invitationService.listMine(user.userId())));
    }

    @Operation(summary = "Accept an invitation (invitee only) and join the room")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "Invitation accepted")
    @PostMapping("/invitations/{id}/accept")
    public ResponseEntity<Void> accept(@CurrentUser UserPrincipal user, @PathVariable String id) {
        invitationService.accept(id, user.userId());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Decline an invitation (invitee only)")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "Invitation declined")
    @PostMapping("/invitations/{id}/decline")
    public ResponseEntity<Void> decline(@CurrentUser UserPrincipal user, @PathVariable String id) {
        invitationService.decline(id, user.userId());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Revoke an invitation (inviter, or owner or admin of the room)")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "Invitation revoked")
    @DeleteMapping("/invitations/{id}")
    public ResponseEntity<Void> revoke(@CurrentUser UserPrincipal user, @PathVariable String id) {
        invitationService.revoke(id, user.userId());
        return ResponseEntity.noContent().build();
    }
}
