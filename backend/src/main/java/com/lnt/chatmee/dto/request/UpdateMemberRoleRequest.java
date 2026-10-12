package com.lnt.chatmee.dto.request;

import com.lnt.chatmee.model.Participant.Role;

import jakarta.validation.constraints.NotNull;

/** Target role of a member; the owner role cannot be assigned here (checked by the service, AC-009-23). */
public record UpdateMemberRoleRequest(@NotNull(message = "Role is required") Role role) {
}
