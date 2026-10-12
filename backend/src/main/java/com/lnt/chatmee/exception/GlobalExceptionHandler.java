package com.lnt.chatmee.exception;

import java.net.URI;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    public static ProblemDetail problem(ErrorCode code, String detail, String path) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(code.getStatus(), detail);
        problem.setType(URI.create("urn:chatmee:error:" + code.getCode().toLowerCase(java.util.Locale.ROOT).replace('_', '-')));
        problem.setTitle(code.getStatus().getReasonPhrase());
        problem.setInstance(URI.create(path));
        problem.setProperty("code", code.getCode());
        problem.setProperty("errors", List.of());
        return problem;
    }

    public static void writeProblem(ObjectMapper mapper, HttpServletRequest request,
            HttpServletResponse response, ErrorCode code, String detail) throws IOException {
        response.setStatus(code.getStatus().value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), problem(code, detail, request.getRequestURI()));
    }

    @ExceptionHandler(ChatMeeException.class)
    public ResponseEntity<Object> handleDomain(ChatMeeException ex, WebRequest request) {
        return response(ex.getErrorCode(), ex.getMessage(), request);
    }

    @ExceptionHandler(java.lang.IllegalArgumentException.class)
    public ResponseEntity<Object> handleInvalidArgument(java.lang.IllegalArgumentException ex, WebRequest request) {
        return response(ErrorCode.INVALID_ARGUMENT, "Invalid request argument", request);
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<Object> handleRateLimited(RateLimitExceededException ex, WebRequest request) {
        return ResponseEntity.status(ex.getErrorCode().getStatus()).contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .body(problem(ex.getErrorCode(), ex.getMessage(), path(request)));
    }

    @ExceptionHandler(org.springframework.security.core.AuthenticationException.class)
    public ResponseEntity<Object> handleUnauthenticated(org.springframework.security.core.AuthenticationException ex, WebRequest request) {
        return response(ErrorCode.UNAUTHENTICATED, "Authentication required", request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Object> handleAccessDenied(AccessDeniedException ex, WebRequest request) {
        return response(ErrorCode.FORBIDDEN_ACTION, "Access denied", request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnexpected(Exception ex, WebRequest request) {
        log.error("Unhandled API failure", ex);
        return response(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred", request);
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ErrorCode code = status.is5xxServerError() ? ErrorCode.INTERNAL_ERROR : ErrorCode.INVALID_ARGUMENT;
        String detail = status.is5xxServerError() ? "An unexpected error occurred" : "Invalid request";
        if (status.is5xxServerError()) log.error("Unhandled API failure", ex);
        ProblemDetail problem = problem(code, detail, path(request));
        problem.setStatus(status.value());
        problem.setTitle(HttpStatus.valueOf(status.value()).getReasonPhrase());
        if (ex instanceof MethodArgumentNotValidException validation) {
            problem = problem(ErrorCode.VALIDATION_FAILED, "Request validation failed", path(request));
            problem.setProperty("errors", validation.getBindingResult().getFieldErrors().stream()
                    .map(error -> Map.of("field", error.getField(), "message",
                            error.getDefaultMessage() == null ? "Invalid value" : error.getDefaultMessage()))
                    .toList());
        }
        HttpHeaders responseHeaders = new HttpHeaders();
        responseHeaders.putAll(headers);
        responseHeaders.setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        return new ResponseEntity<>(problem, responseHeaders, status);
    }

    private ResponseEntity<Object> response(ErrorCode code, String detail, WebRequest request) {
        return ResponseEntity.status(code.getStatus()).contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem(code, detail, path(request)));
    }

    private String path(WebRequest request) {
        return ((ServletWebRequest) request).getRequest().getRequestURI();
    }
}
