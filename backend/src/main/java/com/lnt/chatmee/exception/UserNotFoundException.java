package com.lnt.chatmee.exception;

public class UserNotFoundException extends ChatMeeException {
    public UserNotFoundException(String message) {
        super(ErrorCode.USER_NOT_FOUND, message);
    }
}
