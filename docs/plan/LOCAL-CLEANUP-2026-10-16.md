# Repository cleanup - 2026-10-16

Owner requested selective commits, preservation of unfinished work, a develop push,
Dependabot PR cleanup and removal of completed worktrees. This is repository
housekeeping, not v0 production sign-off.

## Preserved and committed

| Commit | Content |
| --- | --- |
| `21c86ff` | v0 readiness A/B and smoke reports; historical readiness notes distinguish the reviewed baseline from later fixes |
| `b4b8059` | Frontend workflow research, CM-081/082 prompts and reports, CM-083 comparison report and 30 screenshots |
| `6d1cfee` | ADR-0007 room-share proposal and Draft SPEC-010 room-share document; statuses unchanged |
| `cd482a5` | Root ignore rules and Next-generated frontend agent guidance |
| `5a1dd9e` | Defer Dependabot major version proposals; retain weekly minor/patch groups |

Local skills, machine settings, logs, browser captures and worktrees stay on disk
and are ignored. `skills-lock.json` belongs to the local, unvendored skill install
and is ignored with it. Environment files remain local; example files are allowed.

## Unfinished work retained separately

- `feat/CM-085-user-discovery-plan`: `ef344ad` saves 65 files as a WIP checkpoint,
  based on `2ee3b81`. Original verification remains historical evidence; integration
  with current develop, live OAuth, owner acceptance and rollout are pending.
- `feat/CM-093-message-time-reveal`: retained at `70d7387`, still a draft.
- Neither feature was merged into the v0 code during cleanup. Both worktrees are
  clean and retained locally. Their commits are also in the local branch bundle.
- Existing naming collisions need reconciliation before discovery integration:
  ADR-0007 and SPEC-010 are used by both discovery and room-share documents;
  CM-085/086 also name unrelated readiness work. Approved documents were not renamed.

## Branch and worktree cleanup

Across this cleanup and its initial audit, local branches go from 29 to 9 after
deleting the temporary housekeeping branch. Eleven completed worktrees were removed:
four readiness/UI worker worktrees, CM-089/090/091, and the four lab variant worktrees.
The four lab variants remain reachable through `lab/frontend-eval`.

Retained branches:

- `main`, `develop`
- `release/v0-integration` (the running local backend uses this worktree)
- `feat/CM-085-user-discovery-plan`, `feat/CM-093-message-time-reveal`
- `lab/frontend-eval`
- `chore/CM-081-ui-tooling`, `feat/CM-082-landing-login`, `feat/CM-084-airmail-try`
  (historical alternatives containing commits outside develop)

Five registered worktrees remain: the root, the running release worktree, the two
unfinished features and the tool-managed detached Kilo pool checkout. The pool was
left to its owning tool.

## GitHub cleanup

Develop was pushed normally, without a force update. Main remains `3cb5f89`.

- Closed PRs #2 and #3: Springdoc 3.1.1 and Spring Boot 4.1.1 already exist on develop.
- Closed PRs #4, #5, #8, #9, #10, #11, #12 and #14: major version upgrades are
  deferred to dedicated maintenance work; no dependency upgrade was merged.
- Deleted the remote branch of each of these ten closed PRs and pruned local refs.
- Retained [Maven minor/patch PR #1](https://github.com/N-Tien-L/ChatMee/pull/1) and
  [frontend minor/patch PR #13](https://github.com/N-Tien-L/ChatMee/pull/13).
- Verified four remote branches remain: main, develop and those two PR branches.

The major-version ignore rules are committed on develop. Dependabot reads its
configuration from the default branch, so these rules become active after the
eventual merge into main. See the [GitHub configuration reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

## Verification

Local gates ran on the housekeeping checkout; application code is unchanged from
the pushed v0 integration. The final report commit changes only this document.

| Check | Result |
| --- | --- |
| Backend `mvnw.cmd -B clean verify` | PASS: 582 unit/slice + 105 integration tests, 0 failures/errors/skips; JaCoCo passed |
| Frontend lint | PASS: 0 errors, 10 warnings |
| TypeScript | PASS |
| Vitest | PASS: 57 files, 382 tests |
| Production build | PASS |
| Dependabot YAML | Parsed with existing js-yaml; 3 ecosystems, major deferral and minor/patch groups checked |
| Whitespace | `git diff --check` passed |
| Candidate text scan | No high-confidence private-key, provider-token or credential-bearing Mongo URI patterns found; not a full secret-history audit |

GitHub results:

- [Backend CI](https://github.com/N-Tien-L/ChatMee/actions/runs/38891626112): success on `d370462`; later housekeeping does not change backend source.
- [Frontend CI](https://github.com/N-Tien-L/ChatMee/actions/runs/38891687989): success on `5a1dd9e`, Node 20 and 22.
- [CodeQL](https://github.com/N-Tien-L/ChatMee/actions/runs/38891687958): success on `5a1dd9e`, Java and JavaScript/TypeScript.

## Local recovery evidence

Keep `.git/cleanup/`; these backups are local and are not pushed:

- `pre-cleanup-all-branches-20261016.bundle`: verified complete history for all
  pre-cleanup local branch tips, including both unfinished features.
- `remote-branches-before-cleanup-20261016.bundle`: remote refs before PR cleanup.
- `worktree-state-20261016/`: local tool state, generated guidance and the uncommitted
  lab-k2 frontend ignore change (`lab_eval-k2/frontend-gitignore.patch`).
- JSON inventories record removed branch tips and PR outcomes; gate logs are here too.

Production secret rotation, snapshots/backfills, environment confirmation, release
sign-off, main merge, deployment and production smoke remain separate owner work.
