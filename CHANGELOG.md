# Changelog

All notable changes to ChatMee are listed here. Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

First release (v0). Scope and release criteria: [SPEC-008](docs/specs/SPEC-008-mvp-v0.md).

### Added
- Sign-in with Google or GitHub OAuth2; users are matched by provider and provider id, never by email (SPEC-001).
- Public and private group rooms with a name, description and member limit; public room discovery; roles OWNER, ADMIN and
  MEMBER; OWNER-only promote and demote; removing members; soft delete by the owner (SPEC-002, SPEC-009).
- Invitations to private rooms, accepted or declined by the invitee (SPEC-009).
- Direct messages: one per pair of users, starting as a request that allows one message until the recipient accepts or
  replies; requests can be declined and expire after 14 days; a daily limit on new requests (SPEC-003, SPEC-009).
- Automatic ownership transfer when the owner leaves; a sole owner leaving deletes the room (SPEC-009).
- Blocking and unblocking users, reporting users, messages and rooms, and hiding direct messages (SPEC-009).
- Real-time messaging over STOMP on a WebSocket, saved before broadcast, with idempotent sends, Resend and Discard for
  failed messages, and cursor-based history (SPEC-004, SPEC-008).
- Per-user events that keep the room list live: new and removed rooms, last message preview, unread counts and a read
  marker (SPEC-008).
- SYSTEM messages for joins, leaves, removals and role changes (SPEC-008).
- Presence across instances with a grace period, and typing indicators (SPEC-005).
- User search by name without email addresses (SPEC-006).
- REST and STOMP rate limits (SPEC-007).
- WebSocket authentication with a single-use, 60 s ws-token (ADR-0004).

### Known gaps (deferred to v1)
- Presence is visible to every signed-in user (AC-005-4).
- Logout and session expiry do not close open WebSockets server-side (WS-A02..A04).
- Further gaps are listed in SPEC-008 §10 and [`docs/plan/V1_BACKLOG.md`](docs/plan/V1_BACKLOG.md).
