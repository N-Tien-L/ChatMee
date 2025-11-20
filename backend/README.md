# ChatMee API Documentation

## Overview
- RESTful JSON API powering ChatMee messaging features.
- Follows standard HTTP status codes.
- All requests must be made over HTTPS.
- Base URL: `https://chatmee-wxvk.onrender.com/api/v1` (Production) or `http://localhost:8080/api/v1` (Local)

## Authentication
- The API uses OAuth2 authentication (Google/GitHub).
- Most endpoints require an authenticated user.
- The session is managed via cookies/tokens handled by Spring Security.

## Rate Limiting
- **Public Endpoints**: 20 requests/minute per IP.
- **Authenticated Endpoints**: 100 requests/minute per User.
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.

## Endpoints

### Authentication (`/auth`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/auth/me` | Get current authenticated user details. |
| `GET` | `/auth/status` | Check authentication status (returns boolean). |
| `GET` | `/auth/user` | Get user info (similar to `/me` but simplified). |

### Users (`/users`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/users` | List all users. |
| `GET` | `/users/{userId}` | Get user by ID. |
| `GET` | `/users/provider/{provider}/id/{providerId}` | Get user by OAuth provider ID. |

### Chat Rooms (`/chatrooms`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/chatrooms` | List all chat rooms the user is part of (or public ones). |
| `POST` | `/chatrooms/create` | Create a new chat room. |
| `GET` | `/chatrooms/{roomId}` | Get details of a specific chat room. |
| `PUT` | `/chatrooms/{roomId}` | Update chat room details. |
| `DELETE` | `/chatrooms/{roomId}` | Delete a chat room. |
| `POST` | `/chatrooms/{roomId}/join` | Join a chat room. |
| `POST` | `/chatrooms/{roomId}/leave` | Leave a chat room. |
| `POST` | `/chatrooms/{roomId}/add-participant` | Add a user to a chat room (Admin/Owner only). |

### Messages (`/messages`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/messages/room/{roomId}` | Get recent messages for a specific room. |

## WebSocket (`/ws`)
- **Endpoint**: `/ws` (SockJS/STOMP)
- **Destinations**:
    - `/topic/public/{roomId}`: Public room messages.
    - `/topic/presence`: User presence updates.
    - `/topic/typing/{roomId}`: Typing indicators.
    - `/user/queue/errors`: Error notifications.
- **Application Destinations** (Client sends to):
    - `/app/chat.sendMessage`: Send a message.
    - `/app/chat.addUser`: Join a room (announce).
    - `/app/presence`: Update presence status.
    - `/app/typing`: Send typing status.

## Error Handling
Standard HTTP status codes are used:
- `200 OK`: Success.
- `201 Created`: Resource created.
- `400 Bad Request`: Validation error or invalid input.
- `401 Unauthorized`: Not authenticated.
- `403 Forbidden`: Insufficient permissions (e.g., not an admin).
- `404 Not Found`: Resource not found.
- `409 Conflict`: Duplicate resource (e.g., user already in room).
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Server-side issue.

Response Format:
```json
{
  "status": "success", // or "error"
  "message": "Operation successful",
  "data": { ... } // payload
}
```
