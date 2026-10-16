# SPEC-010: Share links for rooms
- Status: Draft (2026-10-15; pulls the v1 item "invite link + join requests" of D-02 forward, awaiting owner approval)
- Owner: @N-Tien-L · Created: 2026-10-15 · Related: ADR-0007, ADR-0006, SPEC-002, SPEC-009 (AC-009-6..8), design/data-model.md, design/websocket-protocol.md

## 1. Goal
A member can share a room with a link. Whoever opens the link of a PUBLIC room sees the room and joins in one click. Whoever opens the link of a PRIVATE room sends a join request that an OWNER or ADMIN approves. This gives public rooms an invite path (invitations are PRIVATE-only) and gives private rooms the join-request path reserved in ADR-0006.

## 2. Non-goals
- Per-user or per-use tracking beyond the use counter, link analytics.
- Changing how invitations (AC-009-1..3) or DM requests work.
- Rejoin cooldown after removal (AC-009-26) and room mute (AC-009-27).

## 3. User stories
- US-1: As a member of a PUBLIC room, I copy a link so that anyone can open the room and join.
- US-2: As an OWNER or ADMIN of a PRIVATE room, I copy a link so that people can ask to join without me searching for them.
- US-3: As a person with a PRIVATE room link, I ask to join and see when I am accepted.
- US-4: As an OWNER or ADMIN, I approve or reject join requests and revoke the link.

## 4. Acceptance criteria
- AC-010-1: Given a PUBLIC room, when any member opens Room info, then a Share action copies `{origin}/join/{roomId}`.
- AC-010-2: Given a signed-in non-member opens a PUBLIC room link, then a preview (name, description, member count) shows with a Join button; Join adds the member and opens the room.
- AC-010-3: Given a signed-in member opens the link, then the room opens directly.
- AC-010-4: Given the room is full, deleted, or the user is blocked by the owner, then the preview shows the matching refusal (409 `ROOM_FULL`, 404, generic refusal).
- AC-010-5: Given a PRIVATE room, when an OWNER or ADMIN opens Room info, then Share creates or returns the room's active invite link `{origin}/join/t/{token}`; MEMBERs get no Share action for PRIVATE rooms.
- AC-010-6: The token is random (at least 128 bits), stored hashed, expires after 7 days and allows at most 50 uses (V1_BACKLOG). An OWNER or ADMIN can revoke or regenerate it; the old token then fails.
- AC-010-7: Given a signed-in non-member opens a valid PRIVATE link, then a preview (name only) shows with Request to join; sending creates a `JOIN_REQUEST` membership request in `PENDING`.
- AC-010-8: Given a pending join request, then OWNER/ADMIN see it in their inbox and a `JOIN_REQUEST_RECEIVED` user event is delivered; accept adds the member through the ADR-0005 seat path, reject marks it `REJECTED`.
- AC-010-9: Given a signed-out user opens any share link, then they sign in and return to the same link (not `/dashboard`).
- AC-010-10: An invalid, expired, revoked or exhausted token returns the same generic 404 as an unknown room.
- AC-010-11: One pending join request per user and room; a rejected user cannot resend for a cooldown (24 h); blocks in either direction refuse the request generically.

## 5. Edge cases & Errors
| Scenario | Expected Behavior | HTTP / STOMP |
|---|---|---|
| Unknown, expired, revoked or exhausted token | Generic not-found | 404 |
| Already a member | Open the room | 200 on preview with `member=true` |
| Room full on join / accept | Refused, request stays pending on accept | 409 `ROOM_FULL` |
| Duplicate pending request | Idempotent, returns the pending request | 200 |
| Request within cooldown after reject | Refused | 429 or 409 (to decide) |
| Share on DM room | Not offered | 403 |

## 6. Security & Authorization
- The preview endpoints require a session and return only name, description, member count and the caller's membership; PRIVATE previews return the name only.
- PRIVATE links use an unguessable token, never the room id. Tokens are stored hashed and never logged.
- Only OWNER/ADMIN create, revoke or regenerate PRIVATE links and decide join requests. Any member shares a PUBLIC link (the room is already discoverable).
- All new endpoints are rate limited (SPEC-007); no new `permitAll` path. The client carries only the intended URL through login, restricted to same-origin relative paths to avoid open redirects.

## 7. Non-functional
- Log request ids and room ids only, no tokens or message content.
- Metrics: links created, previews opened, requests accepted/rejected.

## 8. Related APIs / Protocols (proposed, to add to design docs on approval)
- `GET /api/v1/rooms/{roomId}/preview` (PUBLIC), `POST /api/v1/rooms/{roomId}/members/me` (existing join).
- `POST /api/v1/rooms/{roomId}/invite-link`, `DELETE /api/v1/rooms/{roomId}/invite-link`.
- `GET /api/v1/invite-links/{token}`, `POST /api/v1/invite-links/{token}/join-requests`.
- `GET /api/v1/rooms/{roomId}/join-requests`, `POST /api/v1/join-requests/{id}/accept|reject`.
- STOMP user event `JOIN_REQUEST_RECEIVED` / `JOIN_REQUEST_CHANGED` on `/user/queue/events`.

## 9. Open questions
1. Is the 24 h cooldown after reject acceptable, and which error code does it return?
2. Should the PUBLIC link require the confirm step (Join button) or join on open? Proposed: confirm step.
3. Should a PRIVATE link expire at 7 days / 50 uses as in V1_BACKLOG, or be configurable?
4. Implementation tickets (CM-xxx) and whether CM-071 stays the reserved number for the join-request part.
