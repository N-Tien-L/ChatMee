package com.lnt.chatmee.dto.response;

import lombok.Builder;

@Builder
public record UserSummaryResponse(String id, String name, String avatarUrl) {
}
