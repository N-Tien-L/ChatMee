package com.lnt.chatmee.exception;

public class ChatRoomNotFoundException extends ChatMeeException {
    public ChatRoomNotFoundException(String message) {
        super(ErrorCode.ROOM_NOT_FOUND, message);
    }
}
