package com.lnt.chatmee.model;

/** Lifecycle of a membership request; only {@code PENDING} rows can change. {@code REJECTED} is reserved for v1. */
public enum MembershipRequestStatus {
    PENDING,
    ACCEPTED,
    DECLINED,
    REVOKED,
    EXPIRED
}
