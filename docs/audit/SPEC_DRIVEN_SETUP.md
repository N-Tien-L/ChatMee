# ChatMee: Đề xuất setup spec-driven development

> Mục tiêu: mọi thay đổi đều đi qua chuỗi **spec → design → plan → code → test**, và mỗi bước để lại một tài liệu trong repo.
> Bộ tài liệu này phục vụ hai việc: (1) dùng để giao việc cho AI agent một cách an toàn; (2) cho nhà tuyển dụng thấy bạn có quy trình phát triển phần mềm bài bản.
> File này chỉ là **đề xuất kèm bản nháp**. Chưa tạo file nào ngoài `docs/audit/`.

---

## 1. Cấu trúc thư mục đề xuất

```text
ChatMee/
├── CLAUDE.md                     # thay cho WARP.md: hướng dẫn cho agent (bản nháp ở §2)
├── README.md                     # dành cho người đọc (viết lại ở giai đoạn 2)
├── compose.yaml                  # mongo + redis (+ backend) cho môi trường local
├── .github/
│   ├── workflows/{backend-ci.yml, frontend-ci.yml}
│   ├── pull_request_template.md
│   ├── ISSUE_TEMPLATE/{feature.yml, bug.yml, config.yml}
│   └── dependabot.yml
└── docs/
    ├── README.md                 # mục lục của docs và giải thích quy trình
    ├── audit/                    # kết quả của đợt audit này
    ├── specs/                    # "CÁI GÌ và VÌ SAO": mỗi tính năng một file
    │   ├── _TEMPLATE.md
    │   ├── SPEC-001-auth-oauth2.md
    │   ├── SPEC-002-chat-rooms.md
    │   ├── SPEC-003-direct-messages.md
    │   ├── SPEC-004-messaging-realtime.md
    │   ├── SPEC-005-presence-typing.md
    │   ├── SPEC-006-user-discovery.md
    │   └── SPEC-007-rate-limiting.md
    ├── design/                   # "LÀM THẾ NÀO": thiết kế kỹ thuật
    │   ├── architecture.md
    │   ├── data-model.md
    │   ├── websocket-protocol.md # destination, payload, luồng sự kiện
    │   ├── authorization.md      # ma trận quyền
    │   └── error-handling.md     # ProblemDetail, mã lỗi
    ├── adr/                      # quyết định kiến trúc (không sửa, chỉ thay thế bằng ADR mới)
    │   ├── 0000-template.md
    │   ├── 0001-mongodb-as-primary-store.md
    │   ├── 0002-redis-for-presence-and-rate-limit.md
    │   ├── 0003-stomp-over-websocket.md
    │   └── 0004-websocket-authentication-token.md   # quyết định mới (sau khi sửa C-2)
    └── plan/
        ├── WORKFLOW.md           # quy trình dùng spec để giao việc cho agent
        ├── _TICKET_TEMPLATE.md
        └── tickets/              # CM-001-....md (hoặc dùng GitHub Issues, file chỉ là bản nháp)
```

**Quy ước:**
- ID: `SPEC-NNN`, `ADR-NNNN`, `CM-NNN` (ticket). Ticket, PR và commit đều tham chiếu tới ID.
- Mỗi spec có trạng thái: `Draft → Approved → Implemented → Deprecated`. **Chỉ code khi spec ở trạng thái `Approved`.**
- Acceptance criteria viết theo Given/When/Then, đánh số `AC-<spec>-<n>`. Mỗi AC phải có ít nhất một test (ghi tên test vào spec khi hoàn thành). Nhờ vậy có được traceability từ yêu cầu tới test.
- ADR là bất biến: muốn đổi quyết định thì viết ADR mới với `Supersedes: ADR-000X`.

---

## 2. Bản nháp `CLAUDE.md` (thay cho `WARP.md`)

````markdown
# CLAUDE.md

Hướng dẫn cho AI coding agent làm việc trong repo này. Đọc hết file này trước khi làm bất cứ việc gì.

## 1. Tổng quan dự án
ChatMee là ứng dụng chat realtime, gồm:
- `backend/`: Java 17, Spring Boot 3.5, Spring Security (OAuth2 login, session cookie), STOMP qua WebSocket, MongoDB (Spring Data), Redis (presence, rate limit, pub/sub giữa các instance).
- `frontend/`: Next.js 15 (App Router), React 19, TypeScript strict, Tailwind 4, shadcn/ui, Zustand, @stomp/stompjs.
- Deploy: backend chạy Docker trên Render; frontend trên Vercel (dùng rewrites làm reverse proxy cho `/api`, `/oauth2`, `/login`, `/logout`).

