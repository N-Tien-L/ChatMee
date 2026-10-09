package com.lnt.chatmee.dto.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * Room display name: at most {@link #MAX_LENGTH} characters after trimming, made of Unicode letters
 * (including Vietnamese), digits, spaces and {@code . _ -}. {@code null} and blank values are valid;
 * combine with {@code @NotBlank} where a name is required.
 */
@Documented
@Constraint(validatedBy = RoomNameValidator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER })
@Retention(RetentionPolicy.RUNTIME)
public @interface RoomName {

    int MAX_LENGTH = 100;

    String message() default "Room name must be at most 100 characters of letters, digits, spaces, '.', '_' or '-'";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
