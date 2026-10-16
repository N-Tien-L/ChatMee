# CM-082 worker prompt: new landing + login (UI tooling pilot)

Goal: build a public landing page and redesigned login for ChatMee using the tooling from CM-081, as a pilot to judge how good AI-built UI is with Impeccable + shadcn registries + Playwright. Work in English; write the final report in Vietnamese to `docs/plan/CM-082-REPORT.md` (do not commit the report).

## 0. Rules
- Read `AGENTS.md`, `CLAUDE.md`, `docs/design/ui-workflow.md`, `frontend/components/PROVENANCE.md` first. Follow `ui-workflow.md` literally.
- Work in the main checkout (not a new worktree): `.claude/agents/` and `.claude/skills/playwright-tester/` are untracked and only exist here.
- Preflight, stop and report if any fails: `.claude/skills/impeccable/SKILL.md`, `.claude/skills/shadcn/SKILL.md`, `.claude/skills/playwright-tester/` exist; the shadcn and playwright MCP tools are available in this session (`claude mcp list` shows them Connected).
- Branch `feat/CM-082-landing-login` from the CM-081 branch tip (`chore/CM-081-ui-tooling`), or `develop` if CM-081 is merged. Commits allowed; NO push, merge, PR, or force. Never read/print `.env*`.
- Create `docs/plan/CM-082-landing-login.md` from `_TICKET_TEMPLATE.md` first: type feat, Spec: none (owner-approved UI pilot, no SPEC needed), scope UI only, ACs from section 0.1 verbatim.
- Scope (may edit/create): `frontend/app/page.tsx` (landing), `frontend/app/login/*`, `frontend/components/LoginForm.tsx` (+ its test), new files under `frontend/components/fx/` and `frontend/components/landing/`, `frontend/components/PROVENANCE.md`, `PRODUCT.md` (Impeccable init output). `components/background/LoginBackGround.tsx` may be restyled or no longer used; do not delete it (note it as a follow-up if unused).
- Do NOT touch `/dashboard`, `/profile`, chat/room components, `components/ui/*`, `app/layout.tsx`, `app/globals.css`, `proxy.ts`, backend, auth logic, API calls, `next.config`, or `package.json` except for a dependency a chosen component needs. Do not create or replace `DESIGN.md` (it would describe the whole app; follow-up). Other Impeccable artifacts (config, briefs): leave uncommitted and list them in the report.
- Keep the GitHub OAuth login flow behavior identical (same link/redirect, same session check, same test expectations). The text "Sign in to ChatMee" must stay exactly as is (tests query it).
- Free components only, from `@magicui`, `@aceternity`, `@react-bits` via the shadcn MCP/CLI. No 21st. Never paste a component you did not fetch; never invent an API.
- No new dependency unless a chosen component needs it; list each one in the report with the reason.
- Keep verification bounded: build, inspect, fix what you find, confirm. Max ONE critique-and-fix round.

### 0.1 Owner decisions (final, do not re-ask)
- Theme: landing and login are **dark only**. The app has `.dark` tokens but no theme switch; a switch is a separate ticket. Wrap each page's root in an element with class `dark` so the existing dark tokens and `dark:` variants apply. Do not add `next-themes` or edit `layout.tsx`/`globals.css`.
- `/` shows the landing to everyone, as a static page with no session check and no API call. Its CTA links to `/login`, which already sends signed-in users to `/dashboard`.
- Fonts: existing only (Geist, Geist Mono, Borel for the wordmark). No new fonts.
- This brief and the existing tokens override Impeccable defaults. It is a redesign of these two pages only, not a new visual world for the app.

### 0.2 Acceptance Criteria
- AC-1: `/` renders a landing page (no redirect) with exactly one `h1`, `header`/`main`/`footer` landmarks, and a keyboard-reachable "Sign in with GitHub" link to `/login`.
- AC-2: `/login` keeps its behavior: valid session -> `replace('/dashboard')`; no session -> form with "Sign in to ChatMee" and the same GitHub OAuth link. Existing tests in `app/login/page.test.tsx` and `components/LoginForm.test.tsx` pass unchanged (or with only markup-query updates explained in the report).
- AC-3: At 360px wide, both pages have no horizontal scroll; layout works at 768 and 1440.
- AC-4: With `prefers-reduced-motion: reduce`, animations stop or become static; decorative layers have `aria-hidden`.
- AC-5: Every added third-party component lives in `components/fx/` and has a row in `PROVENANCE.md`.
- AC-6: `npm run lint && npx tsc --noEmit && npm test && npm run build` pass; no console errors on either page.

## 1. Understand the project (short)
1. Read `frontend/app/page.tsx`, `app/login/page.tsx`, `app/login/layout.tsx`, `components/LoginForm.tsx`, `LoginForm.test.tsx`, `app/login/page.test.tsx`, `app/globals.css` (tokens, `.dark` block), `components/background/*`, `components/ui/shadcn-io/*` (existing effects: blur-text, dark-veil-background, flip-words).
2. Note existing tokens (colors, radius, fonts). They stay authoritative: adapt components to them; do not replace the theme.

