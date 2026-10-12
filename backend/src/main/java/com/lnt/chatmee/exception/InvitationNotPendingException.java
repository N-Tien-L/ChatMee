package com.lnt.chatmee.exception;

public class InvitationNotPendingException extends ChatMeeException {
    public InvitationNotPendingException(String message) {
        super(ErrorCode.INVITATION_NOT_PENDING, message);
    }
}
