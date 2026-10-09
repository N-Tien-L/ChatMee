package com.lnt.chatmee.dto.validation;

import java.util.regex.Pattern;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class RoomNameValidator implements ConstraintValidator<RoomName, String> {

    private static final Pattern ALLOWED = Pattern.compile("^[\\p{L}0-9\\s._-]+$");

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) {
            return true;
        }
        String trimmed = value.trim();
        return trimmed.length() <= RoomName.MAX_LENGTH && ALLOWED.matcher(trimmed).matches();
    }
}
