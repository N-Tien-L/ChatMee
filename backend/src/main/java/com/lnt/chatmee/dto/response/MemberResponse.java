package com.lnt.chatmee.dto.response;

import com.lnt.chatmee.model.Participant.Role;

public record MemberResponse(String id, String name, String avatarUrl, Role role) {}
