# ChatMee: Kế hoạch sửa và cải thiện

> Dựa trên `AUDIT_REPORT.md` (ID lỗi C-*, H-*, M-*, Q-*, F-*, A-*, D-*, P-*, R-*) và `SPEC_DRIVEN_SETUP.md`.
> Mỗi ticket có thể làm độc lập, mỗi ticket là một PR, trừ khi có ghi "Depends on".
> Ước lượng: **S** ≈ 2–4 giờ · **M** ≈ 0,5–2 ngày · **L** > 2 ngày.
> 🎯 = ticket giúp **trả lời câu hỏi phỏng vấn** (Java, OOP, design pattern, JUnit/Mockito, Spring Security). Nên ưu tiên làm các ticket này.

---

## Tổng quan

| Giai đoạn | Mục tiêu | Số ticket | Ước lượng |
|---|---|---|---|
| **0: Làm ngay** | Vá lỗ hổng Critical, chạy được bằng một lệnh, dọn repo | 13 | **3,5–4,5 ngày** (riêng phần "bắt buộc trước tiên" CM-001…004: **1,5–2 ngày**) |
| **1: Nền tảng chất lượng** | Test cốt lõi, CI, xử lý lỗi, validation, OpenAPI, toàn vẹn dữ liệu | 12 | **6–8 ngày** |
| **2: Refactor và hoàn thiện** | Design pattern, frontend realtime ổn định, README chuyên nghiệp | 15 | 8–12 ngày |
| **3: Tính năng mới (tùy chọn)** | Read receipt, upload file, tìm kiếm tin nhắn… theo spec-driven | 5+ | tùy chọn |

> Bạn dự kiến 1–2 ngày cho Giai đoạn 0. Con số đó thực tế chỉ đủ cho nhóm vá bảo mật bắt buộc. Riêng việc xác thực WebSocket (CM-003, CM-004) đã mất khoảng 2 ngày nếu làm đúng và có test đi kèm.

---

## Giai đoạn 0: Làm ngay (sửa Critical/bảo mật, chạy được bằng một lệnh)

Thứ tự đề xuất: CM-001 → CM-002 → CM-005 → CM-009 → CM-003 → CM-004 → các ticket còn lại.

### CM-001 · security · Đóng `/actuator/env` và rotate secret · **S** · P0 · 🎯 Spring Security
- **Mục tiêu:** chặn lộ secret (C-1).
- **File:** `backend/src/main/resources/application.properties`, `config/SecurityConfig.java`, `README.md:125`.
- **AC:**
  - [ ] `management.endpoints.web.exposure.include=health,info`, bỏ `show-values`.
  - [ ] `SecurityConfig` chỉ `permitAll` cho `/actuator/health/**` và `/actuator/info`.
  - [ ] Test `ActuatorSecurityTest`: `/actuator/env` trả 404, `/actuator/health` trả 200.
  - [ ] **(Việc bạn tự làm trên dashboard)** Rotate Google/GitHub client secret, mật khẩu Atlas, mật khẩu Upstash; cập nhật biến môi trường trên Render; xem log truy cập.
- **Phỏng vấn:** giải thích thứ tự của `SecurityFilterChain`, `requestMatchers`, và vì sao `permitAll` cho Actuator là nguy hiểm.

### CM-002 · security/build · Vá dependency có CVE · **S** · P0
- **Mục tiêu:** xử lý C-4, P-1…P-4.
- **File:** `frontend/package.json`, `frontend/package-lock.json`, `backend/pom.xml`.
- **AC:**
  - [ ] `next` và `eslint-config-next` lên bản 15.5.x mới nhất (≥ 15.5.27); `axios` ≥ 1.20; chạy `npm audit fix` (không dùng `--force`).
  - [ ] `npm audit --omit=dev` không còn lỗ hổng critical. Các lỗ hổng high còn lại được ghi lý do.
  - [ ] `spring-boot-starter-parent` lên 3.5.16.
  - [ ] Xóa dependency thừa: `validation-api`, `spring-boot-starter-data-jpa`, `spring-boot-starter-thymeleaf` cùng `templates/*.html`, `react-resizable-panels`, và một trong hai `motion`/`framer-motion`.
  - [ ] Build, lint và smoke test (đăng nhập, gửi tin) vẫn chạy được.

