package com.lnt.chatmee.exception;

/** The sender of a REQUESTED DM already sent the one allowed message (AC-009-10). */
public class DmRequestPendingException extends ChatMeeException {
    public DmRequestPendingException(String message) {
        super(ErrorCode.DM_REQUEST_PENDING, message);
    }
}