Tài liệu chuẩn: `docs/specs/` (yêu cầu), `docs/design/` (thiết kế), `docs/adr/` (quyết định), `docs/plan/` (ticket).
**Khi code và spec mâu thuẫn, coi spec là đúng.** Nếu thấy spec sai thì dừng lại và hỏi, không tự ý "sửa cho khớp".

## 2. Lệnh thường dùng
```bash
# Hạ tầng local
docker compose up -d mongo redis
cp backend/.env.example backend/.env       # điền OAuth client của bạn
cp frontend/.env.example frontend/.env.local

# Backend (thư mục backend/)
./mvnw spotless:apply            # format code
./mvnw test                      # unit test + slice test
./mvnw verify                    # cả integration test (cần Docker cho Testcontainers)
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
./mvnw test -Dtest=ChatRoomServiceTest#joinRoom_privateRoom_throwsForbidden

# Frontend (thư mục frontend/)
npm ci
npm run lint && npx tsc --noEmit
npm test                         # vitest
npm run dev                      # http://localhost:3000, proxy tới :8080
npm run build
```
Một thay đổi chỉ được coi là "xong" khi `./mvnw verify` VÀ `npm run lint && npx tsc --noEmit && npm test && npm run build` đều pass.

## 3. Ranh giới module (backend: `com.lnt.chatmee`)
```
config/        cấu hình Spring (Security, WebSocket, Redis, Mongo, OpenAPI). Không chứa business logic.
web/           REST controller + DTO request/response + mapper. Chỉ gọi service.
websocket/     STOMP controller, ChannelInterceptor, xử lý session event.
domain/        entity (@Document), enum, policy (Strategy theo loại phòng), domain exception.
service/       use case, @Transactional, kiểm tra quyền qua RoomAuthorizationService.
repository/    Spring Data interface. Chỉ service được gọi repository.
security/      UserPrincipal, @CurrentUser resolver, RateLimitingFilter, WsTokenService.
```
Quy tắc cứng:
- Controller KHÔNG được inject repository.
- Entity KHÔNG được trả thẳng ra API: luôn map sang DTO (record).
- Danh tính user lấy từ `Principal`/`@CurrentUser`, KHÔNG BAO GIỜ lấy từ request body hay payload.
- Mọi destination STOMP mới phải được thêm vào `docs/design/websocket-protocol.md` và vào quy tắc phân quyền của interceptor.

Frontend:
```
app/           route (App Router). Không gọi API trực tiếp trong page, mà đi qua store/hook.
components/    UI thuần, nhận props. components/ui là code của shadcn: không sửa tay.
lib/api/       client HTTP (axios), một file cho mỗi resource.
lib/realtime/  MỘT STOMP client duy nhất cho cả app (StompProvider).
lib/stores/    Zustand stores.
lib/types/     type dùng chung (sinh từ OpenAPI khi có thể).
```

## 4. Quy ước code
- Java: constructor injection (`@RequiredArgsConstructor`), `final` field; DTO dùng `record`; không bắt `catch (Exception)` trong service; lỗi nghiệp vụ ném lớp con của `ChatMeeException` kèm `ErrorCode`; API lỗi trả `ProblemDetail`.
- Validation: `jakarta.validation` (`@Valid` ở controller, `@Validated` ở STOMP controller).
- Thời gian: dùng `Instant` (UTC), serialize dạng ISO-8601.
- Log: SLF4J, có tham số; KHÔNG log token, session ID, email, nội dung tin nhắn; không dùng emoji.
- Test: `*Test` (unit, Mockito), `*WebMvcTest`, `*IT` (Testcontainers). Tên test theo dạng `method_condition_expectedResult`.
- TypeScript: không dùng `any`; không để `console.log` trong code commit; hook phải có cleanup đầy đủ.
- Đặt tên tiếng Anh, đúng chính tả (presence, subscriber…).

## 5. Quy trình: spec → design → plan → code → test
1. **Spec**: tìm hoặc viết `docs/specs/SPEC-xxx.md` (dùng template). Trạng thái phải là `Approved` thì mới được code.
2. **Design**: nếu thay đổi data model, giao thức WS, phân quyền hoặc kiến trúc thì cập nhật `docs/design/*`. Nếu có lựa chọn kiến trúc thì viết ADR.
3. **Plan**: chia việc thành ticket `CM-xxx` (dùng template). Mỗi ticket là một PR nhỏ, có danh sách file dự kiến và AC.
4. **Code**: làm trên nhánh `feat/CM-xxx-short-name`; với bug thì viết test tái hiện (fail) TRƯỚC khi sửa.
5. **Test**: mỗi AC có ít nhất một test; chạy toàn bộ lệnh ở mục 2; cập nhật spec (`Implemented`, ghi tên test).
6. **PR**: dùng template; mô tả liên kết `SPEC-xxx` và `CM-xxx`.

