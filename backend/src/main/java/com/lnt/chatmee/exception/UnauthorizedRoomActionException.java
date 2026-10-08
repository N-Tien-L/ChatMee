package com.lnt.chatmee.exception;

public class UnauthorizedRoomActionException extends ChatMeeException {
    public UnauthorizedRoomActionException(String message) {
        super(ErrorCode.FORBIDDEN_ACTION, message);
    }
}