### CM-003 · security · Xác thực STOMP CONNECT, lấy người gửi từ Principal · **M** · P0 · 🎯 Spring Security
- **Mục tiêu:** xử lý C-2. Theo ADR-0004 (chờ bạn chọn phương án A hay B).
- **File (phương án A):** `security/WsTokenService.java` (mới), `web/AuthController` (thêm `POST /api/v1/auth/ws-token`), `websocket/AuthChannelInterceptor.java` (mới), `config/WebSocketConfig.java`, `controller/ChatWebSocketController.java`, `dto/request/ChatMessageRequest.java` (bỏ `senderId`/`senderName`), `frontend/hooks/useWebSocket.ts` (lấy token trước khi connect, dùng `beforeConnect`).
- **AC:**
  - [ ] CONNECT không token hoặc token sai trả frame ERROR và đóng kết nối. Token dùng một lần, TTL 60 giây, lưu trong Redis.
  - [ ] `sendMessage` và `addUser` lấy user từ `Principal`; `senderId` trong payload (nếu có) bị bỏ qua.
  - [ ] `SecurityConfig` vẫn `permitAll` cho `/ws/**` ở tầng HTTP (handshake), còn xác thực thực hiện ở tầng STOMP. Có ghi chú lý do trong code.
  - [ ] Test: `AuthChannelInterceptorTest` (unit, Mockito); `StompAuthIT` (`WebSocketStompClient` + Testcontainers): không token bị từ chối, có token thì gửi được và tin được lưu với đúng `senderId`.
  - [ ] Script probe trong audit (§4 của AUDIT_REPORT) không còn giả danh được.
- **Phỏng vấn:** `ChannelInterceptor`, `StompHeaderAccessor.setUser`, khác biệt giữa xác thực ở handshake và ở frame CONNECT, vì sao không được tin dữ liệu do client gửi.

### CM-004 · security · Phân quyền SUBSCRIBE/SEND, kênh lỗi riêng cho từng user, presence/typing lấy từ Principal · **M** · P0 · 🎯 Spring Security
- **Depends on:** CM-003
- **Mục tiêu:** xử lý C-3, C-5, H-9.
- **File:** `websocket/AuthChannelInterceptor.java` (hoặc `@EnableWebSocketSecurity` + `AuthorizationManager<Message<?>>`), `config/WebSocketConfig.java` (`setUserDestinationPrefix("/user")`), `ChatWebSocketController.java`, `PresenceWebSocketController.java`, `TypingController.java`, `PresenseController.java` (xóa `POST /presence/offline`), `frontend/hooks/useWebSocket.ts`, `docs/design/websocket-protocol.md`.
- **AC:**
  - [ ] SUBSCRIBE `/topic/public/{roomId}` và `/topic/typing/{roomId}` bị từ chối nếu user không phải thành viên. Đổi tên thành `/topic/rooms/{id}` sẽ làm trong CM-042.
  - [ ] Lỗi gửi tin đi tới `/user/queue/errors` của riêng người gửi; xóa `/topic/errors/{roomId}`.
  - [ ] `/app/presence` và `/app/typing` bỏ qua `userId` trong payload; typing kiểm tra thành viên phòng.
  - [ ] Test unit cho quy tắc phân quyền và IT: user B subscribe phòng của A thì bị từ chối.

### CM-005 · docs/chore · Dọn repo, thay `WARP.md` bằng `CLAUDE.md` · **S** · P0
- **Mục tiêu:** xử lý R-2, T-1 (phần file rỗng).
- **File:** xóa `WARP.md`, `backend/HELP.md`, 3 file test 0 byte, `backend/src/main/resources/templates/`, `frontend/README.md` mặc định, `frontend/public/*.svg` không dùng; quyết định về `.github/prompts/` và các workflow rỗng (chưa track). Tạo `CLAUDE.md` theo bản nháp trong SPEC_DRIVEN_SETUP §2.
- **AC:**
  - [ ] Không còn file 0 byte hay file mặc định do template sinh ra.
  - [ ] `CLAUDE.md` có đủ: lệnh, ranh giới module, quy ước, quy trình, danh sách việc cấm.