## 6. Quy ước commit (Conventional Commits)
`<type>(<scope>): <mô tả ngắn, mệnh lệnh, tiếng Anh>` kèm footer `Refs: CM-012, SPEC-004`
- type: feat | fix | refactor | test | docs | chore | ci | build | perf | security
- scope: backend | frontend | ws | auth | rooms | messages | presence | infra | docs
- Ví dụ: `fix(ws): derive sender from STOMP principal instead of payload`

## 7. Những việc agent KHÔNG được làm
- KHÔNG commit, push, merge, tạo/đóng PR, deploy hay sửa cấu hình Render/Vercel khi chưa được yêu cầu rõ ràng.
- KHÔNG đọc, in ra hay commit secret (`.env*` trừ `*.example`); không thêm secret vào code, test hay log.
- KHÔNG expose thêm endpoint actuator, không `permitAll` thêm path mới, không tắt CSRF hay CORS, không nới origin của WebSocket mà không có ADR.
- KHÔNG sửa spec đã `Approved` để code "khớp". Hãy dừng lại và hỏi.
- KHÔNG xóa hay viết lại test đang fail để build "xanh". Không `@Disabled`, không `-DskipTests` trong CI.
- KHÔNG thêm dependency mới nếu không ghi lý do trong PR. Không nâng major version (Spring Boot 4, Next 16) ngoài ticket riêng.
- KHÔNG sửa `components/ui/*` (shadcn), `mvnw*`, `.mvn/`.
- KHÔNG chạy lệnh phá hủy dữ liệu (drop database, `git reset --hard`, `push --force`).
- KHÔNG tự ý mở rộng phạm vi: chỉ làm trong ticket, việc phát sinh thì ghi vào "Follow-ups".
````

---

## 3. `docs/specs/`: template và bản viết ngược cho tính năng hiện có

### 3.1 `docs/specs/_TEMPLATE.md`

```markdown
# SPEC-NNN: <Tên tính năng>
- Status: Draft | Approved | Implemented | Deprecated
- Owner: @N-Tien-L · Created: YYYY-MM-DD · Related: ADR-…, design/…

## 1. Mục tiêu (Goal)
Một đoạn ngắn: vấn đề nào được giải quyết, cho ai.

## 2. Ngoài phạm vi (Non-goals)

## 3. User stories
- US-1: Là <vai trò>, tôi muốn <hành động> để <lợi ích>.

## 4. Acceptance criteria
- AC-NNN-1: Given … When … Then …   → Test: `ClassName#method`

## 5. Edge cases & lỗi
| Tình huống | Hành vi mong đợi | HTTP / STOMP |

## 6. Bảo mật & phân quyền
Ai được làm gì; dữ liệu nào được trả về.

## 7. Phi chức năng
Hiệu năng, giới hạn, khả năng quan sát (log/metric).

## 8. API / giao thức liên quan
Liên kết tới OpenAPI / websocket-protocol.md.

