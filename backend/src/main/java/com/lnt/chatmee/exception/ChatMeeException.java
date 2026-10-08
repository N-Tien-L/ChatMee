package com.lnt.chatmee.exception;

public abstract class ChatMeeException extends RuntimeException {
    private final ErrorCode errorCode;

    protected ChatMeeException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() { return errorCode; }
}
