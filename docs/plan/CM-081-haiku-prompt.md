# CM-081 worker prompt (for Haiku 5.5)

You are a worker. Follow this file literally, step by step. Do not improvise. Do not skip a step. If a step says STOP, stop and write your report. Work in English. The final REPORT is written in Vietnamese.

## 0. Rules you must never break
- Repo: `C:\Users\Tien\Workspace\Personal\ChatMee`. Read `AGENTS.md` and `CLAUDE.md` first (once).
- Git: work ONLY on branch `chore/CM-081-ui-tooling`, created from `develop`. You MAY commit. You must NOT push, merge, open PRs, touch `main`/`develop`, or use `--force`.
- Never read, print, or commit `.env*` (except `*.example`). Never write API keys into any tracked file. Secrets only via `${ENV_VAR}` placeholders.
- Do NOT edit `frontend/components/ui/*` by hand. Do NOT run `shadcn init`. Do NOT change colors/tokens/theme. Do NOT edit M4 tickets (CM-066, CM-079, CM-080) or any page under `frontend/app/`.
- Free only. No Magic UI Pro, Aceternity paid, React Bits Pro, paid templates. Never call 21st AI generation/refinement tools. Never spend a 21st copy/install.
- Do not install a component just to test. Do not download a whole catalog.
- If a command fails: read the error once, try ONE fix. If it still fails, do not loop. Mark that item `BLOCKED` in the report and continue with the next independent step.
- Official docs are the reference for commands. If a doc URL cannot be fetched, say `UNVERIFIED` and use `npx <tool> --help` instead. Never invent a command or flag.
- Prefer `mcp__tinyfish__fetch_content` for reading web pages, if available. Otherwise use WebFetch.
- Keep your context small. Do not paste large files into your own messages.

## 1. Prepare
1. `git status` must show only `?? .claude/` as untracked. If anything else is dirty, STOP.
2. `git switch -c chore/CM-081-ui-tooling` (from `develop`).
3. Read: `frontend/components.json`, `frontend/package.json`, `frontend/app/globals.css` (first 60 lines only), `.claude/skills/` (list only), `docs/plan/_TICKET_TEMPLATE.md`.
4. List `frontend/components/ui/shadcn-io/*` and for each of the 3 components (`blur-text`, `dark-veil-background`, `flip-words`) read the file header and `package.json` dependencies they use, to find their origin (comments, import paths). If origin is unclear, write `origin: unknown (likely shadcn.io / React Bits style)`. Do not guess further.
5. Check if the tools already exist: run `claude mcp list`, and list `.claude/skills` and `~/.claude/skills`. Record what is already installed. Reuse it; do not duplicate.

## 2. Create the ticket file
Create `docs/plan/CM-081-ui-tooling.md` using `_TICKET_TEMPLATE.md`:
- Type: chore. Priority P1. Estimate M. Depends on: none. Blocks: none (M4 is not blocked).
- Goal: set up AI-assisted UI sourcing (Magic UI, Aceternity, React Bits, 21st Free via shadcn registries and MCP, Impeccable skill, Playwright MCP) and a documented workflow; no production UI change.
- Out of scope: any page change, theme/token change, M4 tickets, redesign.
- Expected files: `.mcp.json`, `frontend/components.json` (registries only), `.claude/skills/*` (Impeccable, shadcn), `docs/design/ui-workflow.md`, `frontend/components/PROVENANCE.md`, `AGENTS.md` (3-line pointer), `.gitignore` if needed.
- ACs: each integration verified by a real call (not config only); provenance file exists; workflow doc exists; `npm run lint && npx tsc --noEmit` green if any frontend file changed.

## 3. Read current official docs (one fetch each, skim only what you need)
- https://github.com/pbakaus/impeccable
- https://ui.shadcn.com/docs/skills
- https://ui.shadcn.com/docs/mcp
- https://magicui.design/docs/installation
- https://ui.aceternity.com/docs/cli
- https://reactbits.dev/get-started/installation
- https://reactbits.dev/get-started/mcp
- https://21st.dev/mcp
Write down for each: exact install command, the registry namespace/URL, and any auth requirement. Note anything that differs from this prompt.