### CM-006 · refactor · Sửa tên sai chính tả · **S** · P0 · 🎯 Clean code/OOP
- **Mục tiêu:** xử lý Q-6.
- **File:** `PresenseService` → `PresenceService`; `PresenseController` → `PresenceRestController` (hoặc gộp); `RedisPresenseSubcriber` → `RedisPresenceSubscriber`; `PRESENSE_CHANNEL`; "retrived", "occured"; tham số `principle` → `principal`; `fetchUSers`; biến `AuthenticatedUser`; field `PresenseService`.
- **AC:**
  - [ ] Grep `-i "presense|subcriber|retrived|occured|principle"` trả về 0 kết quả.
  - [ ] Build và test xanh. Commit chỉ chứa việc đổi tên.

### CM-007 · fix · Bật Bean Validation (Jakarta) · **S** · P0 · 🎯 Spring
- **Mục tiêu:** xử lý C-7.
- **File:** `pom.xml` (`spring-boot-starter-validation`), `dto/request/*.java` (import `jakarta.validation`), `ChatRoomController` (`@Valid`), `ChatWebSocketController` (`@Validated` + `@Valid @Payload`).
- **AC:**
  - [ ] `@WebMvcTest`: `maxUsers=0` trả 400; `roomType=null` trả 400; tên dài 101 ký tự trả 400.
  - [ ] Tin nhắn STOMP dài 5001 ký tự bị từ chối, người gửi nhận lỗi.

### CM-008 · security · Chặn join phòng PRIVATE/DM và chặn leo thang role · **S** · P0 · 🎯 Spring Security / OOP
- **Mục tiêu:** xử lý H-2, M-3.
- **File:** `ParticipantService.java`, `ChatRoomController.java:142-177` (chuyển logic phân quyền vào service).
- **AC:**
  - [ ] Join phòng PRIVATE hoặc DM trả 403. Join phòng PUBLIC vẫn chạy.
  - [ ] ADMIN không gán được ADMIN hay OWNER. Không ai gán được OWNER qua `add-participant`.
  - [ ] Unit test cho từng nhánh (`ParticipantServiceTest`).

### CM-009 · devex · Chạy local bằng một lệnh: `compose.yaml` và `.env.example` · **S–M** · P0
- **Mục tiêu:** xử lý D-1.
- **File:** `compose.yaml` (mongo:7, redis:7, healthcheck; profile `full` thêm backend), `backend/.env.example` (đầy đủ khóa, không có giá trị thật), `frontend/.env.example`, `application-local.properties` (hoặc dùng `spring-boot-docker-compose`), `spring.config.import=optional:file:.env[.properties]`, `src/test/resources/application-test.properties`, `Makefile` hoặc `scripts/dev.sh` (tùy chọn).
- **AC:**
  - [ ] Từ máy mới: `docker compose up -d && cd backend && ./mvnw spring-boot:run` khởi động thành công khi chỉ cần điền OAuth client.
  - [ ] Bật `spring.data.mongodb.auto-index-creation=true` cho profile local/test (hoặc dùng migration).
  - [ ] Sửa các hướng dẫn sai trong README (`README.md:56,63,81`).

