# Upgrade notes: Next.js 15 to 16 (CM-052)

## Versions

| Package | Before | After |
| --- | --- | --- |
| `next` | 15.5.27 | 16.3.8 |
| `eslint-config-next` | 15.5.27 | 16.3.8 |
| `react`, `react-dom` | 19.1.0 | 19.1.0 (unchanged; Next 16 peer range is `^19.0.0`) |
| `@types/react`, `@types/react-dom` | 19.1.12 (resolved) | unchanged |

Node.js: Next 16 requires Node `>=20.9.0`. CI runs Node 20 and 22, so both satisfy it. CI was not changed.

## Changes and why

1. **`frontend/middleware.ts` renamed to `frontend/proxy.ts`.** Next 16 deprecates the `middleware` file and export. The function is renamed to `proxy`. The logic is identical: the `JSESSIONID` cookie guard for `/dashboard` and `/profile`, and the redirect to `/login`. `config.matcher` is unchanged. The build now lists it as `Proxy (Middleware)`. Edge runtime is not used here, so the `proxy` runtime (`nodejs`) is fine.
2. **`frontend/middleware.test.ts`**: the import and calls now use `proxy`. Assertions are unchanged.
3. **`frontend/eslint.config.mjs`**: `eslint-config-next` 16 ships native flat configs. The old `FlatCompat` wrapper fails with "Converting circular structure to JSON", so the config now imports `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` directly. The `no-console` rule and ignores are unchanged.
4. **`frontend/eslint.config.mjs`: four React Compiler rules set to `warn`.** `eslint-config-next` 16 enables `react-hooks/set-state-in-effect`, `react-hooks/immutability`, `react-hooks/purity` and `react-hooks/preserve-manual-memoization` as errors. They report 9 existing errors in `CreateRoomModal`, `RoomInfoDialog`, `RoomSettingsDialog`, `UserSearchList`, `use-mobile`, `useRoomMessage` and `components/ui/sidebar.tsx`. The code works at runtime. Fixing it is a refactor outside CM-052, so the rules stay visible as warnings. A follow-up ticket should fix the code and restore `error`.
5. **`frontend/tsconfig.json`** (rewritten by `next build`): `jsx` changed from `preserve` to `react-jsx`, which Next 16 requires. `.next/dev/types/**/*.ts` was added to `include`. The arrays were reformatted by the tool.
6. **`frontend/package.json` and `package-lock.json`**: exact pins for `next` and `eslint-config-next` at 16.3.8. No other dependency was changed.

Not changed, checked against the guide:
- `next.config.ts`: rewrites are unchanged. It has no `webpack`, `eslint`, `experimental` or `amp` options, so none of the removed options apply.
- `vercel.json`: unchanged. Rewrites go to the Render backend.
- Scripts `dev` and `build` keep `--turbopack`. It is still accepted in 16 and is the default.
- Async request APIs: the app has no synchronous `params`, `searchParams`, `cookies()`, `headers()` or `draftMode()`. Its `useSearchParams` calls are client hooks and unaffected.
- No `@slot` parallel routes, no `next/image` use, no `next/legacy/image`, no AMP.
- `components/ui/*` untouched.

## Verification

- `npm ci`: passes.
- `npm run lint`: 0 errors, 17 warnings. The warnings are the four downgraded rules plus existing `no-img-element`, `exhaustive-deps` and `no-location-assign-relative-destination` warnings.
- `npx tsc --noEmit`: passes.
- `npm test`: 17 files, 113 tests, all pass. None deleted or changed except the `middleware` to `proxy` import.
- `npm run build`: passes. Routes `/`, `/dashboard`, `/login`, `/profile`, `/_not-found` are static. `Proxy (Middleware)` is present.
- `npm audit --omit=dev`: 0 vulnerabilities (0 critical, 0 high, 0 moderate, 0 low). The CM-002 postcss advisory no longer appears.

Dev-only advisories (`npm audit`, not shipped): 8 total, 2 critical and 5 high. These come from `vitest` (direct, critical), `tinypool` (critical), `eslint-config-next` and `@next/eslint-plugin-next` (high), `braces`, `fast-glob`, `micromatch` (high), and `@vitest/mocker` (moderate). Upgrading vitest is a separate dependency ticket.

## Notes for the owner

- **Vercel**: the project's Node.js version must be 20.9 or newer. Check it in the Vercel project settings before deploying. Vercel project settings are not visible from the repo, so this was not verified here.
- **Local dev**: Node 20.9+ is required. The local machine used for this upgrade runs Node 23.6, which works, and `npm ci` printed an `EBADENGINE` notice for a transitive `eslint-visitor-keys` that prefers Node 20.19+ or 22.13+. It is a warning only.
- **Image defaults** (`minimumCacheTTL`, `imageSizes`, `qualities`) changed in Next 16, but the app does not use `next/image`, so nothing changes.
- **Scroll behaviour**: Next 16 no longer overrides CSS `scroll-behavior: smooth` during navigation. Check the app if it sets that globally. A grep of `app`, `components`, `lib` and `hooks` found no `scroll-behavior` declaration at upgrade time.

## Rollback

The change is one commit on `build/CM-052b-next-16` (or the merge commit after it). To roll back, revert that commit. This restores `middleware.ts`, Next 15.5.27 and the original ESLint config. Then run `npm ci`. No data or environment variables are involved.