## 9. Câu hỏi mở
```

### 3.2 Bản nháp các spec viết ngược (hành vi **mong muốn**; chỗ nào lệch hiện trạng có ghi `⚠ hiện tại:`)

<details>
<summary><b>SPEC-001: Xác thực bằng OAuth2 (Google/GitHub)</b></summary>

**Mục tiêu:** người dùng đăng nhập bằng Google hoặc GitHub mà không cần mật khẩu riêng. Hệ thống tạo hoặc cập nhật hồ sơ, rồi duy trì phiên qua cookie HttpOnly.

**User stories**
- US-1: Là khách, tôi bấm "Sign in with Google/GitHub" để vào dashboard.
- US-2: Là user, tôi tải lại trang mà vẫn còn đăng nhập.
- US-3: Là user, tôi đăng xuất thì phiên bị hủy.

**Acceptance criteria**
- AC-001-1: Given lần đầu đăng nhập qua Google, When callback thành công, Then tạo một `User` với `(provider, providerId)` là duy nhất, rồi redirect tới `/dashboard`.
- AC-001-2: Given user đã có, When đăng nhập lại, Then cập nhật `name`/`avatarUrl` và không tạo bản ghi trùng (kể cả khi hai lần đăng nhập diễn ra đồng thời, nhờ unique index).
- AC-001-3: `GET /api/v1/auth/me` trả 200 kèm `{id, name, email, avatarUrl, provider}` khi đã đăng nhập, và **401 ProblemDetail** khi chưa (⚠ hiện tại: trả 200 kèm `authenticated:false`, còn các API khác trả 302).
- AC-001-4: `POST /logout` hủy session; sau đó `/auth/me` trả 401 (⚠ hiện tại: dùng GET).
- AC-001-5: Callback lỗi thì redirect `/login?error=true` và frontend hiện toast.
- AC-001-6: Cookie session có `HttpOnly`, `Secure` (prod) và `SameSite=Lax`; CSRF được bật cho request thay đổi dữ liệu.
- AC-001-7: Log không chứa session ID, email hay attribute OAuth thô.

**Edge cases:** GitHub không trả email (email private) thì lưu `email=null` và UI vẫn chạy; provider không hỗ trợ thì từ chối; session hết hạn giữa chừng thì API trả 401 và frontend chuyển về `/login`.
</details>

<details>
<summary><b>SPEC-002: Phòng chat nhóm (PUBLIC / PRIVATE)</b></summary>

**User stories:** tạo phòng; xem danh sách phòng của tôi; khám phá và join phòng PUBLIC; mời người vào phòng PRIVATE; sửa, xóa phòng (owner); rời phòng (member).

**Acceptance criteria**
- AC-002-1: Tạo phòng: `name` dài 1–100 ký tự (chữ Unicode, số, khoảng trắng, `._-`), `description` ≤ 500, `maxMembers` từ 2 đến 1000; người tạo thành `OWNER`. Dữ liệu không hợp lệ trả **400** kèm `errors[]` (⚠ hiện tại: validation không chạy, tên sai trả 500).
- AC-002-2: `GET /rooms` chỉ trả các phòng mà user là thành viên và đang active.
- AC-002-3: `GET /rooms/discover?query=` trả các phòng PUBLIC mà user chưa tham gia, có phân trang (⚠ hiện tại: chưa có).
- AC-002-4: Join phòng PUBLIC còn chỗ trả 204; phòng đầy trả **409** `ROOM_FULL`; đã là thành viên trả **409** `ALREADY_MEMBER`; phòng **PRIVATE hoặc DM trả 403** (⚠ hiện tại: join được phòng PRIVATE).
- AC-002-5: Thêm thành viên: chỉ OWNER/ADMIN được thêm; chỉ OWNER được gán role ADMIN; không ai được gán OWNER.
- AC-002-6: Chỉ OWNER được sửa hoặc xóa phòng. Xóa phòng là xóa mềm, broadcast sự kiện `ROOM_DELETED`, và thành viên mất quyền đọc.
- AC-002-7: Rời phòng: OWNER không được rời (phải chuyển quyền sở hữu hoặc xóa phòng). Member rời thì mất quyền subscribe và đọc lịch sử ngay lập tức.
- AC-002-8: Mọi thay đổi thành viên diễn ra nguyên tử: dù có request đồng thời, số thành viên không vượt `maxMembers` và không có bản ghi trùng.

**Edge cases:** `maxMembers` mới nhỏ hơn số thành viên hiện tại thì trả 400; `roomId` không tồn tại thì 404; không phải thành viên thì **404** (không tiết lộ phòng có tồn tại hay không).
</details>

<details>
<summary><b>SPEC-003: Tin nhắn trực tiếp (DM)</b></summary>

- AC-003-1: Tạo DM với `participantId` hợp lệ và khác bản thân thì có phòng gồm đúng 2 thành viên, không có tên; hiển thị tên của người kia.
- AC-003-2: **Mỗi cặp user chỉ có một DM**: tạo lần nữa trả về phòng đã có (200) (⚠ hiện tại: tạo trùng được).
- AC-003-3: Không thể join, thêm người, đổi `maxMembers` hay rời DM. Có thể "ẩn" DM (giai đoạn 3).
- AC-003-4: Response danh sách phòng chứa sẵn thông tin của người kia (`counterpart{id,name,avatarUrl}`) để client không phải gọi thêm N request.
- Edge: người kia không tồn tại thì 404; DM với chính mình thì 400.
</details>

<details>
<summary><b>SPEC-004: Nhắn tin realtime và lịch sử</b></summary>

- AC-004-1: STOMP CONNECT phải có xác thực hợp lệ (xem ADR-0004); thiếu hoặc sai thì nhận frame ERROR và kết nối bị đóng.
- AC-004-2: SUBSCRIBE `/topic/rooms/{roomId}` chỉ thành công khi user là thành viên; ngược lại nhận ERROR hoặc bị từ chối.
- AC-004-3: SEND `/app/rooms/{roomId}/messages` `{content, clientMessageId}`: server lấy người gửi từ Principal, nội dung dài 1–5000 ký tự sau khi trim, **lưu xong rồi mới broadcast** `MessageDto{id, clientMessageId, roomId, sender{id,name}, content, createdAt(ISO-8601 UTC)}`.
- AC-004-4: Gửi lỗi (không phải thành viên, nội dung không hợp lệ, vượt rate limit) thì chỉ người gửi nhận `/user/queue/errors {clientMessageId, code, message}`.
- AC-004-5: Client: tin optimistic chuyển từ `sending` sang `sent` khi nhận lại tin có `clientMessageId` khớp, hoặc sang `failed` khi nhận lỗi hay hết timeout 10 giây; tin lỗi có nút "Gửi lại".
- AC-004-6: Lịch sử: `GET /rooms/{id}/messages?before=<cursor>&limit=50` trả tin theo thứ tự thời gian và kèm `nextCursor`; client cuộn lên thì tải thêm.
- AC-004-7: Reconnect: client tự kết nối lại (backoff), **subscribe lại**, rồi gọi `GET …?after=<lastMessageId>` để lấy các tin bị lỡ; UI hiện "Reconnecting…".
- AC-004-8: Đổi phòng thì hủy subscription của phòng cũ; tin của phòng khác không bao giờ xuất hiện trong khung hiện tại.
- Edge: gửi trùng `clientMessageId` thì chỉ lưu một lần (idempotent); tin chứa HTML được hiển thị dạng text (React đã escape sẵn).
</details>

<details>
<summary><b>SPEC-005: Presence và typing indicator</b></summary>

- AC-005-1: User được coi là online khi có ≥ 1 session STOMP đã xác thực, và offline khi session cuối cùng đóng (có thời gian ân hạn khoảng 10 giây để tránh nhấp nháy khi reload).
- AC-005-2: Presence do **server** xác định từ sự kiện connect/disconnect của session; client không gửi được trạng thái presence cho người khác.
- AC-005-3: Khi chạy nhiều instance backend, mọi instance thấy cùng một trạng thái (đếm session trong Redis, broadcast qua Redis Pub/Sub).
- AC-005-4: `GET /presence?userIds=` chỉ trả trạng thái của những người "liên quan" (cùng phòng) để tránh dò tìm.
- AC-005-5: Typing: SEND `/app/rooms/{id}/typing {typing}`. Server kiểm tra thành viên, lấy user từ Principal và broadcast `/topic/rooms/{id}/typing`. Client tự xóa trạng thái "đang gõ" sau 5 giây nếu không nhận thêm sự kiện. Server throttle tối đa 1 sự kiện/giây/user/phòng.
- Edge: mất mạng đột ngột (không có frame DISCONNECT) thì heartbeat timeout dẫn tới offline; một user mở nhiều tab thì vẫn online khi còn ≥ 1 tab.
</details>

<details>
<summary><b>SPEC-006: Tìm kiếm người dùng</b></summary>

- AC-006-1: `GET /users/search?q=&page=&size=` (yêu cầu `q` ≥ 2 ký tự, `size` ≤ 20) trả `UserSummary{id,name,avatarUrl}`, **không có email** (⚠ hiện tại: trả toàn bộ user kèm email).
- AC-006-2: Kết quả không bao gồm chính mình; được sắp xếp theo độ khớp; có rate limit.
- AC-006-3: Không có endpoint tra cứu theo `provider/providerId`.
</details>

<details>
<summary><b>SPEC-007: Rate limiting</b></summary>

- AC-007-1: REST: khách bị giới hạn 20 request/phút theo IP thật (lấy từ proxy tin cậy), user đã đăng nhập 100 request/phút theo `userId`. Vượt giới hạn thì trả **429 ProblemDetail** kèm `Retry-After`; mọi response có `X-RateLimit-Limit/Remaining`.
- AC-007-2: Header `X-Forwarded-For` giả từ client không làm thay đổi key định danh.
- AC-007-3: STOMP: gửi tin tối đa 10 tin/5 giây/user, vượt thì nhận `/user/queue/errors` mã `RATE_LIMITED`.
- AC-007-4: Redis không phản hồi thì fail-open (cho request đi qua), ghi log WARN và tăng metric.
- AC-007-5: `/actuator/health` không bị giới hạn.
</details>

---

## 4. `docs/design/`: nội dung cần có

| File | Nội dung chính |
|---|---|
| `architecture.md` | Sơ đồ C4 mức 1–2 (Mermaid): Browser, Vercel proxy, Spring Boot, MongoDB và Redis. Mô tả luồng REST, OAuth và STOMP; bảng triển khai (Render, Vercel, Atlas, Upstash); giới hạn khi scale ngang (SimpleBroker trong RAM so với Redis fan-out). |
| `data-model.md` | Từng collection kèm trường, kiểu dữ liệu, index (đặc biệt `participants{chatRoomId,userId}` unique, `messages{chatRoomId,createdAt:-1}`, `users{provider,providerId}` unique, DM `{type, memberKey}` unique). Ghi rõ nguồn sự thật về thành viên phòng, chiến lược xóa mềm, và cách migration index (Mongock hoặc `auto-index-creation`). |
| `websocket-protocol.md` | Bảng destination gồm hướng (client gửi hay server đẩy), payload JSON schema, quyền truy cập, mã lỗi. Sequence diagram cho: connect kèm token, gửi tin (optimistic → ack), reconnect và đồng bộ lại, presence nhiều instance qua Redis. |
| `authorization.md` | Ma trận quyền (bên dưới) và nơi enforce (`RoomAuthorizationService`, interceptor STOMP, `SecurityFilterChain`). |
| `error-handling.md` | Hierarchy exception, bảng `ErrorCode` ánh xạ sang HTTP status, ví dụ `ProblemDetail`, format lỗi STOMP. |

**Ma trận quyền (bản nháp cho `authorization.md`):**

| Hành động | Khách | User (không thuộc phòng) | MEMBER | ADMIN | OWNER |
|---|---|---|---|---|---|
| Xem/subscribe phòng, đọc lịch sử | ✗ | ✗ (404) | ✓ | ✓ | ✓ |
| Gửi tin, typing | ✗ | ✗ | ✓ | ✓ | ✓ |
| Join phòng PUBLIC | ✗ | ✓ | n/a | n/a | n/a |
| Join phòng PRIVATE/DM | ✗ | ✗ (403) | n/a | n/a | n/a |
| Thêm MEMBER | ✗ | ✗ | ✗ | ✓ | ✓ |
| Gán ADMIN | ✗ | ✗ | ✗ | ✗ | ✓ |
| Sửa thông tin phòng | ✗ | ✗ | ✗ | ✗ (đề xuất: ✓ trừ maxMembers) | ✓ |
| Xóa phòng | ✗ | ✗ | ✗ | ✗ | ✓ |
| Rời phòng | ✗ | n/a | ✓ | ✓ | ✗ (phải chuyển quyền sở hữu) |

---

## 5. `docs/adr/`: template và 4 ADR đầu tiên

### 5.1 `docs/adr/0000-template.md` (dạng MADR rút gọn)

```markdown
# ADR-NNNN: <Tiêu đề quyết định>
- Status: Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- Date: YYYY-MM-DD · Deciders: @N-Tien-L

