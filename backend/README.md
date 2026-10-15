# ChatMee API Documentation

## Overview
- JSON API powering ChatMee messaging features. Base path: `/api/v1`.
- Local: `http://localhost:8080/api/v1`. In production the frontend proxies `/api`, `/oauth2`, `/login` and `/logout`
  to the backend, and requests go over HTTPS.
- The authoritative, generated contract is OpenAPI at `/v3/api-docs` (dev and local profiles only). The WebSocket
  protocol is specified in [`docs/design/websocket-protocol.md`](../docs/design/websocket-protocol.md). This page is an
  overview; when it disagrees with those, they win.

## Authentication
- OAuth2 login (Google or GitHub) through Spring Security; the session is an HTTP session cookie.
- Every `/api/**` endpoint requires an authenticated user. Unauthenticated calls get 401 `ProblemDetail` (no redirect).
- State-changing requests need the CSRF token (cookie `XSRF-TOKEN`, header `X-XSRF-TOKEN`).
- The WebSocket connection authenticates with a short-lived token from `POST /auth/ws-token`.

## Rate Limiting
- **Public Endpoints**: 20 requests/minute per IP.
- **Authenticated Endpoints**: 100 requests/minute per User.
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.
- Daily limits for room creation, invitations, DM requests and reports (SPEC-009 AC-009-29), and STOMP inbound
  limits (see the protocol doc).

## Endpoints
Paths are relative to `/api/v1`.

### Authentication (`/auth`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/auth/me` | Get the current authenticated user. |
| `POST` | `/auth/ws-token` | Issue a short-lived token for the WebSocket CONNECT. |

### Users (`/users`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/users?query=&page=&size=` | Search users by name (paged, excludes the caller, no emails). |
| `GET` | `/users/{userId}` | Get a user by ID. |
| `GET` | `/users/me/blocks` | List the users the caller blocked. |
| `PUT` | `/users/{userId}/block` | Block a user (idempotent, 204). |
| `DELETE` | `/users/{userId}/block` | Unblock a user (idempotent, 204). |

### Chat Rooms (`/rooms`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/rooms` | List the rooms the caller belongs to. |
| `POST` | `/rooms` | Create a room (PUBLIC, PRIVATE, or a DIRECT_MESSAGE request). |
| `GET` | `/rooms/discover?query=&page=&size=` | Discover active public rooms the caller has not joined. |
| `GET` | `/rooms/{roomId}` | Get a room the caller belongs to (404 for non-members). |
| `PUT` | `/rooms/{roomId}` | Update a room (OWNER or ADMIN). |
| `DELETE` | `/rooms/{roomId}` | Soft-delete a group room (OWNER; DMs return 403, use hide). |
| `POST` | `/rooms/{roomId}/hide` | Hide a DM for the caller only. |
| `POST` | `/rooms/{roomId}/members/me` | Join a public room. |
| `DELETE` | `/rooms/{roomId}/members/me` | Leave a room. |
| `PUT` | `/rooms/{roomId}/members/me/read` | Mark the room as read for the caller. |
| `GET` | `/rooms/{roomId}/members` | List members with their roles. |
| `DELETE` | `/rooms/{roomId}/members/{userId}` | Remove a member (OWNER or ADMIN). |
| `PATCH` | `/rooms/{roomId}/members/{userId}/role` | Change a member's role to ADMIN or MEMBER (OWNER only). |
| `GET` | `/rooms/{roomId}/messages?before=&limit=` | Message history, newest page first, cursor-based (members only). |

### Invitations
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/rooms/{roomId}/invitations` | Invite a user to a private room (OWNER or ADMIN). |
| `GET` | `/rooms/{roomId}/invitations` | List the room's pending invitations (OWNER or ADMIN). |
| `GET` | `/invitations` | List the caller's pending invitations. |
| `POST` | `/invitations/{id}/accept` | Accept an invitation (invitee only). |
| `POST` | `/invitations/{id}/decline` | Decline an invitation (invitee only). |
| `DELETE` | `/invitations/{id}` | Revoke an invitation (inviter, or OWNER or ADMIN of the room). |

### Direct message requests
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/dm-requests` | List the caller's pending DM requests. |
| `POST` | `/rooms/{roomId}/dm-request/accept` | Accept a DM request (recipient only). |
| `POST` | `/rooms/{roomId}/dm-request/decline` | Decline a DM request (recipient only). |

### Reports and presence
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/reports` | Report a user, message or room the caller can see (202, no body). |
| `GET` | `/online-users` | List online user IDs. |

## WebSocket (`/ws`)
- **Endpoint**: `/ws` (STOMP over plain WebSocket; origin must be `app.client.url`; CONNECT carries the ws-token).
- **Subscriptions** (server to client):
    - `/topic/rooms/{roomId}`: room messages and room events (members of the room only).
    - `/topic/rooms/{roomId}/typing`: typing indicators (members of the room only).
    - `/topic/presence`: user presence updates.
    - `/user/queue/events`: per-user events (room added, updated, removed, activity, invitations, DM requests).
    - `/user/queue/errors`: private errors for the sending session.
- **Application destinations** (client sends to):
    - `/app/chat.sendMessage`: send a message `{roomId, content, messageType: "TEXT", tempId?}`.
    - `/app/rooms/{roomId}/typing`: send typing status.
    - `/app/presence`: presence heartbeat.

## Error Handling
- REST errors are `ProblemDetail` (`application/problem+json`) with a `code` field (an `ErrorCode` name such as
  `VALIDATION_FAILED`, `ROOM_NOT_FOUND`, `FORBIDDEN_ACTION`, `RATE_LIMITED`); validation errors list the failing
  fields in `errors`. See [`docs/design/error-handling.md`](../docs/design/error-handling.md).
- STOMP errors are `{tempId?, code, message}` on `/user/queue/errors`.
- Status codes: `200`, `201`, `202`, `204` on success; `400`, `401`, `403`, `404`, `405`, `409`, `429`, `500` on errors.

Successful responses use the `ApiResponse` envelope (null fields are omitted):
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { }
}
```

## Environment
See [`.env.example`](.env.example) for every variable, which profile reads it, and which are required in production.