## 4. Install, in this order
Run frontend commands from `frontend/`. Use `npx`, not global installs.

### 4.1 Skills (project-scoped, into `.claude/skills/`)
- Impeccable: use the install method from its README. Confirm the skill folder lands under `.claude/skills/` and contains a `SKILL.md`. If its installer targets another location, move nothing by hand; instead use the documented project-scope option, or mark BLOCKED.
- shadcn skill: use the command from the shadcn skills doc. Same location check.
- Do not install any other design skill.

### 4.2 Registries in `frontend/components.json`
- Edit ONLY the `"registries"` key. Keep every other key as is. Add official entries for Magic UI, Aceternity UI, React Bits using the namespaces/URLs from their docs (usually `@magicui`, `@aceternity`, `@react-bits`). Use only free registries.
- Validate: `components.json` is valid JSON (`node -e "JSON.parse(require('fs').readFileSync('components.json','utf8'))"`).
- Check once whether `"tailwind.config": "tailwind.config.ts"` is still valid for Tailwind 4 (the project uses `@tailwindcss/postcss`). Only REPORT the finding. Do not change it.

### 4.3 MCP servers in `.mcp.json` at repo root
Create or merge; never overwrite existing entries. Windows rules: wrap every npx server as `"command": "cmd", "args": ["/c", "npx", "-y", ...]`. Add exactly these:
1. shadcn MCP (registries access) per `ui.shadcn.com/docs/mcp`.
2. Playwright MCP (`@playwright/mcp`), unless `claude mcp list` already shows one.
3. 21st MCP: FIRST read its docs and list which tools it exposes. Decide:
   - If there is a search/browse tool that does NOT use AI generation or a copy quota: add it, with the key as `${TWENTY_FIRST_API_KEY}` (use the exact variable name its doc says if different).
   - Otherwise do NOT add it; record `SKIPPED: only generation tools on Free` in the report.
   Also record the Free-tier copy/install limit stated on the official page (expected 2/day, mark UNVERIFIED if the page does not say).
Do NOT add library-specific MCP servers for Magic UI, Aceternity, or React Bits unless the shadcn MCP cannot reach their registry. React Bits MCP: skip if the shadcn registry already works (step 5).

## 5. Verify (real calls, read-only)
For each item write PASS / FAIL / BLOCKED / UNVERIFIED and one line of evidence.
1. Skills: `ls .claude/skills` shows impeccable and shadcn folders each with `SKILL.md`.
2. `.mcp.json` valid JSON; `claude mcp list` shows the servers (a MCP may need the user to approve trust and restart, then mark `needs restart`, not FAIL).
3. Registry discovery (no install): `npx shadcn@latest search @magicui -q "marquee"` (or the documented list/search command), same for `@aceternity` and `@react-bits`. Show 1 real component name from each. If the CLI lacks search, use `npx shadcn@latest view @namespace/item` (view prints source without installing). Never run `add`.
4. 21st: only if the API key env var is set (check with `node -e "console.log(!!process.env.TWENTY_FIRST_API_KEY)"`, never print the value). If unset, mark `BLOCKED: needs login/key` and give the exact user step from its docs.
5. Playwright: open `https://example.com` through the Playwright MCP, or if MCP is not yet loaded, run `npx playwright --version` and mark MCP as `needs restart`. Never open production URLs.
6. Config checks vs connection tests: label which is which. Never write "working" from config alone.

