package com.lnt.chatmee.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    ROOM_NOT_FOUND(HttpStatus.NOT_FOUND),
    USER_NOT_FOUND(HttpStatus.NOT_FOUND),
    FORBIDDEN_ACTION(HttpStatus.FORBIDDEN),
    ALREADY_PARTICIPANT(HttpStatus.CONFLICT),
    ROOM_FULL(HttpStatus.CONFLICT),
    DUPLICATE_RESOURCE(HttpStatus.CONFLICT),
    INVITATION_NOT_FOUND(HttpStatus.NOT_FOUND),
    INVITATION_NOT_PENDING(HttpStatus.CONFLICT),
    DM_REQUEST_PENDING(HttpStatus.CONFLICT),
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST),
    INVALID_ARGUMENT(HttpStatus.BAD_REQUEST),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus status;

    ErrorCode(HttpStatus status) { this.status = status; }

    public String getCode() { return name(); }
    public HttpStatus getStatus() { return status; }
}
