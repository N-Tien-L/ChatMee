package com.lnt.chatmee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import com.lnt.chatmee.security.CurrentUser;
import com.lnt.chatmee.security.UserPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lnt.chatmee.dto.response.ApiResponse;
import com.lnt.chatmee.dto.response.MessagePageResponse;
import com.lnt.chatmee.exception.ErrorCode;
import com.lnt.chatmee.exception.GlobalExceptionHandler;
import com.lnt.chatmee.exception.InvalidRequestException;
import com.lnt.chatmee.service.MessageService;

import lombok.RequiredArgsConstructor;

@RestController
@Tag(name = "Messages", description = "Message history")
@RequestMapping("/api/v1/rooms/{roomId}/messages")
@RequiredArgsConstructor
public class MessageController {


    private final MessageService messageService;

    @Operation(summary = "Get a page of message history for a room the caller belongs to")
    @GetMapping
    public ResponseEntity<ApiResponse<MessagePageResponse>> getMessages(
            @PathVariable String roomId,
            @CurrentUser UserPrincipal user,
            @RequestParam(required = false) String before,
            @RequestParam(defaultValue = "50") int limit) {

        MessagePageResponse page = messageService.getMessages(roomId, user.userId(), before, limit);

        return ResponseEntity.ok(ApiResponse.success(page));
    }

    /** Cursor validation uses the fixed history contract without altering global error mapping. */
    @ExceptionHandler(InvalidRequestException.class)
    public ResponseEntity<ProblemDetail> handleMalformedCursor(InvalidRequestException exception,
            HttpServletRequest request) {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(GlobalExceptionHandler.problem(ErrorCode.VALIDATION_FAILED,
                        exception.getMessage(), request.getRequestURI()));
    }
}
