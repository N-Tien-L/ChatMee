package com.lnt.chatmee.exception;

import com.lnt.chatmee.controller.ChatRoomController;
import com.lnt.chatmee.service.ChatRoomService;
import com.lnt.chatmee.service.ParticipantService;
import com.lnt.chatmee.util.OAuthUtil;
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
        mvc = MockMvcBuilders.standaloneSetup(new ChatRoomController(rooms, participants, mock(OAuthUtil.class)))
                .setCustomArgumentResolvers(new org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    private ResultActions roomFailure(RuntimeException exception, int status, String code) throws Exception {
        when(rooms.getChatRoomById(null, null, "room")).thenThrow(exception);
        return check(mvc.perform(get("/api/v1/chatrooms/room")), status, code);
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
                .when(participants).joinRoom("room", null, null);
        check(mvc.perform(post("/api/v1/chatrooms/room/join")), 409, "ALREADY_PARTICIPANT");
    }

    @Test
    void joinRoom_fullRoom_returns409Problem() throws Exception {
        doThrow(new RoomCapacityExceededException("Room full")).when(participants).joinRoom("room", null, null);
        check(mvc.perform(post("/api/v1/chatrooms/room/join")), 409, "ROOM_FULL");
    }

    @Test
    void createRoom_invalidFields_returns400WithFieldErrors() throws Exception {
        check(mvc.perform(post("/api/v1/chatrooms/create").contentType(MediaType.APPLICATION_JSON)
                .content("{\"maxUsers\":0}")), 400, "VALIDATION_FAILED")
                .andExpect(jsonPath("$.errors[?(@.field == 'maxUsers')]").isNotEmpty())
                .andExpect(jsonPath("$.errors[?(@.field == 'roomType')]").isNotEmpty());
        verifyNoInteractions(rooms);
    }

    @Test
    void createRoom_invalidName_returns400Problem() throws Exception {
        when(rooms.createRoom(any(), isNull(), isNull())).thenAnswer(invocation -> {
            com.lnt.chatmee.dto.request.CreateChatRoomRequest request = invocation.getArgument(0);
            com.lnt.chatmee.util.ValidationUtil.validateRoomName(request.getRoomName(), true);
            return null;
        });
        check(mvc.perform(post("/api/v1/chatrooms/create").contentType(MediaType.APPLICATION_JSON)
                .content("{\"roomType\":\"PUBLIC\",\"roomName\":\"bad!\"}")), 400, "INVALID_ARGUMENT");
    }

    @Test
    void createRoom_malformedJson_returns400Problem() throws Exception {
        check(mvc.perform(post("/api/v1/chatrooms/create").contentType(MediaType.APPLICATION_JSON)
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
        var userMvc = MockMvcBuilders.standaloneSetup(new com.lnt.chatmee.controller.UserApiController(userService))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        check(userMvc.perform(get("/api/v1/users/missing")), 404, "USER_NOT_FOUND");
    }

    @Test
    void getCurrentUser_missingDatabaseUser_returns404Problem() throws Exception {
        var users = mock(com.lnt.chatmee.repository.UserRepository.class);
        var principal = mock(org.springframework.security.oauth2.core.user.OAuth2User.class);
        var resolver = new org.springframework.web.method.support.HandlerMethodArgumentResolver() {
            public boolean supportsParameter(org.springframework.core.MethodParameter parameter) {
                return parameter.getParameterType() == org.springframework.security.oauth2.core.user.OAuth2User.class;
            }
            public Object resolveArgument(org.springframework.core.MethodParameter parameter,
                    org.springframework.web.method.support.ModelAndViewContainer container,
                    org.springframework.web.context.request.NativeWebRequest request,
                    org.springframework.web.bind.support.WebDataBinderFactory binder) {
                return principal;
            }
        };
        var authMvc = MockMvcBuilders.standaloneSetup(new com.lnt.chatmee.controller.AuthApiController(
                users, mock(OAuthUtil.class), mock(com.lnt.chatmee.security.WsTokenService.class)))
                .setCustomArgumentResolvers(resolver).setControllerAdvice(new GlobalExceptionHandler()).build();
        check(authMvc.perform(get("/api/v1/auth/me")), 404, "USER_NOT_FOUND");
        check(authMvc.perform(get("/api/v1/auth/user")), 404, "USER_NOT_FOUND");
    }

    @Test
    void getRoom_wrongMethod_returns405Problem() throws Exception {
        check(mvc.perform(patch("/api/v1/chatrooms/room")), 405, "INVALID_ARGUMENT");
    }
}
