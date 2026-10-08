package com.lnt.chatmee.exception;

public class RoomCapacityExceededException extends ChatMeeException {
    public RoomCapacityExceededException(String message) {
        super(ErrorCode.ROOM_FULL, message);
    }
}
