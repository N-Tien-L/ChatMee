# CM-106: Provide an isolated synthetic candidate preview
- Status: Complete locally at candidate 40a3b88; release remains pending owner actions/remote CI.
- Type: test/tooling. Spec: SPEC-012 AC-012-1..4.

## Expected files
frontend/tests/e2e/run-preview.mjs, preview-only.test.mjs, README.md;
frontend/package.json; root .gitignore; backend/src/test/java/com/lnt/chatmee/e2e/
E2eApplication.java, LocalOAuthProvider.java, LocalOAuthProviderTest.java.
No production frontend/config edit or new dependency. Snapshot frontend source/config
and backend classes into a unique ignored .local-preview run folder; reuse locked local
dependencies through a junction. Test-only --preview selects fixed loopback ports and
30-minute synthetic HTTP session timeout. Default E2E mode is unchanged.

## Acceptance criteria
- [x] Start and smoke both synthetic accounts on fixed separate preview ports.
- [x] Snapshot isolation and rejected override/occupied-port behavior verified.
- [x] Owned teardown verified without touching any existing server/database.
- [x] Full final backend/frontend/E2E gates pass; real providers/mobile and release remain pending.

Native CM-105 ordering prototype is preserved on its own branch and excluded; owner chose one inbound worker instead (ADR-0008), verified at 40a3b88. It is not included in the owner preview.

## Final candidate verification (2026-10-26)

Candidate 40a3b88: backend verify 618 unit/slice +107 IT PASS, coverage/packaging PASS;
frontend lint/strict TypeScript/447 tests/build PASS; exact npm run test:e2e 30/30 PASS,
no retries/skips. See [hardening report](V0.2-M1-HARDENING-REPORT.md) for per-AC,
commands, evidence and boundaries. Historical pending statements above refer to those
intermediate runs; this final result supersedes their local gate state only.
Remote CI, real providers/physical mobile and owner release sign-off remain pending.