## Context
Bối cảnh và các lực tác động (yêu cầu, ràng buộc, chi phí).

## Decision
Chúng tôi chọn … vì …

## Alternatives considered
| Phương án | Ưu | Nhược |

## Consequences
- Tích cực:
- Tiêu cực / nợ kỹ thuật:
- Việc phải làm kéo theo:
```

### 5.2 ADR-0001: Dùng MongoDB làm kho dữ liệu chính
- **Context:** dữ liệu chính là tin nhắn (ghi nhiều, đọc theo phòng và theo thời gian), phòng có `settings` linh hoạt, dự án cá nhân dùng gói Atlas free.
- **Decision:** dùng MongoDB (Spring Data MongoDB), lưu 4 collection `users`, `chat_rooms`, `participants`, `messages`.
- **Alternatives:**
  - PostgreSQL: có ACID và quan hệ thành viên tự nhiên hơn, nhưng cần thiết kế schema và migration chặt hơn.
  - Cassandra: thừa sức so với quy mô này.
- **Consequences:**
  - (+) Schema linh hoạt, gói free dễ dùng, query theo `chatRoomId + createdAt` nhanh nếu có index.
  - (−) Ràng buộc toàn vẹn phải tự làm (unique index, update nguyên tử). Transaction nhiều document cần replica set và `MongoTransactionManager`. **Bài học từ audit:** index không tự được tạo, `@Transactional` không có tác dụng, nên phải bổ sung (ticket CM-007).
- *Ghi chú phỏng vấn: nên nói thật rằng với quan hệ thành viên phòng, PostgreSQL cũng là lựa chọn hợp lý, và giải thích trade-off.*

### 5.3 ADR-0002: Dùng Redis cho presence, rate limit và fan-out giữa các instance
- **Context:** presence là dữ liệu tạm, thay đổi liên tục, phải nhất quán giữa các instance; rate limit cần bộ đếm nguyên tử có TTL.
- **Decision:** Redis (Upstash). Dùng `INCR`+`EXPIRE` (hoặc Lua token bucket) cho rate limit; hash đếm session theo user cho presence; **Pub/Sub** để phát sự kiện presence (và về sau là tin nhắn) tới mọi instance.
- **Alternatives:** lưu trong RAM (chỉ chạy đúng với một instance; đây là hiện trạng thực tế); lưu trong Mongo (chậm và không có TTL tiện lợi); RabbitMQ làm STOMP broker relay (đủ chức năng nhưng phải vận hành thêm một dịch vụ).
- **Consequences:**
  - (+) Rẻ và đơn giản.
  - (−) Pub/Sub không đảm bảo giao nhận (fire-and-forget), nên presence phải có heartbeat và TTL. SimpleBroker vẫn nằm trong RAM: khi scale ngang, **tin nhắn** cũng phải fan-out qua Redis, hoặc chuyển sang broker relay (ADR sau).

### 5.4 ADR-0003: Dùng STOMP qua WebSocket (SockJS là fallback)
- **Context:** cần realtime hai chiều, định tuyến theo topic phòng, tích hợp tốt với Spring.
- **Decision:** Spring `@EnableWebSocketMessageBroker` + STOMP; client dùng `@stomp/stompjs`.
- **Alternatives:** WebSocket thuần (phải tự viết định tuyến và giao thức); SSE kèm REST (một chiều, độ trễ khi gửi cao hơn); Socket.IO (không phải chuẩn trong hệ Spring).
- **Consequences:**
  - (+) Có sẵn destination, `@MessageMapping`, user destination và tích hợp Spring Security Messaging.
  - (−) Xác thực khi kết nối cross-origin rất khó (xem ADR-0004). Nên **xem lại việc dùng SockJS**: các trình duyệt hiện đại đều hỗ trợ WebSocket, mà SockJS lại kéo theo dependency có CVE (`websocket-driver`).

### 5.5 ADR-0004 (đề xuất mới): Xác thực WebSocket bằng token ngắn hạn
- **Context:** Vercel không proxy được WebSocket, nên client phải kết nối thẳng tới Render (cross-site) và cookie session không dùng được. Hệ quả là commit `0d8f01a` đã bỏ xác thực (Critical C-2).
- **Options:**
  - (A) Token ngắn hạn: endpoint `/api/v1/auth/ws-token` (gọi qua proxy, dùng session) cấp token ngẫu nhiên TTL 60 giây lưu trong Redis, dùng một lần; client gửi token trong header STOMP CONNECT; một `ChannelInterceptor` kiểm tra rồi gắn Principal.
  - (B) Custom domain chung cho frontend và backend (`chatmee.dev` và `api.chatmee.dev`), cookie `Domain=.chatmee.dev`.
  - (C) Chuyển toàn bộ sang JWT stateless.
- **Đề xuất:** (A). Phạm vi thay đổi nhỏ, không phụ thuộc domain, và là câu chuyện kỹ thuật tốt để kể khi phỏng vấn. (C) là thay đổi lớn, không cần thiết. **Cần bạn quyết định** (xem câu hỏi trong IMPROVEMENT_PLAN).

---

## 6. `docs/plan/`: template ticket và quy trình giao việc cho agent

### 6.1 `docs/plan/_TICKET_TEMPLATE.md`

```markdown
# CM-NNN: <Tiêu đề ngắn, động từ>
- Type: feat | fix | security | refactor | test | docs | ci
- Spec: SPEC-xxx (AC-xxx-n, …) · Design: design/… · ADR: …
- Priority: P0 | P1 | P2 · Estimate: S | M | L · 🎯 Interview: <chủ đề nếu có>
- Depends on: CM-…

