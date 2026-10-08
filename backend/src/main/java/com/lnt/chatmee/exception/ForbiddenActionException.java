package com.lnt.chatmee.exception;

public class ForbiddenActionException extends ChatMeeException {
    public ForbiddenActionException(String message) {
        super(ErrorCode.FORBIDDEN_ACTION, message);
    }
}
