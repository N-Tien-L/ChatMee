# SPEC-012: Isolated local candidate preview
- Status: Approved by the owner request to test while implementation continues (2026-10-26).
- Owner: @N-Tien-L · Related: CM-106; existing CM-094 local OAuth fixture.

## 1. Goal
Let the owner exercise a frozen local candidate with synthetic accounts, fresh local
data and ports separate from automated E2E, without credentials or production access.

## 2. Non-goals
Deployment, real OAuth/account access, production data, paid service, hot-reloading an
unverified source tree, or replacing the full repository/E2E/owner release gates.

## 3. User stories
- As an owner, I can open a local preview and test two accounts while E2E uses its own stack.

## 4. Acceptance criteria
- AC-012-1: npm run preview:local starts a loopback-only preview on 3200/3201/8200/9200,
  fresh owned Mongo/Redis and synthetic OAuth; no URL override or env-file read.
- AC-012-2: Preview frontend and backend classes are snapshots in ignored runtime output;
  subsequent source builds/E2E use independent files, data, processes and browser sessions.
- AC-012-3: Unknown/nonlocal overrides fail before services; occupied ports are preserved;
  stop/failure targets only recorded owned processes and Testcontainers resources.
- AC-012-4: Existing E2E 3100/3101/8100/9100, production packaging/auth exclusion and all
  repository gates pass; preview/browser smoke remains synthetic, not real-provider proof.

## 5. Edge cases & Errors
Missing Docker/JDK/dependencies, occupied preview ports or failed build/readiness fail
clearly with bounded startup. No process-by-name kill, shared database cleanup or prune.

## 6. Security & Authorization
Existing authorization-code/session/CSRF flow; test-only launcher/provider excluded
from production package. No bypass header, new permitAll, wider production origins or secrets.

## 7. Non-functional
One local preview process group; an immutable snapshot per run. No new dependency.

## 8. Related APIs / Protocols
Existing local fixture only. Preview is not an additional production endpoint/destination.

## 9. Open questions
Ordering owner choice remains separate; preview identifies its exact source candidate.