## 2. Design direction (use the `impeccable` skill)
1. Invoke the Impeccable skill. Run its context/init step (writing `PRODUCT.md` is allowed). Use this brief as the answers; do not ask me unless it blocks you:
   - Product: ChatMee, real-time chat app (rooms, direct messages, presence), also a portfolio piece for a Java/Spring Boot internship application.
   - Audience: recruiters and engineers spending under a minute on the landing page; end users signing in with GitHub.
   - Tone: confident, calm, technical-modern. Not generic SaaS purple-gradient. Avoid the standard centered-hero-with-three-feature-cards template.
   - Landing content: what it is, 3-4 real capabilities (realtime STOMP/WebSocket messaging, presence and typing, rooms and DMs with block/consent safety, OAuth2 session auth), a live-looking chat preview built from static mock data, stack line (Spring Boot, MongoDB, Redis, Next.js), link to GitHub repo placeholder `#`, primary CTA "Sign in with GitHub" to `/login`.
   - Login: single clear action, brand, short trust line. Effects allowed here and on landing only.
   - Dark only (see 0.1). Must support mobile (360px) and desktop, and `prefers-reduced-motion`.
2. Write the direction (1 short paragraph + typography use, color use, motion rules) at the top of `docs/plan/CM-082-landing-login.md`.

## 3. Source components (use shadcn skill + MCP)
1. Use the shadcn skill/MCP to SEARCH (never `add` yet) in each registry. Shortlist at most 5 components total for: a hero background or accent, a text/heading effect, one card/preview effect, one subtle interaction (button/border). Examples to look at, not mandatory: `@magicui/border-beam`, `@magicui/marquee`, `@aceternity/spotlight`, `@react-bits` text/background items.
2. For each shortlisted item run `npx shadcn@latest view @ns/item` (or MCP equivalent). Read source, dependencies, license. Reject anything heavy (WebGL/three.js) unless it clearly earns its place and respects reduced motion; prefer CSS/motion-based items (`motion` is already installed).
3. Reuse the existing `dark-veil-background`, `blur-text`, `flip-words` if they fit, instead of fetching duplicates (import them; do not edit files under `components/ui/`).
4. Install chosen items with `npx shadcn@latest add @ns/item --path components/fx` from `frontend/`. Never pass `--overwrite`; decline any overwrite prompt. Right after each add, run `git status` and `git diff`: if the CLI modified any existing tracked file (e.g. `components/ui/*`, `lib/utils.ts`, `globals.css`), restore it with `git restore <file>` and adapt the component instead. Fix import paths. Adapt colors to tokens, add reduced-motion handling, add `aria-hidden` to decorative layers.
5. Add one row per component to `frontend/components/PROVENANCE.md` (source URL, registry, license, dependencies, modifications).

## 4. Build
1. Landing: `frontend/app/page.tsx` composes sections from `components/landing/*` (e.g. `Hero`, `ChatPreview`, `Capabilities`, `StackStrip`, `Footer`). Static mock data only; no API calls; no `any`; no `console.log`. Keep it a server component where possible; isolate client-only effects.
2. Chat preview: a static, realistic conversation (2-3 people, typing indicator, presence dots) that reuses the project's message bubble look if available (check `components/chat/`, import only, do not edit); otherwise simple and consistent with tokens.
3. Login: restyle page + layout + `LoginForm` (keep behavior, the session check, and text used by tests). Update a test only if markup it queries intentionally changed; never delete or `skip` tests.
4. Semantics: one `h1` per page, landmarks (`header`, `main`, `footer`), visible focus rings, keyboard-reachable CTA, sufficient contrast, images with alt, no layout shift.
5. Keep files small and readable; follow existing naming and style. TypeScript strict.

## 5. Verify
1. Run in `frontend/`: `npm run lint && npx tsc --noEmit && npm test && npm run build`. All must pass (existing lint warnings are OK, no new errors).
2. Start `npm run dev` in the background (no backend needed; on `/login` the session check fails and the form shows). Use Playwright MCP (or the `playwright-tester` skill) on `http://localhost:3000/` and `/login`:
   - Screenshots at 360x800, 768x1024, 1440x900 (dark only).
   - Check console errors (none allowed, except the expected failed `/api/auth/me` request when no backend runs; note it), no horizontal scroll at 360px.
   - Emulate reduced motion and confirm animations stop or become static.
   - Tab through the page and confirm a visible focus indicator on the CTA.
3. Run the Impeccable critique on the two pages ONCE. Fix only the material problems it reports (hierarchy, contrast, spacing, generic look). Re-screenshot once to confirm. Stop. Do not start another polish round; list leftovers under Follow-ups.
4. Stop the dev server. Keep temporary screenshots out of the repo (scratchpad/Temp). Save final screenshots (desktop and mobile, both pages) to `docs/plan/CM-082-screens/` only if each is under 300 KB; otherwise just reference their path in the report.

## 6. Commit
- `git add` only files you created/edited (no `-A`). Check nothing secret is staged.
- 1-3 commits: `feat(frontend): <imperative description>` with footer `Refs: CM-082`. No attribution lines. No push.

## 7. Report (Vietnamese, max 60 lines) -> `docs/plan/CM-082-REPORT.md`
1. Hướng thiết kế đã chọn (3-5 dòng) và vì sao khác mẫu SaaS thông thường.
2. Component đã dùng: bảng (tên, nguồn, đã sửa gì), và component đã loại kèm lý do.
3. Dependency mới (nếu có) và lý do.
4. Kết quả kiểm tra theo từng AC (AC-1..AC-6): PASS/FAIL/UNVERIFIED; kèm lint/tsc/test/build, ảnh chụp 3 kích thước, console, reduced-motion, focus.
5. Kết quả critique của Impeccable: vấn đề tìm thấy, đã sửa, còn lại.
6. Đánh giá thẳng thắn: bộ công cụ giúp được gì, vướng ở đâu (tốc độ, chất lượng, token tiêu tốn), có đáng tái sử dụng cho dự án khác không.
7. Follow-ups (không tự làm). Luôn gồm: light mode + theme switch cho toàn app; `DESIGN.md` qua `/impeccable document`; `LoginBackGround.tsx` nếu không còn dùng.
