package com.lnt.chatmee.model;

/**
 * Consent state of a room (SPEC-009 AC-009-9, ADR-0006). A DM starts {@code REQUESTED} with only the sender as member
 * and becomes {@code ACTIVE} when the recipient accepts or replies. A missing stored value reads as {@code ACTIVE}.
 */
public enum RoomState {
    ACTIVE,
    REQUESTED
}
