# CM-106: Provide an isolated synthetic candidate preview
- Status: Authorized; implementation pending.
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
- [ ] Start and smoke both synthetic accounts on fixed separate preview ports.
- [ ] Snapshot isolation and rejected override/occupied-port behavior verified.
- [ ] Owned teardown verified without touching any existing server/database.
- [ ] Full final backend/frontend/E2E gates pass; real providers/mobile and release remain pending.

Native CM-105 ordering prototype is preserved on its own branch and excluded until its
three multi-session IT failures are resolved or the owner chooses another strategy.
