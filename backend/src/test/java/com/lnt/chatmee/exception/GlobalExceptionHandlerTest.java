package com.lnt.chatmee.exception;

import com.lnt.chatmee.controller.ChatRoomController;
import com.lnt.chatmee.service.ChatRoomService;
import com.lnt.chatmee.service.ParticipantService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GlobalExceptionHandlerTest {
    private final ChatRoomService rooms = mock(ChatRoomService.class);
    private final ParticipantService participants = mock(ParticipantService.class);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new ChatRoomController(rooms, participants))
                .setCustomArgumentResolvers(new org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver())
                .setCustomArgumentResolvers((new org.springframework.web.method.support.HandlerMethodArgumentResolver() {
 public boolean supportsParameter(org.springframework.core.MethodParameter p) { return p.hasParameterAnnotation(com.lnt.chatmee.security.CurrentUser.class); }
 public Object resolveArgument(org.springframework.core.MethodParameter p, org.springframework.web.method.support.ModelAndViewContainer c, org.springframework.web.context.request.NativeWebRequest r, org.springframework.web.bind.support.WebDataBinderFactory f) { return com.lnt.chatmee.support.TestUsers.principal("u1"); }
 })).setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    private ResultActions roomFailure(RuntimeException exception, int status, String code) throws Exception {
        when(rooms.getChatRoomById("u1", "room")).thenThrow(exception);
        return check(mvc.perform(get("/api/v1/rooms/room")), status, code);
    }

    private ResultActions check(ResultActions result, int status, String code) throws Exception {
        return result.andExpect(status().is(status))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").isNotEmpty()).andExpect(jsonPath("$.title").isNotEmpty())
                .andExpect(jsonPath("$.status").value(status)).andExpect(jsonPath("$.detail").isNotEmpty())
                .andExpect(jsonPath("$.instance").isNotEmpty()).andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.errors").isArray());
    }

    @Test
    void getRoom_dailyLimitReached_returns429ProblemWithRetryAfter() throws Exception {
        roomFailure(new RateLimitExceededException(42), 429, "RATE_LIMITED")
                .andExpect(header().string("Retry-After", "42"));
    }

    @Test
    void getRoom_missingRoom_returns404Problem() throws Exception {
        roomFailure(new ChatRoomNotFoundException("Room not found"), 404, "ROOM_NOT_FOUND");
    }

    @Test
    void getRoom_forbidden_returns403Problem() throws Exception {
        roomFailure(new ForbiddenActionException("Access denied"), 403, "FORBIDDEN_ACTION");
    }

    @Test
    void getRoom_unauthorizedRoomAction_returns403Problem() throws Exception {
        roomFailure(new UnauthorizedRoomActionException("Only owner can edit"), 403, "FORBIDDEN_ACTION");
    }

    @Test
    void joinRoom_duplicateJoin_returns409Problem() throws Exception {
        doThrow(new UserAlreadyInRoomException("User is already in the room"))
                .when(participants).joinRoom("room", "u1");
        check(mvc.perform(post("/api/v1/rooms/room/members/me")), 409, "ALREADY_PARTICIPANT");
    }

    @Test
    void joinRoom_fullRoom_returns409Problem() throws Exception {
        doThrow(new RoomCapacityExceededException("Room full")).when(participants).joinRoom("room", "u1");
        check(mvc.perform(post("/api/v1/rooms/room/members/me")), 409, "ROOM_FULL");
    }

    @Test
    void createRoom_invalidFields_returns400WithFieldErrors() throws Exception {
        check(mvc.perform(post("/api/v1/rooms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"maxUsers\":0}")), 400, "VALIDATION_FAILED")
                .andExpect(jsonPath("$.errors[?(@.field == 'maxUsers')]").isNotEmpty())
                .andExpect(jsonPath("$.errors[?(@.field == 'roomType')]").isNotEmpty());
        verifyNoInteractions(rooms);
    }

    @Test
    void createRoom_invalidName_returns400Problem() throws Exception {
        check(mvc.perform(post("/api/v1/rooms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"roomType\":\"PUBLIC\",\"roomName\":\"bad!\"}")), 400, "VALIDATION_FAILED")
                .andExpect(jsonPath("$.errors[?(@.field == 'roomName')]").isNotEmpty());
        verifyNoInteractions(rooms);
    }

    @Test
    void createRoom_malformedJson_returns400Problem() throws Exception {
        check(mvc.perform(post("/api/v1/rooms").contentType(MediaType.APPLICATION_JSON)
                .content("{")), 400, "INVALID_ARGUMENT");
    }

    @Test
    void getRoom_unexpectedFailure_returnsGeneric500() throws Exception {
        roomFailure(new RuntimeException("sensitive-internal-value"), 500, "INTERNAL_ERROR")
                .andExpect(jsonPath("$.detail").value("An unexpected error occurred"));
    }

    @Test
    void getRoom_infrastructureFailure_returnsGeneric500() throws Exception {
        roomFailure(new DatabaseOperationException("Database failed", new IllegalStateException("internal")),
                500, "INTERNAL_ERROR")
                .andExpect(jsonPath("$.detail").value("An unexpected error occurred"));
    }

    @Test
    void getUser_missingUser_returns404InsteadOfSuccessEnvelope() throws Exception {
        var userService = mock(com.lnt.chatmee.service.UserService.class);
        when(userService.getUserSummary("missing")).thenThrow(new com.lnt.chatmee.exception.UserNotFoundException("Not found"));
        var userMvc = MockMvcBuilders.standaloneSetup(new com.lnt.chatmee.controller.UserApiController(userService,
                mock(com.lnt.chatmee.service.BlockService.class)))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        check(userMvc.perform(get("/api/v1/users/missing")), 404, "USER_NOT_FOUND");
    }

    @Test
    void getCurrentUser_missingDatabaseUser_returns404Problem() throws Exception {
        var users = mock(com.lnt.chatmee.service.UserService.class);
        when(users.getUserProfile("u1")).thenThrow(new com.lnt.chatmee.exception.UserNotFoundException("Not found"));
        var principal = com.lnt.chatmee.support.TestUsers.principal("u1");
        var resolver = new org.springframework.web.method.support.HandlerMethodArgumentResolver() {
            public boolean supportsParameter(org.springframework.core.MethodParameter parameter) {
                return parameter.getParameterType() == com.lnt.chatmee.security.UserPrincipal.class;
            }
            public Object resolveArgument(org.springframework.core.MethodParameter parameter,
                    org.springframework.web.method.support.ModelAndViewContainer container,
                    org.springframework.web.context.request.NativeWebRequest request,
                    org.springframework.web.bind.support.WebDataBinderFactory binder) {
                return principal;
            }
        };
        var authMvc = MockMvcBuilders.standaloneSetup(new com.lnt.chatmee.controller.AuthApiController(
                users, mock(com.lnt.chatmee.security.WsTokenService.class)))
                .setCustomArgumentResolvers(resolver).setControllerAdvice(new GlobalExceptionHandler()).build();
        check(authMvc.perform(get("/api/v1/auth/me")), 404, "USER_NOT_FOUND");
        check(authMvc.perform(get("/api/v1/auth/me")), 404, "USER_NOT_FOUND");
    }

    @Test
    void getRoom_wrongMethod_returns405Problem() throws Exception {
        check(mvc.perform(patch("/api/v1/rooms/room")), 405, "INVALID_ARGUMENT");
    }
}
