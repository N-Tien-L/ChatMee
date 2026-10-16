# CM-094: Replace the default browser favicon

- Status: implemented; favicon verified; owner visual review pending
- Type: feat
- Spec: SPEC-008 (Approved), existing visual system CM-084
- Authorization: owner chat, 2026-10-16; latest clarification: favicon only
- Branch: `release/CM-094-favicon`, based on production `origin/main` at `8ffb9c2`

## Scope and expected files

- `frontend/app/favicon.ico`: replace the default icon using the supplied `chatmee_logo.png`.
- `frontend/assets/brand/chatmee-logo.png`: original artwork moved from the repository root; checksum preserved.
- This ticket. No page, header, login, component, or dependency changes.
- Original PNG preserved under `frontend/assets/brand/`. Conversion crops only transparent horizontal margins
  to fit a square and embeds transparent 16, 32, 48, 64, 128 and 256 px PNG frames in ICO.

## Acceptance and verification

- [x] New favicon returns HTTP 200 and the production page references its hashed URL.
- [x] The ICO is valid, with six image frames and alpha transparency.
- [x] All page and component files match the starting commit.
- [x] `git diff --check` passes.
- Frontend checks before removing the login placement: lint passed (0 errors, 10 existing
  warnings), TypeScript passed, 57 Vitest files / 382 tests passed, production build passed.
- Backend `mvnw.cmd -B verify`: BUILD SUCCESS; 582 unit/slice and 105 integration tests,
  no failures/errors/skips; JaCoCo passed. No backend changes.
- Final favicon-only `npm run build`: passed, including TypeScript.
- Integration: real static favicon. Owner visual acceptance: not reviewed.
- Owner explicitly authorized direct production deployment in chat on 2026-10-16. Commit and push to the existing production branch are in scope; release verification pending.



## Production release preparation

- Production baseline: `origin/main` at `8ffb9c2`; Vercel Production deployment
  `7117852410` succeeded for that commit before this release.
- Source asset moved to `frontend/assets/brand/chatmee-logo.png`; SHA-256 unchanged:
  `2BDB99E462969416F6AA5E381217CA98ED9FCBF4721F08B9CE48D3F4BA66AE70`.
- Release branch uses the existing production lockfile without dependency edits.
- Rechecked lint (0 errors, 10 existing warnings), TypeScript, and all 382 tests / 57 files
  with production dependencies. Build result and live favicon verification follow.
- Production favicon before this release: HTTP 200; SHA-256
  `2B8AD2D33455A8F736FC3A8EBF8F0BDEA8848AD4C0DB48A2833BD0F9CD775932`.
- Production release build: passed on Next.js 16.4.0 with the existing production lockfile.
- New favicon SHA-256:
  `27EF84E0BC4AF682A1447F2C90BDF584F6CC71008DF9562A764E1AFEBD4E180E`.
- A local `backend/mvnw.cmd` CRLF/LF-only discrepancy is excluded from the release.
  Its content was backed up and compared after line-ending normalization.
