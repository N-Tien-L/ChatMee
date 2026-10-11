package com.lnt.chatmee.service;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import com.lnt.chatmee.exception.InvalidRequestException;

/** Opaque base64url codec for the stored (createdAt epoch millis, message id) boundary. */
public record MessageCursor(Instant createdAt, String messageId) {
    public String encode() {
        String boundary = createdAt.toEpochMilli() + ":" + messageId;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(boundary.getBytes(StandardCharsets.UTF_8));
    }

    public static MessageCursor decode(String encoded) {
        if (encoded == null) {
            return null;
        }
        try {
            if (!encoded.matches("[A-Za-z0-9_-]+")) {
                throw new IllegalArgumentException("Invalid base64url");
            }
            byte[] bytes = Base64.getUrlDecoder().decode(encoded);
            String boundary = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
            int separator = boundary.indexOf(':');
            if (separator < 1 || separator == boundary.length() - 1) {
                throw new IllegalArgumentException("Missing boundary");
            }
            long millis = Long.parseLong(boundary.substring(0, separator));
            String id = boundary.substring(separator + 1);
            if (id.isBlank()) {
                throw new IllegalArgumentException("Missing message id");
            }
            MessageCursor cursor = new MessageCursor(Instant.ofEpochMilli(millis), id);
            if (!cursor.encode().equals(encoded)) {
                throw new IllegalArgumentException("Noncanonical cursor");
            }
            return cursor;
        } catch (IllegalArgumentException | CharacterCodingException malformed) {
            // Do not include untrusted cursor text in error messages or logs.
            throw new InvalidRequestException("Malformed message cursor");
        }
    }
}
