# AGENTS.md

Shared instructions for AI coding agents working in this repository. Read this file completely before doing anything.

## 1. Project Overview
ChatMee is a real-time chat application, consisting of:
- `backend/`: Java 17, Spring Boot 3.5, Spring Security (OAuth2 login, session cookie), STOMP over WebSocket, MongoDB (Spring Data), Redis (presence, rate limit, pub/sub between instances).
- `frontend/`: Next.js 15 (App Router), React 19, strict TypeScript, Tailwind 4, shadcn/ui, Zustand, @stomp/stompjs.
- Deployment: backend runs via Docker on Render; frontend on Vercel (using rewrites as reverse proxy for `/api`, `/oauth2`, `/login`, `/logout`).

Authoritative documents: `docs/specs/` (requirements), `docs/design/` (technical design), `docs/adr/` (architectural decisions), `docs/plan/` (tickets).
**When code and specs conflict, consider the spec to be correct.** If you find the spec is wrong, stop and ask; do not "fix it to match" on your own.

## 2. Common Commands
```bash
# Local infrastructure
docker compose up -d                           # start mongo and redis
cp backend/.env.example backend/.env           # Fill in your OAuth client
cp frontend/.env.example frontend/.env.local

# Backend (backend/ directory)
./mvnw spotless:apply                          # format code (needs plugin)
./mvnw test                                    # unit test + slice test
./mvnw verify                                  # full integration test (requires Docker for Testcontainers)
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
./mvnw test -Dtest=ChatRoomServiceTest#joinRoom_privateRoom_throwsForbidden

# Frontend (frontend/ directory)
npm ci
npm run lint && npx tsc --noEmit
npm test                                       # vitest (added in CM-020)
npm run dev                                    # http://localhost:3000, proxies to :8080
npm run build
```
A change is only considered "done" when `./mvnw verify` AND `npm run lint && npx tsc --noEmit && npm test && npm run build` both pass.

## 3. Module Boundaries (backend: `com.lnt.chatmee`)
> **This is the TARGET layout, reached gradually in phase 2.** The current code uses `config/ controller/ dto/ exception/ model/ repository/ security/ service/ util/`.
> Packages and types listed below (`web/`, `domain/`, `websocket/`, `UserPrincipal`, `@CurrentUser`, `RoomAuthorizationService`, `ChatMeeException`, `StompProvider`, ...) may NOT exist yet.
> Never reference or create them unless your ticket names them explicitly.

```text
config/        Spring configuration (Security, WebSocket, Redis, Mongo, OpenAPI). No business logic.
web/           REST controllers + request/response DTOs + mappers. Only calls services.
websocket/     STOMP controllers, ChannelInterceptors, session event handling.
domain/        entities (@Document), enums, policies (Room Type Strategies), domain exceptions.
service/       use cases, @Transactional, permission checks via RoomAuthorizationService.
repository/    Spring Data interfaces. Only services may call repositories.
security/      UserPrincipal, @CurrentUser resolver, RateLimitingFilter, WsTokenService.
```
Strict Rules:
- Controllers MUST NOT inject repositories.
- Entities MUST NOT be returned directly in APIs: always map to DTOs (records).
- User identity is retrieved from `Principal`/`@CurrentUser`, NEVER from the request body or payload.
- Any new STOMP destination must be added to `docs/design/websocket-protocol.md` and to the interceptor authorization rules.

Frontend:
```text
app/           routes (App Router). Do not call APIs directly in pages; go through stores/hooks.
components/    pure UI, receives props. components/ui is shadcn code: do not edit manually.
lib/api/       HTTP client (axios), one file per resource.
lib/realtime/  A SINGLE STOMP client for the whole app (StompProvider).
lib/stores/    Zustand stores.
lib/types/     shared types (generated from OpenAPI when possible).
```

## 4. Code Conventions
- Java: constructor injection (`@RequiredArgsConstructor`), `final` fields; use `record` for DTOs; do not catch `Exception` in services; business errors throw subclasses of `ChatMeeException` with `ErrorCode`; API errors return `ProblemDetail`.
- Validation: `jakarta.validation` (`@Valid` in controllers, `@Validated` in STOMP controllers).
- Time: use `Instant` (UTC), serialize as ISO-8601.
- Logging: SLF4J with parameters; DO NOT log tokens, session IDs, emails, or message contents; no emojis.
- Testing: `*Test` (unit, Mockito), `*WebMvcTest`, `*IT` (Testcontainers). Test names follow `method_condition_expectedResult`.
- TypeScript: no `any`; no `console.log` in committed code; hooks must have full cleanups.
- Naming must be in English, spelled correctly (presence, subscriber, etc.).

## 5. Workflow: spec → design → plan → code → test
1. **Spec**: find or write `docs/specs/SPEC-xxx.md` (using template). Status must be `Approved` before coding.
2. **Design**: if altering data models, WS protocols, authorization or architecture, update `docs/design/*`. For architectural choices, write an ADR.
3. **Plan**: divide work into tickets `CM-xxx` (using template). Each ticket is a small PR with an expected file list and ACs.
4. **Code**: work on branch `feat/CM-xxx-short-name`; for bugs, write a failing reproduction test BEFORE fixing.
5. **Test**: at least one test per AC; run all verification commands; update the spec (`Implemented`, log the test name).
6. **PR**: use the template; link the `SPEC-xxx` and `CM-xxx` in the description.

## 6. Commit Conventions (Conventional Commits)
`<type>(<scope>): <short imperative English description>` with footer `Refs: CM-xxx`
- type: feat | fix | refactor | test | docs | chore | ci | build | perf | security
- scope: backend | frontend | ws | auth | rooms | messages | presence | infra | docs
- Example: `fix(ws): derive sender from STOMP principal instead of payload`

## 7. Forbidden Actions
- Workers MAY commit, but only on their own ticket branch inside their own worktree. They must NOT push, merge, open/close PRs, deploy, or touch `main`/`develop`.
- Explicit forbidden commands: `git push`, `git reset --hard`, `git clean -fdx`, any `--force`/`-f` on git, `rm -rf` / `Remove-Item -Recurse` outside your worktree, `docker system prune`, `docker volume rm`, dropping/deleting databases, editing or printing `.env*` files (except `*.example`), `npm publish`, any curl/HTTP call to production URLs (`*.onrender.com`, `*.vercel.app`, MongoDB Atlas, Upstash), installing global tools, changing git config or credentials, touching other worktrees.
- Do not introduce classes, APIs or dependencies that the ticket does not name.
- DO NOT read, print, or commit secrets (`.env*` except `*.example`); do not add secrets to code, tests, or logs.
- DO NOT expose additional actuator endpoints, do not add new `permitAll` paths, do not disable CSRF or CORS, do not loosen WebSocket origins without an ADR.
- DO NOT edit an `Approved` spec to "make it match" the code. Stop and ask.
- DO NOT delete or rewrite failing tests just to make the build "green". No `@Disabled`, no `-DskipTests` in CI.
- DO NOT add new dependencies without stating the reason in the PR. Do not perform major version upgrades (Spring Boot 4, Next 16) outside a dedicated ticket.
- DO NOT manually edit `components/ui/*` (shadcn), `mvnw*`, `.mvn/`.
- DO NOT silently expand scope: only do what is in the ticket, note new findings in "Follow-ups".
