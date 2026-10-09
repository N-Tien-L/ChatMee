package com.lnt.chatmee.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class StompError {
    private String tempId;
    /** ErrorCode name (e.g. RATE_LIMITED, VALIDATION_FAILED, FORBIDDEN_ACTION, INTERNAL_ERROR). */
    private String code;
    private String message;
}