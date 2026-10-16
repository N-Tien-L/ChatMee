# ChatMee: Hướng dẫn review project (góc nhìn SWE)

Ngày lập: 2026-10-11, tại điểm dừng sau khi merge CM-044, CM-048, CM-050, CM-052, CM-058 vào `develop` (`d6ce0f3`).
Mục đích: checklist để owner tự review toàn bộ project từ business, thiết kế, dữ liệu, API, bảo mật, testing tới vận hành.

## 0. Trạng thái tại điểm dừng

- `develop` = `d6ce0f3`, đã push. Mọi ticket trong kế hoạch đã merge. Không có worker hay branch nào đang dở.
- `main` = `365cb84`: gồm đợt 1 (CM-048, CM-050, CM-058). **CM-044 và CM-052 chưa lên main.**
  - CM-044 đổi shape của response, còn CM-052 là nâng cấp major (Boot 4.1.1, Next 16.3.8). Cả hai phải deploy backend và frontend cùng lúc.
  - Chỉ merge main sau khi smoke test local full-stack (xem mục 12).
- Việc treo của owner, lấy từ `docs/plan/BOARD.md`:
  1. Đổi secret sau CM-001: Google/GitHub OAuth, mật khẩu Atlas, mật khẩu Upstash. Đây là việc quan trọng nhất.
  2. Backfill dữ liệu prod: `memberCount` (CM-028), `memberKey` cho DM cũ (CM-049). Script nằm trong `docs/ops/`.
  3. Duyệt specs SPEC-001..007 (một số còn Draft, CM-055).
  4. Smoke test local full-stack cho CM-044 và CM-052.
  5. File untracked `docs/audit/CM-003_WS_AUTH_FLOW_CONVERSATION_AUDIT.md`: quyết định giữ hay bỏ.

## 1. Business và yêu cầu

- **Problem statement và người dùng:** app giải quyết vấn đề gì, cho ai? Điểm khác biệt so với một "chat demo" là gì?
- **User story và Acceptance Criteria:** mỗi AC có đo được không, có test chứng minh không? Xem `docs/specs/SPEC-001..007`.
- **Non-goals và scope:** cái gì cố ý không làm (attachments, moderation, read receipts...), và vì sao.
- **Edge case và luồng lỗi:** người dùng gặp gì khi mạng rớt, phòng đầy, bị kick, phòng bị xóa?
- **Traceability:** đi từ spec sang ticket CM-xxx, sang commit, sang test. Xem `docs/plan/BOARD.md`, `docs/audit/IMPROVEMENT_PLAN.md`.

## 2. Kiến trúc và thiết kế hệ thống

- **Sơ đồ ngữ cảnh và các thành phần:** browser, Vercel (rewrites `/api`, `/oauth2`, `/login`, `/logout`), Render (Spring Boot, REST `/api/v1`, STOMP `/ws`), MongoDB, Redis.
- **Phân lớp và ranh giới module:** controller, service, repository; DTO (record) và entity. Vì sao controller không được gọi thẳng repository? Xem `AGENTS.md` §3.
- **ADR:** đọc `docs/adr/0001..0005` và tự hỏi mỗi quyết định đánh đổi cái gì, có phương án nào khác.
- **Design pattern đã dùng:** Strategy (`service/policy/*RoomPolicy`), interceptor/filter chain (`AuthChannelInterceptor`, `RoomSubscriptionInterceptor`, `RateLimitingFilter`), registry.
- **Stateful và stateless:** session cookie, session STOMP, presence trong Redis.
- **Mở rộng ngang (multi-instance):**
  - Presence đã chia sẻ qua Redis (CM-043).
  - **Broadcast tin nhắn của room vẫn chỉ trong một instance** (simple broker). Đây là giới hạn lớn nhất nếu chạy từ hai instance trở lên.

## 3. Mô hình dữ liệu và tính nhất quán

- Mô hình document trên MongoDB: embed hay reference. Xem `docs/design/data-model.md`.
- **Index:** unique `(chatRoomId, userId)`, `memberKey` sparse unique, `{chatRoomId: 1, createdAt: -1, _id: -1}`. Mỗi index phục vụ query nào?
- **Nhất quán khi không có transaction:** update có điều kiện chạy atomic (ADR-0005), race khi join/leave/delete.
- **Soft delete và hệ quả:** dữ liệu mồ côi, backfill.
- **Thời gian:** `Instant` UTC, độ chính xác millisecond của BSON, `LocalDateTime` còn sót trong `ChatRoom`.
- **Migration dữ liệu prod:** `docs/ops/`.

