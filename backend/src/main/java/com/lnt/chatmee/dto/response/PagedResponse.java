package com.lnt.chatmee.dto.response;

import java.util.List;

import lombok.Builder;

@Builder
public record PagedResponse<T>(
    List<T> content,
    int page,
    int size,
    long totalElements,
    int totalPages
) {}
