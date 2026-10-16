# ADR-0007: Share links and join requests for rooms
- Status: Proposed (2026-10-15)
- Date: 2026-10-15 · Deciders: @N-Tien-L

## Context
ADR-0006 made every non-public entry consent based and deferred invite links and join requests to v1 (D-02). Invitations exist only for PRIVATE rooms, so a PUBLIC room has no way to be handed to a person except Discover, and a PRIVATE room can only be entered if an admin finds the person first. The owner wants a Share action in Room info that copies a link.

## Decision
- PUBLIC rooms share `/join/{roomId}`: a signed-in visitor sees a preview and joins with one click through the existing join endpoint. The room id is not a secret because the room is already discoverable.
- PRIVATE rooms share `/join/t/{token}`: a random token (at least 128 bits, hashed at rest, 7-day expiry, 50 uses, revocable). Opening it creates a `JOIN_REQUEST` (the kind reserved in ADR-0006) that an OWNER or ADMIN accepts or rejects. Acceptance uses the ADR-0005 seat reservation path.
- Only OWNER/ADMIN can obtain a PRIVATE link, so a member cannot widen the room on their own.
- The login flow keeps the intended same-origin relative URL and returns to it after OAuth (today it always lands on `/dashboard`).
- Preview endpoints leak the least possible: PRIVATE returns the name only and every failure is the same generic 404.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Room id in the link for every room | No token storage | Ids are guessable, would expose private room existence |
| Private link joins directly | One click | Breaks ADR-0006 consent; a leaked link fills the room |
| Any member shares a private link | Viral growth | Members widen the room without the owner |
| Keep v1 deferral | No scope change | Public rooms have no sharing path |

## Consequences
- Positive: one Share concept for both types, consent preserved for PRIVATE, no open private joins.
- Negative / technical debt: new `invite_links` and join-request states, an inbox for admins, a login return-URL mechanism, new endpoints and events to document in `design/`.
- Follow-up tasks: SPEC-010 approval, update `design/data-model.md` and `design/websocket-protocol.md`, amend SPEC-009 AC-009-6..8 and V1_BACKLOG, tickets CM-xxx.
