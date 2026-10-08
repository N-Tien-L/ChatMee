package com.lnt.chatmee.exception;

public class DuplicateResourceException extends ChatMeeException {
    public DuplicateResourceException(String message) {
        super(ErrorCode.DUPLICATE_RESOURCE, message);
    }
}
