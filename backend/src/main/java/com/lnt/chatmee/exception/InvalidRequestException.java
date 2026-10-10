package com.lnt.chatmee.exception;

public class InvalidRequestException extends ChatMeeException {
    public InvalidRequestException(String message) {
        super(ErrorCode.INVALID_ARGUMENT, message);
    }
}
