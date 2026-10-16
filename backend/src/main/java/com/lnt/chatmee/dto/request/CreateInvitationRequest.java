package com.lnt.chatmee.dto.request;

import jakarta.validation.constraints.NotBlank;

/** The invitee only; the inviter is always the authenticated caller. */
public record CreateInvitationRequest(@NotBlank String userId) {
}