## 4. Thiết kế API và realtime protocol

- **REST theo resource:** `/api/v1/rooms/{id}/members/me`, `/api/v1/rooms/discover`, `/api/v1/rooms/{id}/messages`. Cách versioning.
- **Error contract:** ProblemDetail (RFC 9457), `ErrorCode`. Xem `docs/design/error-handling.md`.
- **Phân trang:**
  - Offset (discover, user search) và cursor (history, CM-044). Khi nào dùng loại nào?
  - Cursor không cho client đọc nội dung, tie-break bằng `(createdAt, id)`.
- **Breaking change và tương thích ngược:** CM-044 đổi shape của response. Deploy đồng thời, hay versioning để tránh phải làm vậy?
- **STOMP:** destination, SUBSCRIBE/SEND, user queue, receipt, heartbeat. Xem `docs/design/websocket-protocol.md`.
- **Idempotency và trùng lặp:** `tempId`/`clientMessageId`, merge theo id khi resync.

## 5. Bảo mật

- **Xác thực:** OAuth2 login (Google, GitHub), session cookie (HttpOnly, SameSite=Lax, Secure ở prod), logout.
- **Xác thực WebSocket:** token ngắn hạn dùng một lần (ADR-0004). Vì sao không dùng cookie cho WS?
- **Phân quyền:** kiểm tra membership ở REST, ở SUBSCRIBE/SEND, và với subscription đang mở (CM-058).
- **CSRF** (`SpaCsrfTokenRequestHandler`), **CORS**, **kiểm tra origin của WebSocket** (chỉ `app.client.url`).
- **Rate limiting:** theo IP và theo user, fail-open khi Redis lỗi. Vấn đề IP phía sau Vercel (finding 2026-10-11 trong BOARD).
- **Validation input, mass assignment:** identity luôn lấy từ Principal, không lấy từ payload.
- **Secrets management và quy trình đổi secret.** Không log PII hay token.
- **Dependency/CVE:** `npm audit`, CodeQL, cập nhật dependency.
- Tự đối chiếu với **OWASP Top 10** và **OWASP ASVS**. Tham khảo `SEC-REVIEW` (F1..F7) trong BOARD.

## 6. Testing

- **Test pyramid:** unit (Mockito), slice (`@WebMvcTest`, `@DataMongoTest`), integration (`*IT`, Testcontainers), E2E (**chưa có**).
- **Test phản ánh AC:** đặt tên `method_condition_expectedResult`, một AC có ít nhất một test.
- **Test chất lượng hay chỉ có coverage:**
  - Test có fail trên code cũ không?
  - Đã thử cố ý làm hỏng code để chắc test bắt được lỗi chưa (ví dụ `PersistencePropertyBindingTest`)?
- **Test concurrency:** 20 lượt join đồng thời vào phòng sức chứa 10 (`RoomMembershipIT`).
- **Contract test giữa frontend và backend:** hiện **thiếu**. CM-044 frontend chỉ test với API mock.
- **Flaky test và tính tất định:** timeout, fake timers, chờ bất đồng bộ.
- **Chỗ hổng lớn nhất:** chưa có smoke/E2E chạy trên trình duyệt thật (ví dụ Playwright).
- **Số liệu tại điểm dừng:** backend 344 unit + 66 IT; frontend 113 vitest; lint/tsc/build OK; `npm audit --omit=dev` 0 lỗ hổng.

## 7. Chất lượng code

- Clean code, đặt tên, SOLID, không trùng lặp code. Áp dụng quy ước `AGENTS.md` §4.
- **Xử lý lỗi:** exception nghiệp vụ, không catch `Exception`, fail-closed hay fail-open.
- **Frontend:** state management (Zustand), cleanup hook, phân tách component, a11y.
- **Technical debt:** follow-up trong BOARD. Ví dụ:
  - 4 rule lint React Compiler đang là warn (9 chỗ cần sửa).
  - `RedisTemplate.expire(K,long,TimeUnit)` và `getValidationGroups(T)` bị deprecated.
  - M1 của CM-058.

## 8. Hiệu năng và khả năng mở rộng

