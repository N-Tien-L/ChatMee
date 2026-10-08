package com.lnt.chatmee.exception;

public class UserAlreadyInRoomException extends ChatMeeException {
    public UserAlreadyInRoomException(String message) {
        super(ErrorCode.ALREADY_PARTICIPANT, message);
    }
}
