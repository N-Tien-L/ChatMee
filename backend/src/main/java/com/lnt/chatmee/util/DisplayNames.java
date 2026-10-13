package com.lnt.chatmee.util;

import com.lnt.chatmee.model.User;

/** Display names shared by every response that names a user (AC-009-28). */
public final class DisplayNames {

    /** Label for a user that no longer exists or has no name. */
    public static final String DELETED_USER = "Deleted user";

    private DisplayNames() {
    }

    public static String of(User user) {
        return user == null ? DELETED_USER : of(user.getName());
    }

    public static String of(String name) {
        return name == null || name.isBlank() ? DELETED_USER : name;
    }
}