- **N+1 query** (đã sửa ở history trong CM-044), index phục vụ query, query plan (cần đo trên dữ liệu thật).
- **Tải của realtime:** CM-058 đọc Mongo 2 lần cho từng người nhận trên từng frame, trên executor outbound có hàng đợi giới hạn (core 4, max 16, queue 100). Đây là follow-up M1.
- **Backpressure, giới hạn buffer và kích thước message của WebSocket** (`WebSocketConfig`).
- **Load test:** chưa có (k6, Gatling).

## 9. Vận hành: DevOps, CI/CD, observability

- **CI:** `.github/workflows/backend-ci.yml`, `frontend-ci.yml`, `codeql.yml`. Gate nào chặn được merge?
- **Môi trường:** local, dev, prod. **Thiếu staging.**
- **Container:** Dockerfile multi-stage, chạy non-root, layered jar, healthcheck; `compose.yaml` có profile `full`.
- **Chiến lược deploy:** deploy backend và frontend đồng thời, rollback (revert merge), feature flag.
- **Observability:** structured log ECS ở prod, `X-Request-Id`, MDC `requestId`/`userId`; chưa có metrics/tracing; actuator health.
- **Cấu hình và secrets theo môi trường:**
  - Biến môi trường trên Render/Vercel.
  - Boot 4 đổi key thành `spring.mongodb.uri`, tên biến môi trường giữ nguyên.
  - Vercel Node 22.x.
  - Xem `docs/ops/upgrade-spring-boot-4.md`, `docs/ops/upgrade-next-16.md`.

## 10. Quy trình kỹ thuật

- **Git flow:** main/develop/branch theo ticket, Conventional Commits, footer `Refs: CM-xxx`.
- **Spec → design → plan → code → test** (`AGENTS.md` §5): quy trình đã được giữ đến đâu, chỗ nào bị trôi? Ví dụ trạng thái spec của CM-041/046/049 bị cũ, phải sửa ở `34e6409`.
- **Code review:** review theo AC, review chéo giữa các agent, checklist bảo mật.
- **Definition of Done:** gate tự động **và** smoke trên môi trường thật.
- **Làm việc với AI agent:** giới hạn quyền, kiểm tra lại output, trách nhiệm cuối cùng thuộc người duyệt. Xem `docs/plan/ORCHESTRATION.md`.

## 11. Góc nhìn trình bày (project cho CV)

- Kể được 3 đến 5 quyết định kỹ thuật kèm đánh đổi: WS token (ADR-0004), membership không dùng transaction (ADR-0005), cursor pagination (CM-044), subscription revocation (CM-058), nâng cấp Boot 4 / Jackson 3 (CM-052).
- Biết rõ giới hạn hiện tại và cách sửa: broadcast multi-instance, E2E, staging, load test.
- README: ảnh chụp, badge coverage, "What I Learned". Ba mục này đang để trống cho owner tự điền.

## 12. Bài học quy trình từ đợt này: smoke test trước khi lên main

Gate tự động (unit, IT, Testcontainers, build) **không thay thế** smoke test trên toàn bộ hệ thống.

- Trước mỗi lần merge main có breaking change hoặc nâng cấp major, phải chạy:
  1. `docker compose --profile full up`. Kiểm tra:
     - Health check.
     - `/api/**` khi chưa đăng nhập trả 401 ProblemDetail.
     - Redirect sang `/login` là URL tuyệt đối.
     - WebSocket từ origin lạ bị 403.
  2. Frontend `npm run dev` trỏ vào backend local. Kiểm tra `proxy.ts` chuyển hướng đúng khi chưa có cookie.
  3. Owner thử trên trình duyệt:
     - Đăng nhập Google/GitHub.
     - Tạo phòng, discover và join.
     - Chat hai tab, typing và presence.
     - Kéo lên đầu để tải tin cũ.
     - Rời phòng xong thì tab kia không còn nhận tin của phòng đó.
     - Xóa phòng.
- Về lâu dài: thêm bước này vào gate trong `ORCHESTRATION.md`, cân nhắc staging (Vercel Preview cộng một service staging trên Render) và E2E tự động.

## Gợi ý thứ tự review

1. Specs (business).
2. ADR và design docs (kiến trúc, dữ liệu, protocol).
3. Đọc code theo một luồng end-to-end, ví dụ "gửi một tin nhắn": UI → STOMP → `ChatWebSocketController` → `MessageService` → Mongo → broadcast → `RoomSubscriptionInterceptor` → client.
4. Test của luồng đó.
5. Bảo mật.
6. Vận hành.
7. Lập danh sách việc cần làm tiếp từ các follow-up trong BOARD.