## 6. Write the shared workflow doc: `docs/design/ui-workflow.md`
English, under 70 lines, so any agent (Claude, others) can follow it. Include:
1. Inspect existing `components/` and design tokens (`globals.css`) first; reuse what is installed.
2. Choose library by the component and product context. Prefer Magic UI / Aceternity / React Bits free components; use 21st for discovery and selected components within quota.
3. Fetch actual source (`npx shadcn@latest view @ns/item` before `add`), read its API, dependencies, license. Never invent an API. Never claim a component was sourced if it was written from scratch.
4. Install adapted third-party components into `frontend/components/fx/`, NOT `components/ui/`. Adapt to project colors, typography, spacing, radius, dark mode, motion.
5. Keep semantic HTML, keyboard use, visible focus, responsive layout, `prefers-reduced-motion`.
6. Chat screens prioritize readability and information density. Heavy effects only on landing/login. Compose into a coherent UI; do not paste unrelated demos.
7. Use Impeccable for direction, critique and scoped refinement. Project UI standards stay authoritative; if a library or skill conflicts with them, explain and resolve in the PR.
8. Verify in a browser (Playwright MCP / `playwright-tester` skill). Bounded: inspect, fix identified problems, confirm. No open-ended polish loops.
9. Record every added component in `frontend/components/PROVENANCE.md`.
10. Free only; 21st quota rules; no 21st generation tools; do not bypass quotas.
11. Portability note: this file and the commands in `.mcp.json` are meant to be copied to other projects; ChatMee-specific rules are marked `(ChatMee)`.

## 7. Provenance file: `frontend/components/PROVENANCE.md`
Table columns: Component | Path | Source URL | Registry/variant | License | Dependencies | Modifications. Add rows for the 3 existing `shadcn-io` components (use `unknown` where not provable). Add a one-line instruction on how to add rows.

## 8. Pointer in AGENTS.md
In section 3, under "Frontend", add at most 3 lines: UI component sourcing follows `docs/design/ui-workflow.md`; third-party components go in `components/fx/`; record provenance in `frontend/components/PROVENANCE.md`. Change nothing else in AGENTS.md. (CLAUDE.md already imports AGENTS.md, so leave it unchanged.)

## 9. Impeccable design context
Draft a design context for ChatMee using Impeccable's documented context step (do not save a final version): real-time chat app; portfolio/CV showcase; audience is recruiters; chat screens favor readability; effects only on landing/login; supports dark mode. Put the draft in the report under "Needs owner confirmation". Do not write it into the repo.

## 10. Checks and commit
1. If any file under `frontend/` changed other than `components.json` and `components/PROVENANCE.md`, STOP and revert it; you were not asked to.
2. In `frontend/`: `npm run lint && npx tsc --noEmit`. Report result. (Docs/JSON-only changes still run these once.)
3. `git add` only the files you created or edited (never `git add -A`; `.env*` must not be staged). Check `git diff --cached --stat` has no secrets.
4. Commit in 1-2 commits, format: `chore(frontend): set up UI component tooling` with footer `Refs: CM-081`. Do not add attribution lines.
5. Do not push.

## 11. Report
Write the report to `docs/plan/CM-081-REPORT.md` (uncommitted file is fine; do not commit it). Vietnamese. Max 60 lines. Sections:
1. Đã cài / tái sử dụng (table: item, status, command used).
2. Files thay đổi và lý do.
3. Kết quả kiểm tra từng tích hợp (PASS / FAIL / BLOCKED / UNVERIFIED + bằng chứng; tách "kiểm tra cấu hình" và "kiểm tra kết nối thật").
4. Việc owner cần làm (login 21st, approve MCP trust, restart Claude Code, chạy lại `claude mcp list`).
5. Phát hiện mới / Follow-ups (ví dụ: `tailwind.config` trong components.json, nguồn gốc 3 component shadcn-io). Không tự làm.
6. Bản nháp design context chờ xác nhận.
7. Cách bắt đầu dùng: ví dụ 3 prompt:
   - "Dựng trang X bằng component có nguồn từ registry, theo `docs/design/ui-workflow.md` và design system của dự án."
   - "Tìm nền động phù hợp cho trang login, chỉ dùng Magic UI/Aceternity/React Bits (không dùng quota 21st), xem source bằng `shadcn view` trước khi cài."
   - "Dùng Impeccable review trang Y, sửa các vấn đề tìm được, rồi kiểm tra bằng Playwright; dừng sau một vòng."