## Mục tiêu
1–3 câu.

## Phạm vi
- Trong phạm vi:
- Ngoài phạm vi:

## File dự kiến chạm tới
- `backend/src/main/java/...`

## Acceptance criteria
- [ ] AC-1 (Given/When/Then) → test: `…`
- [ ] `./mvnw verify` và lint/tsc/test/build của frontend đều xanh
- [ ] Tài liệu liên quan đã được cập nhật

## Ghi chú kỹ thuật / gợi ý

## Follow-ups (việc phát hiện thêm, KHÔNG làm trong ticket này)
```

### 6.2 `docs/plan/WORKFLOW.md`: quy trình dùng spec để giao việc cho agent

1. **Bạn (người quyết định):** chọn ticket, kiểm tra spec liên quan đã `Approved`.
2. **Prompt giao việc mẫu:**
   > "Làm ticket `docs/plan/tickets/CM-012.md`. Đọc `CLAUDE.md`, `SPEC-004` và `design/websocket-protocol.md`. Viết test cho từng AC trước, sau đó implement. Không làm gì ngoài phạm vi ticket. Khi xong, chạy toàn bộ lệnh kiểm tra rồi báo cáo: các file đã đổi, test đã thêm, kết quả lệnh, các follow-up. Không commit."
3. **Agent:**
   - Đọc tài liệu và lập plan ngắn (danh sách file, danh sách test).
   - Nếu spec mơ hồ thì **hỏi trước**.
   - Viết test đỏ, sau đó viết code cho test xanh.
   - Chạy toàn bộ lệnh kiểm tra.
   - Cập nhật trạng thái AC và tên test vào spec.
   - Viết sẵn mô tả PR theo template.
4. **Bạn review:** diff, test, đối chiếu với AC. Sau đó tự commit (Conventional Commits) và tự mở PR.
5. **CI xanh thì merge.** Ticket chuyển sang `Done`, spec chuyển sang `Implemented` khi mọi AC đã có test.
6. **Thay đổi kiến trúc:** agent chỉ được *đề xuất* ADR (`Status: Proposed`). Chỉ bạn mới chuyển ADR sang `Accepted`.

Mẹo: mỗi ticket là một phiên làm việc của agent; giữ ticket nhỏ (S/M). Nếu ticket quá L thì tách nhỏ trước khi giao.

---

## 7. Template GitHub

### 7.1 `.github/pull_request_template.md`

```markdown
## Tóm tắt
<!-- Thay đổi gì, vì sao -->

