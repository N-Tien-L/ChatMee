# ChatMee docs

Source of truth order (AGENTS.md §1): **specs > design > ADRs > plan**. When code and an Approved spec disagree, the spec wins; if the spec
looks wrong, stop and ask the owner.

## Start here
- Implementing a v0 ticket: read `AGENTS.md`, then `plan/MVP_V0_PLAN.md#CM-xxx`, then the spec ACs and design sections the ticket names.
- Current status of every ticket: `plan/BOARD.md`.
- Why something is out of v0: `plan/V1_BACKLOG.md` and the Decisions table in `plan/MVP_V0_PLAN.md`.

## Current (living) documents
| Path | What it is | Status |
|---|---|---|
| `plan/MVP_V0_PLAN.md` | The v0 plan: decisions D-01..D-23, lanes, tickets CM-060..CM-080, smoke checklist, triage of every review finding | Ready for implementation |
| `plan/BOARD.md` | Ticket board (done CM-001..058, v0 tickets) | Living |
| `plan/V1_BACKLOG.md` | Everything cut from v0, with the reason | Living |
| `plan/ORCHESTRATION.md` | Runbook for the master agent (git flow, worktrees, dispatch, verification gate, safety) | Living; §1, §9, §10 are historical |
| `plan/_TICKET_TEMPLATE.md`, `specs/_TEMPLATE.md`, `adr/0000-template.md` | Templates | — |

## Specs
| Spec | Topic | Status |
|---|---|---|
| `specs/SPEC-001-auth-oauth2.md` | OAuth2 login, session, logout, `/auth/me` | Approved |
| `specs/SPEC-002-chat-rooms.md` | Group rooms PUBLIC/PRIVATE | Approved, amended by SPEC-009 (§10) |
| `specs/SPEC-003-direct-messages.md` | Direct messages | Approved, amended by SPEC-009 (§10) |
| `specs/SPEC-004-messaging-realtime.md` | Realtime messaging and history | Approved |
| `specs/SPEC-005-presence-typing.md` | Presence and typing | Approved (AC-005-4 v1) |
| `specs/SPEC-006-user-discovery.md` | User search | Approved |
| `specs/SPEC-007-rate-limiting.md` | Rate limiting | Approved |
| `specs/SPEC-008-mvp-v0.md` | v0 scope: per-user events, unread, members, UI, realtime robustness, release criteria | Approved |
| `specs/SPEC-009-membership-consent-and-safety.md` | Invitations, DM requests, blocking, reports, hide DM, roles (v0 subset) | Approved |

## Design and decisions
| Path | Topic |
|---|---|
| `design/data-model.md` | Collections, indexes, membership invariants, v0 additions, SPEC-009 collections |
| `design/websocket-protocol.md` | STOMP destinations and authorization, per-user events, private errors, v0 REST summary |
| `design/error-handling.md` | ProblemDetail contract, logging, caller identity |
| `adr/0001`..`0006` | MongoDB, Redis, STOMP, WS token, membership without transactions, membership by consent (all Accepted) |

## Operations
| Path | Topic |
|---|---|
| `ops/upgrade-spring-boot-4.md`, `ops/upgrade-next-16.md` | Upgrade notes, owner actions on Render/Vercel, rollback |
| `ops/backfill-CM-028-CM-049.js` | One-off production backfill (`memberCount`, DM `memberKey`); dry run by default |

## Audits and reviews (records, not plans)
| Path | What it is | Status |
|---|---|---|
| `audit/UI_UX_AUDIT.md` | Frontend UX findings UX-1..26 and the v0 design direction | Triaged into CM-063..066 |
| `audit/REVIEW_AUTH_USERS.md` | Auth and users endpoint review (F-n, S-n) | Triaged |
| `audit/REVIEW_MESSAGES_PRESENCE.md` | Messages and presence review (B-n, U-n) | Triaged |
| `audit/REVIEW_WS_ENDPOINTS.md` | WebSocket endpoint review (W-n) | Triaged |
| `audit/CM-003_WS_AUTH_FLOW_CONVERSATION_AUDIT.md` | WS auth flow audit (WS-A01..A14), Vietnamese | Triaged |
| `audit/PROJECT_REVIEW_GUIDE.md` | Owner's checklist to review the whole project, Vietnamese | Reference |
| `audit/AUDIT_REPORT.md` | Original audit of 2026-10-08, Vietnamese | Historical |
| `audit/IMPROVEMENT_PLAN.md` | Phase 0-2 plan (CM-001..058), Vietnamese | Historical, done |
| `audit/SPEC_DRIVEN_SETUP.md` | Proposal that created AGENTS.md, templates, ADRs and specs, Vietnamese | Historical, applied |

## Conventions
- Docs, specs, ADRs and code are in English; audits written for the owner may be in Vietnamese.
- Finding IDs are stable (UX-n, F-n, S-n, B-n, U-n, W-n, WS-An); decisions are D-nn in `plan/MVP_V0_PLAN.md`.
- A spec AC line ends with `-> Implemented. Test: Class#method` or `-> Test: planned (CM-xxx)`.
