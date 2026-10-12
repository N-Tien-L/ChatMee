# ADR-0006: Membership requires the member's consent
- Status: Accepted (2026-10-12)
- Date: 2026-10-12 · Deciders: @N-Tien-L

## Context
Today an OWNER or ADMIN can add any user to a room directly (`POST /rooms/{roomId}/members`), and a DM is active the moment it is created. The recipient cannot refuse either. In a real chat app this lets strangers place themselves in conversations and lets a group be filled without consent. The same review also found that a DM can only be deleted by its creator, which removes it for both people, and that a room can end up without an owner when the owner leaves. ADR-0005 already keeps membership consistent with atomic seat updates; that remains valid for every path that adds a member.

## Decision
Every path into a room that is not public needs the invitee's or the requester's consent:
- A PRIVATE room is entered by an accepted invitation. Direct add is removed. Approved join requests (with invite links) are the second path, scheduled for v1.
- A DM starts as `REQUESTED` and becomes `ACTIVE` when the recipient accepts or replies. Only then does the recipient get a participant row. A declined or expired request is soft-deleted, and the pair gets a cooldown after a decline.
- Ownership is a role on the participant row. When the owner leaves, the role moves automatically to the earliest ADMIN, else the earliest MEMBER.
- Users can block each other. A block stops DM creation, DM messages, invitations and requests in both directions. The blocked user gets a generic refusal.

All acceptances use the same path as ADR-0005: a conditional state change on the request, then the seat reservation and member insert. No multi-document transaction is added.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Keep direct add for OWNER only | Simple for small private groups | Still adds people without their consent; redundant once join requests exist |
| Invitation for PRIVATE, immediate DM (status quo for DM) | Fewer states | Strangers can drop messages on anyone at once; no recourse |
| Consent for all paths (chosen) | Matches how people use chat apps; every membership has an explicit yes | More states and endpoints; a few more collections |
| Use Mongo transactions for accept | Strong atomicity across request and member | Needs a replica set and is against ADR-0005 without a new decision |

## Consequences
- Positive: no membership without consent; spam is limited by the one-message rule and rate limits; block is one place to check.
- Negative / technical debt: a DM request needs a new state on `chat_rooms`; a `membership_requests` collection and an hourly expiry job are added; the frontend and the existing `POST /members` call must change in the same release.
- Follow-up tasks (done 2026-10-12): SPEC-009 Approved with a reduced v0 scope; SPEC-002, SPEC-003, SPEC-006, SPEC-007 and SPEC-008 amended; `design/data-model.md` and `design/websocket-protocol.md` updated; invite links and join requests moved to v1. Implementation: CM-070, CM-072..CM-080 in `docs/plan/MVP_V0_PLAN.md`.