Refs: CM-___ · SPEC-___ · ADR-___

## Loại thay đổi
- [ ] feat  - [ ] fix  - [ ] security  - [ ] refactor  - [ ] test  - [ ] docs  - [ ] ci/build

## Acceptance criteria
- [ ] AC-___ → test `…`

## Kiểm thử
- [ ] `./mvnw verify`
- [ ] `npm run lint && npx tsc --noEmit && npm test && npm run build`
- [ ] Kiểm thử thủ công (mô tả / ảnh chụp / GIF):

## Checklist
- [ ] Không có secret, token, PII trong code hay log
- [ ] Endpoint hoặc destination mới đã có phân quyền và đã cập nhật docs/design
- [ ] Spec/ADR/README đã được cập nhật (nếu cần)
- [ ] Không có thay đổi ngoài phạm vi ticket
```

### 7.2 `.github/ISSUE_TEMPLATE/feature.yml`

```yaml
name: Feature request
description: Đề xuất tính năng (sẽ được chuyển thành SPEC)
labels: [type:feature, status:triage]
body:
  - type: textarea
    id: problem
    attributes: { label: Vấn đề / mục tiêu, description: Ai cần gì và vì sao? }
    validations: { required: true }
  - type: textarea
    id: stories
    attributes: { label: User stories, placeholder: "Là …, tôi muốn … để …" }
  - type: textarea
    id: ac
    attributes: { label: Acceptance criteria (Given/When/Then) }
  - type: textarea
    id: nongoals
    attributes: { label: Ngoài phạm vi }
  - type: dropdown
    id: area
    attributes: { label: Khu vực, options: [backend, frontend, ws, auth, infra, docs] }
