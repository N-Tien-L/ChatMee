package com.lnt.chatmee.exception;

public class InvitationNotFoundException extends ChatMeeException {
    public InvitationNotFoundException(String message) {
        super(ErrorCode.INVITATION_NOT_FOUND, message);
    }
}
