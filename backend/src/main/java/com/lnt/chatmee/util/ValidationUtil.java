package com.lnt.chatmee.util;

import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

@Component
public class ValidationUtil {
    
    // UUID format validation pattern
    private static final Pattern UUID_PATTERN = Pattern.compile(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
    );
    
    /**
     * Validates if a string is a valid UUID format
     */
    public static boolean isValidUUID(String id) {
        if (id == null || id.trim().isEmpty()) {
            return false;
        }
        return UUID_PATTERN.matcher(id.trim()).matches();
    }
    
    /**
     * Validates if an ID is not null, not empty, and has valid format
     */
    public static boolean isValidId(String id) {
        if (id == null || id.trim().isEmpty()) {
            return false;
        }
        
        String trimmedId = id.trim();
        
        // Check length (reasonable bounds)
        if (trimmedId.length() < 1 || trimmedId.length() > 255) {
            return false;
        }
        
        // For UUIDs, validate format
        if (trimmedId.contains("-") && trimmedId.length() == 36) {
            return isValidUUID(trimmedId);
        }
        
        // For other IDs, allow alphanumeric and some special characters
        return trimmedId.matches("^[a-zA-Z0-9._-]+$");
    }
    
    /**
     * Sanitizes an ID by trimming whitespace
     */
    public static String sanitizeId(String id) {
        return id != null ? id.trim() : null;
    }
    
    /**
     * Validates and throws exception if ID is invalid
     */
    public static void validateId(String id, String fieldName) {
        if (!isValidId(id)) {
            throw new IllegalArgumentException(fieldName + " must be a valid identifier");
        }
    }
    
    /**
     * Validates room name for private/public rooms
     */
    public static void validateRoomName(String roomName, boolean isRequired) {
        if (isRequired && (roomName == null || roomName.trim().isEmpty())) {
            throw new IllegalArgumentException("Room name is required for this room type");
        }
        
        if (roomName != null && !roomName.trim().isEmpty()) {
            String trimmed = roomName.trim();
            if (trimmed.length() > 100) {
                throw new IllegalArgumentException("Room name cannot exceed 100 characters");
            }
            
            // Allow letters, numbers, spaces, and some special characters
            if (!trimmed.matches("^[a-zA-Z0-9\\s._-]+$")) {
                throw new IllegalArgumentException("Room name contains invalid characters");
            }
        }
    }
}