### CM-010 · security · Gỡ log nhạy cảm, dọn cookie/CSRF · **S** · P0
- **Mục tiêu:** xử lý H-1, H-3.
- **File:** `OAuth2AuthenticationSuccessHandler.java` (bỏ log session ID; hoặc xóa class và dùng `defaultSuccessUrl`), `CustomOAuth2UserService.java`, `ChatWebSocketController.java` (log), `application-dev.properties:9`, `config/CookieConfig.java` (xóa), `SecurityConfig.java` (bật CSRF bằng `CookieCsrfTokenRepository`, logout dùng POST), `frontend/lib/api/apiClient.ts` (`xsrfCookieName`/`xsrfHeaderName`), `authApi.ts` (logout dùng POST), `useWebSocket.ts:54` (chỉ bật debug khi dev).
- **AC:**
  - [ ] Grep log không còn session ID, email hay nội dung tin nhắn.
  - [ ] POST không kèm CSRF token trả 403. Frontend vẫn hoạt động.
  - [ ] Production chỉ còn một cấu hình SameSite (`Lax`).

### CM-011 · fix · Sửa luồng presence qua Redis (vá tối thiểu) · **S** · P0
- **Mục tiêu:** xử lý phần cấp bách của C-6. Thiết kế lại hoàn chỉnh ở CM-043.
- **File:** `RedisConfig.java`, `RedisPresencePublisher.java` (dùng chung hằng số channel), `PresenceEventListener.java` (lấy user từ `event.getUser()`, bỏ `requireNonNull`).
- **AC:**
  - [ ] `PUBSUB CHANNELS` khớp với channel publisher dùng; không còn NPE trong log khi connect/disconnect.
  - [ ] Test unit cho listener (Principal null hoặc có giá trị).

### CM-012 · fix · Lint frontend xanh · **S** · P0
- **File:** `hooks/useRoomMessage.ts:56` (thay `any` bằng `unknown` + type guard), `tailwind.config.ts:85` (dùng `import`), xóa các biến không dùng được báo trong lint.
- **AC:** `npm run lint` trả exit 0, không còn error.

### CM-013 · fix · Đổi phòng không còn lẫn tin · **S** · P0
- **Mục tiêu:** xử lý H-10 (vá nhanh; refactor hoàn chỉnh ở CM-045).
- **File:** `hooks/useRoomMessage.ts:95`, `hooks/useWebSocket.ts` (`unsubscribe` theo đúng destination), `app/dashboard/page.tsx:141` (`key={roomId}`).
- **AC:**
  - [ ] Mở phòng A rồi chuyển sang phòng B, sau đó có tin mới trong phòng A: tin đó không hiện trong khung của phòng B (test thủ công, kèm GIF trong PR).

---

## Giai đoạn 1: Nền tảng chất lượng (khoảng 1 tuần)

### CM-020 · test · Hạ tầng test · **S–M** · 🎯 JUnit
- **File:** `pom.xml` (Testcontainers `mongodb`, `junit-jupiter`, `org.testcontainers:testcontainers` cho Redis qua `GenericContainer`; `jacoco-maven-plugin`; tách surefire/failsafe cho `*IT`), `src/test/.../support/ContainersConfig.java` (`@ServiceConnection`), `frontend`: Vitest + React Testing Library + jsdom.
- **AC:**
  - [ ] `./mvnw verify` chạy cả unit test lẫn IT, có báo cáo JaCoCo.
  - [ ] `contextLoads` xanh nhờ Testcontainers.
  - [ ] `npm test` chạy được.

### CM-021 · test · Unit test tầng service (JUnit 5 + Mockito) · **M** · 🎯 JUnit/Mockito
- **Depends on:** CM-020
- **Phạm vi:** `ChatRoomServiceTest`, `ParticipantServiceTest`, `MessageServiceTest`, `RateLimitingServiceTest`, `AuthChannelInterceptorTest`.
- **AC:**
  - [ ] Phủ các test case #3, #5, #6, #7, #9 (phần unit), #10 (phần unit), #11 trong danh sách 13 test (AUDIT_REPORT §3.5).
  - [ ] Dùng `@ExtendWith(MockitoExtension.class)`, `ArgumentCaptor`, `verify(..., never())`, `assertThatThrownBy`.
  - [ ] Coverage dòng của package `service` ≥ 80%.
- **Phỏng vấn:** khác biệt giữa mock và stub và spy, `@Mock` và `@MockBean`, vì sao thiết kế dùng constructor injection thì dễ test hơn.

