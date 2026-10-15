# ChatMee API Documentation

## Local Development

Use the `local` Spring profile to run against MongoDB and Redis on your machine.
Prerequisites: JDK 17 (`JAVA_HOME` configured), Docker Desktop running with Linux
containers, and Node.js/npm if you also run the frontend. Maven is provided by the wrapper.

### 1. Start MongoDB and Redis

From the repository root in PowerShell:

```powershell
docker compose up -d mongo redis
docker compose ps
```

Wait for both services to report `healthy`. MongoDB listens on `localhost:27017`
and Redis on `localhost:6379`. The backend runs separately on your host.

### 2. Configure OAuth login

From the repository root, copy the template **only if `backend/.env` does not
already exist**, then edit it locally with your OAuth client values:

```powershell
if (-not (Test-Path backend/.env)) {
    Copy-Item backend/.env.example backend/.env
}
```

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET`. Keep this file private and never commit it.
Register these callback URLs with the corresponding OAuth provider:

| Provider | Local callback URL |
| --- | --- |
| Google | `http://localhost:8080/login/oauth2/code/google` |
| GitHub | `http://localhost:8080/login/oauth2/code/github` |

The `local` profile has placeholder OAuth defaults, so it can start without real
credentials; signing in requires valid credentials for the provider you use.
`MONGO_URI_DEV` in the template is for the `dev` profile; `local` uses
`mongodb://localhost:27017/chatmee` by default.

### 3. Start the backend

From the repository root:

```powershell
cd backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"
```

For Bash, run `./mvnw spring-boot:run -Dspring-boot.run.profiles=local` from
`backend/`. Keep this terminal open; stop the server with `Ctrl+C`.
The first run downloads Maven dependencies.

Run from `backend/` because the optional `.env` import is relative to the working
directory. Always specify `local`: without a profile override, the application
defaults to `dev`, which reads `backend/.env.dev` and requires `MONGO_URI_DEV`
and OAuth variables. A file named `.env` is not automatically loaded for `dev`.

### 4. Check the server and run the frontend

In a second PowerShell terminal:

```powershell
Invoke-RestMethod http://localhost:8080/actuator/health
```

Expect health status `UP`. The REST base URL is `http://localhost:8080/api/v1`.
OpenAPI JSON is at `http://localhost:8080/v3/api-docs` and Swagger UI at
`http://localhost:8080/swagger-ui.html`; both require login.

To use the app, run the following from the repository root:

```powershell
if (-not (Test-Path frontend/.env.local)) {
    Copy-Item frontend/.env.example frontend/.env.local
}
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000` and sign in. The frontend proxies REST and OAuth
requests to port 8080; its example environment config points WebSocket traffic
to the local backend. Use `localhost` consistently for the frontend and OAuth
callbacks, matching `app.client.url`.

### Troubleshooting and shutdown

- **Missing `MONGO_URI_DEV` or OAuth placeholder resolution errors:** ensure the
  command explicitly selects `local` and runs from `backend/`.
- **MongoDB/Redis connection refused or health is `DOWN`:** check Docker Desktop
  and `docker compose ps` from the repository root.
- **Port already in use:** stop the existing process on 8080, 27017 or 6379 before
  starting another instance. The frontend proxy and OAuth callbacks assume 8080.
- **OAuth redirect mismatch:** register the exact callback above for the provider
  and use real local OAuth credentials; restart the backend after editing `.env`.
- **PowerShell reports an unknown Maven lifecycle phase:** keep the entire
  `"-Dspring-boot.run.profiles=local"` argument quoted as shown above.

Stop the backend/frontend with `Ctrl+C` in their terminals. To stop the local
database services, run `docker compose stop mongo redis` from the repository root;
MongoDB data remains in the Compose volume.

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

### Users (`/users`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/users` | List all users. |
| `GET` | `/users/{userId}` | Get user by ID. |
| `GET` | `/users/provider/{provider}/id/{providerId}` | Get user by OAuth provider ID. |

### Chat Rooms (`/rooms`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/rooms` | List all chat rooms the user is part of (or public ones). |
| `POST` | `/rooms` | Create a new chat room. |
| `GET` | `/rooms/{roomId}` | Get details of a specific chat room. |
| `PUT` | `/rooms/{roomId}` | Update chat room details. |
| `DELETE` | `/rooms/{roomId}` | Delete a chat room. |
| `POST` | `/rooms/{roomId}/members/me` | Join a chat room as the caller. |
| `DELETE` | `/rooms/{roomId}/members/me` | Leave a chat room. |
| `POST` | `/rooms/{roomId}/members` | Add a user to a chat room (Admin/Owner only). |
| `GET` | `/rooms/{roomId}/messages` | Get recent messages for a specific room. |

## WebSocket (`/ws`)
- **Endpoint**: `/ws` (STOMP over plain WebSocket; origin must be `app.client.url`)
- **Destinations**:
    - `/topic/rooms/{roomId}`: Room messages and room events.
    - `/topic/presence`: User presence updates.
    - `/topic/rooms/{roomId}/typing`: Typing indicators.
    - `/user/queue/errors`: Error notifications.
- **Application Destinations** (Client sends to):
    - `/app/chat.sendMessage`: Send a message.
    - `/app/chat.addUser`: Join a room (announce).
    - `/app/presence`: Update presence status.
    - `/app/rooms/{roomId}/typing`: Send typing status.

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
