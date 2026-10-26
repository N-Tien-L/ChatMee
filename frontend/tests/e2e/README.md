# Local full-stack E2E (CM-094)

Status: implementation present; see the CM-094 handoff for verification evidence.
This is an isolated local harness, not release certification or a production login mode.

## Prerequisites and run

Use a dedicated checkout without any frontend/backend .env files. The launcher checks
filenames only and refuses to start if it finds one (except *.example). Never copy real
OAuth credentials, browser storage or production service URLs into this checkout.

Required: JDK 17+, a supported Node LTS (22 or 24 recommended), npm, and a running local
Docker engine with permission to pull the existing mongo:7 and redis:7 images.
The Node version must also satisfy the repository's other frontend dependencies.

From frontend:

    npm ci
    npx playwright install chromium
    npm run test:e2e

The command first tests the target guard, then Playwright owns the stack process:

1. Check that 127.0.0.1 ports 3100, 3101, 8100 and 9100 are free. Never reuse an existing server.
2. Check the local Docker socket (Windows named pipe / Linux Unix socket).
3. Launch the existing Spring Boot plugin's test-run goal using E2eApplication from src/test.
4. Start fresh Mongo and Redis containers with random loopback ports and no shared data.
5. Start the fake OAuth HTTP provider on 9100 and the real ChatMee backend on 8100.
6. Build the actual Next production frontend with the local WebSocket URL, inspect its
   output for fixture markers, and run next start on 3101.
7. Serve a test-only reverse proxy on 3100. /api/*, /oauth2/*,
   /login/oauth2/* and /logout reach Spring; other paths reach Next.
   WebSockets connect directly to 8100 with Origin 3100 and real single-use ws-tokens.

No production Next rewrites, security chain, API, WS destinations, auth/session/CSRF/CORS
contracts or dependencies were changed. The 60-second idle timeout is a test-only
servlet configuration; production still uses its existing timeout/storage.

The launcher accepts no target/service overrides. E2E_BASE_URL must be absent or exactly
http://127.0.0.1:3100. Browser HTTP traffic is allowlisted to the app and provider origins.
Child processes receive only tool/platform environment variables plus fixed local test
settings. Spring receives only classpath configuration, with external environment/system
property sources removed. OAuth registration overrides exist only in src/test/resources.

## Authentication and fixtures

The provider supports authorization, token and user-info requests using only the JDK HTTP
server. It validates the callback/client/grant, echoes state, expires and consumes codes,
and validates the client secret for the token exchange. Alice/Bob selection happens on
the fake provider's own page. Spring's normal authorization-code callback, user mapping,
session creation, cookies and CSRF handling remain authoritative. Deny exercises the normal
OAuth error callback. It is a GitHub-shaped OAuth fixture, not OIDC or a real GitHub clone.

fixtures/local-stack.ts supplies isolated alice and bob browser contexts with distinct
synthetic accounts and real server sessions. No storageState file, session injection,
identity header or application bypass endpoint is used. Data is fresh per suite run;
contexts are fresh per test. Later CM-097 tests can reuse these fixtures.

## Cases and fault labels

- Login, distinct identities/sessions, cookie HttpOnly/SameSite, reload, signed-in login
  redirect, and logout isolation: real local OAuth/session/backend.
- Rejected logout: remove the actual outgoing CSRF header and assert Spring's 403, retained
  identity and room, then send a real message and verify persisted history.
- Confirmed logout: observe client socket close, cleared persisted account, guest /auth/me,
  and no prior-account room access after signing in as Bob.
- Expiry: leave the real HTTP session idle beyond its test timeout, reload, and assert guest
  state and no further token request. The 65-second quiet interval creates actual expiry;
  UI checks use observable conditions, not that delay as a success assertion.
- ws-token 401 and subsequent guest /auth/me: explicitly simulated expiry responses.
- /auth/me and ws-token network/503: selective simulated faults; recovery returns to real
  endpoints. A restored token request must connect the real WebSocket.
- Denied OAuth: provider error callback and frontend failure message.

No claim is made about server-side revocation of already-open WebSockets or outstanding
ws-tokens on logout/expiry. Those remain the Approved v0 deferrals. Real Google/GitHub
callback/deployment and mobile keyboard smoke belong to owner-run CM-099.

## Artifact and dependency checks

@playwright/test is pinned to 1.58.2 as a devDependency, with its matching transitive
playwright/playwright-core packages. It supplies the test runner, browser contexts and
assertions; its published Node engine requirement is >=18. No other direct dependency
or framework upgrade is introduced. The existing Spring Boot test-run goal already
supports a test main class, so no Maven plugin/dependency change is needed.

E2ePackagingIT runs after package in mvnw verify and checks the normal executable JAR:
main application present, test launcher/provider package and registration resource absent.
check-artifact.mjs scans generated frontend JavaScript for fixture markers after next build.
Vitest excludes tests/e2e because those files belong to Node/Playwright, preserving its
default excludes and all existing unit tests.

Docker-independent checks (not a substitute for the full gate):

    # backend (use mvnw.cmd on Windows)
    ./mvnw -Dtest=LocalOAuthProviderTest package failsafe:integration-test failsafe:verify -Dit.test=E2ePackagingIT

    # frontend
    node --test tests/e2e/local-only.test.mjs
    npm run build
    node tests/e2e/check-artifact.mjs
    npx playwright test --list

References: [Spring Boot test-run](https://docs.spring.io/spring-boot/maven-plugin/run.html)
and [Playwright](https://playwright.dev/docs/intro).

## Troubleshooting and cleanup

If startup fails, check docker info first. To diagnose the backend directly, from backend:

    ./mvnw spring-boot:test-run -Dspring-boot.run.main-class=com.lnt.chatmee.e2e.E2eApplication

Use this only in the dedicated local checkout. Do not add profile/target overrides.
Readiness is bounded and non-200 health or a child exit fails the run.
On normal Java shutdown its hook closes the provider, app and owned containers.
Testcontainers' resource reaper handles container cleanup after forced process termination.
On Windows the runner terminates only its spawned process trees; it never prunes Docker,
removes volumes by name, kills processes by executable name, or touches shared databases.
A hard runner crash may require inspecting its exact recorded PIDs/owned containers.

Traces, screenshots, video and persisted browser storage are disabled to avoid recording
cookies/tokens. Only synthetic test data is permitted. Do not commit raw logs or failure
artifacts. Production artifact checks and local tests do not certify deployed OAuth settings.

## Scope boundary

CM-094 stops at this harness. CM-095 owns multi-page recovery, CM-096 unread fixes,
CM-097 broader two-user/mobile coverage, CM-098 CI, and CM-099 release evidence.
Do not weaken assertions or production authorization to make a new browser failure pass.


## CM-095 reconnect recovery case

`reconnect.spec.ts` cuts only Alice's proxied WebSocket (explicit simulated outage),
keeps her real HTTP session alive and sends 105 messages as Bob through the unchanged
local STOMP/persistence path, paced below the existing send limit. On reconnection,
the DOM server IDs must equal a complete cursor walk of persisted history, including
order and uniqueness. OAuth, memberships and REST responses are not mocked.
The case has a 240-second bound; pacing creates the allowed send workload, while
assertions wait on observable persistence, socket/UI state and message IDs.

Browser execution still requires the Docker-enabled CM-094 stack. Test collection
or unit passes do not establish that this full-stack case passed. See the CM-095
handoff for current results; CM-097 owns the wider two-user/mobile journey suite.