### CM-022 · test · Test slice controller `@WebMvcTest` + bảo mật · **M** · 🎯 JUnit/Spring Security
- **Depends on:** CM-020, CM-024
- **AC:**
  - [ ] Có `ChatRoomControllerWebMvcTest`, `MessageControllerWebMvcTest`, `AuthControllerWebMvcTest`, dùng `MockMvc` + `oauth2Login()`.
  - [ ] Kiểm tra status 201/400/401/403/404/409 và schema của `ProblemDetail` (test #8, #12).

### CM-023 · test · Integration test WebSocket và Mongo · **M**
- **Depends on:** CM-003, CM-004, CM-020
- **AC:**
  - [ ] `StompMessagingIT`: CONNECT kèm token, SUBSCRIBE, SEND, nhận tin; tin được lưu (test #1, #2).
  - [ ] `ParticipantRepositoryIT` (`@DataMongoTest`): unique index chặn bản ghi trùng.
  - [ ] `ActuatorSecurityIT` (test #4).

### CM-024 · refactor · Global exception handler dùng `ProblemDetail` · **M** · 🎯 OOP (hierarchy exception), Spring
- **Mục tiêu:** xử lý H-7, H-8, A-2, A-3.
- **File:** `exception/` (xóa `IllegalArgumentException` tự định nghĩa; tạo `ChatMeeException` trừu tượng kèm `ErrorCode` enum gồm `HttpStatus` và mã lỗi; các lớp con), `GlobalExceptionHandler` chuyển sang `@RestControllerAdvice` (hoặc kế thừa `ResponseEntityExceptionHandler`), `SecurityConfig` (entry point 401 cho `/api/**`, `AccessDeniedHandler` trả 403 JSON), bỏ các khối `try/catch(Exception)` trong controller và service.
- **AC:**
  - [ ] Mọi lỗi API trả `application/problem+json` có các trường `type`, `title`, `status`, `detail`, `code`, `errors[]`.
  - [ ] Join phòng hai lần trả 409; tên phòng sai trả 400; chưa đăng nhập trả 401 (không redirect).
  - [ ] Frontend: interceptor axios bắt 401 để chuyển về `/login`, đọc `detail` để hiện toast.
- **Phỏng vấn:** checked và unchecked exception, thiết kế hierarchy exception, `@ControllerAdvice`.

### CM-025 · feat · Validation đầy đủ và custom constraint · **S** · 🎯 Java annotation/OOP
- **Depends on:** CM-007
- **AC:**
  - [ ] Constraint `@RoomName` (annotation kèm `ConstraintValidator`) thay cho `ValidationUtil.validateRoomName`.
  - [ ] Dùng validation group hoặc DTO riêng cho từng loại phòng: DM bắt buộc có `participantId`, nhóm bắt buộc có `name`.
  - [ ] Xóa `ValidationUtil` (hoặc chỉ giữ phần thực sự cần).

### CM-026 · docs · OpenAPI / Swagger UI · **S**
- **File:** `pom.xml` (`springdoc-openapi-starter-webmvc-ui`), `config/OpenApiConfig.java`, annotation `@Operation`/`@ApiResponse` cho controller; cho phép xem `/swagger-ui.html` ở profile dev (prod tùy bạn quyết định).
- **AC:**
  - [ ] Swagger UI liệt kê đủ endpoint kèm schema lỗi `ProblemDetail`.
  - [ ] README có link tới Swagger UI.
  - [ ] (Tùy chọn) Sinh type cho frontend bằng `openapi-typescript`.

### CM-027 · ci · GitHub Actions + Dependabot + CodeQL · **S**
- **File:** `.github/workflows/backend-ci.yml` (Temurin 17, cache Maven, `./mvnw -B verify`, upload báo cáo JaCoCo), `.github/workflows/frontend-ci.yml` (Node 20/22, `npm ci`, lint, tsc, test, build), `.github/dependabot.yml` (maven, npm, github-actions), `codeql.yml` (java, javascript). Lọc theo path cho từng workflow.
- **AC:**
  - [ ] PR chỉ merge được khi CI xanh (bật branch protection; việc này bạn tự cấu hình).
  - [ ] Badge CI hiển thị trong README.

### CM-028 · fix · Toàn vẹn dữ liệu thành viên phòng · **M** · 🎯 Concurrency
- **Mục tiêu:** xử lý C-8, M-5.
- **File:** `model/ChatRoom.java`, `model/Participant.java`, `ParticipantService`, `ChatRoomService`, `ChatmeeApplication.java` (bỏ exclude JPA), cấu hình index, và `docs/design/data-model.md` cùng ADR nếu đổi mô hình.
- **AC:**
  - [ ] Chỉ còn một nguồn sự thật về thành viên phòng (đề xuất: collection `participants` có unique index `(chatRoomId, userId)`; số thành viên duy trì bằng `$inc` có điều kiện `memberCount < maxMembers` trên document room).
  - [ ] Test đồng thời (IT): 20 luồng join một phòng có `max=10` thì đúng 10 lượt thành công.
  - [ ] Xóa `@Transactional` không có tác dụng, hoặc cấu hình `MongoTransactionManager` có chủ đích (ghi vào ADR).
  - [ ] Xóa phòng là xóa mềm, kèm dọn dẹp và broadcast sự kiện.
  - [ ] Bỏ `@PrePersist`/`@PreUpdate` của JPA; bật `@EnableMongoAuditing` cho `createdAt`/`updatedAt`.
- **Phỏng vấn:** race condition kiểu check-then-act, update nguyên tử, optimistic locking (`@Version`).

### CM-029 · fix · Lưu tin trước rồi mới broadcast, timestamp dùng `Instant`, phản hồi lỗi · **S**
- **Mục tiêu:** xử lý H-5, H-6, M-1, M-10.
- **AC:**
  - [ ] Tin được lưu xong mới broadcast; lỗi được báo về `/user/queue/errors`.
  - [ ] `createdAt` có kiểu `Instant`, serialize ISO-8601 có `Z`; frontend hiển thị đúng giờ local.
  - [ ] Frontend chuyển tin optimistic sang `failed` sau 10 giây; nút gửi không bị khóa vĩnh viễn.
  - [ ] JSON xuất `isUpdated`/`isDeleted` đúng tên trường mà frontend đọc.

### CM-030 · security · Rate limit đúng IP, có header, fail-open · **S–M**
- **Mục tiêu:** xử lý H-4.
- **AC:**
  - [ ] Header `X-Forwarded-For` giả không lách được giới hạn (test #11).
  - [ ] Response có `X-RateLimit-Limit/Remaining` và `Retry-After`; 429 trả `ProblemDetail`.
  - [ ] Redis không phản hồi thì request vẫn được phục vụ, kèm log WARN.
  - [ ] (Tùy chọn) Giới hạn tần suất gửi tin STOMP.
- **Phỏng vấn:** so sánh fixed window, sliding window và token bucket; nếu đổi sang Bucket4j thì có thể kể như một ví dụ về Strategy pattern.

### CM-031 · test · Test frontend cơ bản · **S** · 🎯 Testing
- **Depends on:** CM-020
- **AC:** test cho `messageReducer` (test #13), `messageUtils` và các action của `chatRoomsStore` (mock `chatRoomApi`).

---

## Giai đoạn 2: Refactor, frontend và README

| Ticket | Loại | Mô tả | Lỗi liên quan | Ước lượng | 🎯 |
|---|---|---|---|---|---|
| CM-040 | refactor | `UserPrincipal` chứa `userId` cùng `@CurrentUser` (`HandlerMethodArgumentResolver`); controller không còn inject repository; mapper (MapStruct) và DTO dạng `record` | M-6, Q-1, Q-2, Q-3, Q-4 | M | 🎯 Spring Security, SOLID (SRP, DIP) |
| CM-041 | refactor | **Strategy pattern** `RoomTypePolicy` (`DirectRoomPolicy`, `GroupRoomPolicy`) cho create, validateUpdate, canJoin, canLeave; dùng `Map<RoomType, RoomTypePolicy>` được inject; **Factory** cho việc tạo phòng | Q-5 | M | 🎯 Design pattern, OCP, đa hình |
| CM-042 | refactor | API theo resource: `/rooms`, `/rooms/{id}/members`, `/rooms/{id}/messages`; STOMP `/topic/rooms/{id}`; cập nhật OpenAPI và frontend | A-1, A-4 | M | |
| CM-043 | feat | Presence chạy được nhiều instance: đếm session trong Redis kèm TTL/heartbeat, fan-out qua Pub/Sub, thời gian ân hạn khi offline; ADR-0002 bản sửa đổi | C-6 | M | 🎯 Observer pattern, concurrency |
| CM-044 | feat | Phân trang lịch sử bằng cursor kèm index, sửa N+1 query; frontend cuộn lên để tải thêm | M-2 | M | |
| CM-045 | refactor | Frontend: một `StompProvider` duy nhất, subscribe lại sau reconnect, đồng bộ lại bằng `?after=`, banner trạng thái kết nối | H-11, F-1, F-2 | M | |
| CM-046 | feat | Trạng thái loading/error/empty, nút gửi lại tin, a11y (aria-label, `role="log"`, `aria-live`, label ẩn), kiểm tra responsive | F-4, F-5, F-10 | S–M | HTML/CSS/JS |
| CM-047 | feat | Tìm user ở server (`/users/search`), không trả email; xóa endpoint tra theo provider | M-4 | S | |
| CM-048 | feat | Khám phá phòng PUBLIC (`/rooms/discover`) kèm UI | Tính năng làm dở | M | |
| CM-049 | fix | Mỗi cặp user chỉ có một DM (`memberKey` unique), trả kèm thông tin của người kia | SPEC-003 | S | |
| CM-050 | docs | Viết lại README: GIF/ảnh chụp màn hình, sơ đồ kiến trúc đúng, mục "Design decisions" (liên kết ADR), "Security model", "Testing" (badge coverage), "Run locally in 3 commands", "What I learned" | R-1 | M | Quy trình phát triển |
| CM-051 | devops | Dockerfile: user không phải root, healthcheck `/actuator/health`, layered jar; log JSON có MDC (requestId, userId); xóa emoji khỏi log | D-3, D-4, M-9 | S | |
| CM-052 | build | (Tùy chọn) Nâng major: Spring Boot 4.x GA, Next 16, kèm ghi chú migration | P-4 | M–L | |
| CM-053 | refactor | Bỏ SockJS, dùng WebSocket thuần | P-3, ADR-0003 | S | |
| CM-054 | refactor | Gộp `lib/type` vào `lib/types`, cân nhắc sinh type từ OpenAPI; xóa `console.log`; middleware để guard route | Q-8, F-8, F-11 | S–M | TypeScript |

---

## Giai đoạn 3 (tùy chọn): Tính năng mới, mỗi tính năng đi theo quy trình spec-driven

Với mỗi tính năng, làm theo thứ tự: viết `SPEC-0xx` (Approved) → cập nhật `design/*` (và ADR nếu cần) → chia ticket → làm theo kiểu TDD → demo bằng GIF.

| Tính năng | Ghi chú thiết kế | Giá trị cho CV |
|---|---|---|
| **Read receipt và số tin chưa đọc** | `participants.lastReadMessageId`, sự kiện `/app/rooms/{id}/read`, badge trong danh sách phòng | Cao: bài toán realtime và data model hay |
| **Sửa/xóa tin nhắn** | Model đã có sẵn `isUpdated`/`isDeleted`; chỉ người gửi được sửa, có giới hạn thời gian | Trung bình, làm nhanh |
| **Upload file/ảnh** | Presigned URL (S3/R2/Cloudinary), kiểm tra loại và kích thước file, `Message.attachments` | Cao: bảo mật upload |
| **Tìm kiếm tin nhắn** | Mongo text index hoặc Atlas Search, chỉ tìm trong phòng mà user là thành viên | Trung bình |
| **Thông báo (notification)** | Web Push hoặc toast khi có tin ở phòng không đang mở | Trung bình |

---

## Bảng ưu tiên theo câu hỏi phỏng vấn

| Chủ đề nhà tuyển dụng hỏi | Ticket để có câu chuyện kể khi phỏng vấn | Câu hỏi bạn sẽ trả lời được |
|---|---|---|
| **Spring Security** | CM-001, CM-003, CM-004, CM-008, CM-010, CM-024 (401/403), CM-040 | "Filter chain hoạt động thế nào?", "Bảo vệ WebSocket ra sao?", "CSRF là gì, khi nào cần?", "Phân biệt 401 và 403", "Authentication và authorization khác nhau thế nào?" |
| **JUnit 5 / Mockito** | CM-020, CM-021, CM-022, CM-023 | "Mock và stub khác nhau thế nào?", "`@WebMvcTest` và `@SpringBootTest` khác nhau thế nào?", "Testcontainers dùng để làm gì?", "Kiểm tra một exception được ném ra như thế nào?" |
| **Design pattern** | CM-041 (Strategy, Factory), CM-043 (Observer/Pub-Sub), CM-024 (hierarchy exception), CM-030 (Strategy cho rate limit), Builder (Lombok) | "Kể một pattern bạn đã áp dụng và vì sao" |
| **OOP / SOLID** | CM-006, CM-024, CM-025, CM-040, CM-041 | "SRP và OCP thể hiện trong code của bạn thế nào?", "Đa hình thay cho `switch`?" |
| **Java core / concurrency** | CM-028 (race condition), CM-029 (async), CM-043 | "Race condition là gì, bạn xử lý thế nào?", "`ConcurrentHashMap`?", "`@Async` và thread pool?" |
| **HTML/CSS/JS** | CM-013, CM-045, CM-046 | "Xử lý reconnect WebSocket?", "Accessibility cơ bản?" |
| **Quy trình phát triển** | CM-005, CM-027, CM-050, toàn bộ SPEC_DRIVEN_SETUP | "Bạn làm việc theo quy trình nào?", "CI/CD?", "ADR là gì?" |

**Thứ tự gợi ý nếu thời gian có hạn (khoảng 2 tuần):** CM-001 → 002 → 005 → 009 → 003 → 004 → 006 → 007 → 008 → 020 → 024 → 021 → 022 → 027 → 041 → 050. Làm xong chuỗi này là có một repo an toàn, có test, có CI, có design pattern rõ ràng và README tốt.

---

## Câu hỏi cần bạn quyết định trước khi bắt đầu

1. **Production:** backend trên Render (`chatmee-wxvk.onrender.com`) có còn chạy không? Nếu còn thì phải rotate secret ngay (CM-001) và bạn cần tự kiểm tra `/actuator/env` trên prod. Audit không gọi vào prod.
2. **Xác thực WebSocket (ADR-0004):** chọn (A) token ngắn hạn qua `/auth/ws-token` (đề xuất), hay (B) dùng custom domain chung để cookie đi được qua handshake?
3. **Redis:** giữ mục tiêu "chạy được nhiều instance" (presence và tin nhắn fan-out qua Redis, CM-043), hay đơn giản hóa thành một instance và viết ADR nói rõ giới hạn đó?
4. **Thành viên phòng:** chọn nguồn sự thật là collection `participants` (đề xuất) hay mảng nhúng trong `chat_rooms`?
5. **Nâng major version** (Spring Boot 4, Next 16): làm ở giai đoạn 2, hay chỉ vá trong cùng major?
6. **Ngôn ngữ tài liệu** (README, spec, ADR, commit): tiếng Anh (đề xuất, phù hợp với CV) hay tiếng Việt?
7. **GitHub login:** giữ cả GitHub hay chỉ để Google cho gọn?
8. **`.github/prompts/` và 2 workflow rỗng (chưa track):** xóa, hay giữ chỗ để viết CI thật?