```

### 7.3 `.github/ISSUE_TEMPLATE/bug.yml`

```yaml
name: Bug report
description: Báo lỗi
labels: [type:bug, status:triage]
body:
  - type: textarea
    id: what
    attributes: { label: Mô tả lỗi }
    validations: { required: true }
  - type: textarea
    id: repro
    attributes: { label: Các bước tái hiện, placeholder: "1. … 2. … 3. …" }
    validations: { required: true }
  - type: textarea
    id: expected
    attributes: { label: Kết quả mong đợi / thực tế }
  - type: input
    id: version
    attributes: { label: Commit / môi trường (local, prod) }
  - type: dropdown
    id: severity
    attributes: { label: Mức độ, options: [Critical, High, Medium, Low] }
  - type: checkboxes
    id: security
    attributes:
      label: Bảo mật
      options:
        - label: Đây là lỗ hổng bảo mật (KHÔNG đăng chi tiết công khai; xem SECURITY.md)
```

Thêm `SECURITY.md` ngắn (cách báo lỗ hổng một cách riêng tư) và `config.yml` để tắt tùy chọn tạo issue trống (`blank_issues_enabled: false`).

---

## 8. Thứ tự triển khai bộ tài liệu

1. `CLAUDE.md` (dựa trên bản nháp ở §2), xóa `WARP.md`. Làm trong ticket CM-005.
2. Template: spec, ADR, ticket, PR, issue. Làm trong CM-010.
3. ADR-0001…0003 (ghi lại quyết định đã có) và ADR-0004 (chờ bạn quyết định).
4. SPEC-004 và SPEC-005 trước, vì chúng gắn với các bản sửa Critical. Các spec còn lại làm song song với việc viết test ở giai đoạn 1.
5. `design/authorization.md` và `design/websocket-protocol.md` trước khi sửa C-2 và C-3.
