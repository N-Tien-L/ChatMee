# ChatMee API Documentation

This document describes the REST APIs that have been created to replace the static file serving approach. Your frontend can now communicate with the backend through these APIs.

## Overview

The authentication system has been converted from serving static templates to providing REST APIs that your Next.js frontend can consume. This allows for better separation of concerns and a more modern architecture.

## API Endpoints

### Authentication APIs (`/api/auth`)

#### GET `/api/auth/me`
Get the current authenticated user's information.

**Response:**
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "user": {
      "id": "user-uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "avatarUrl": "https://avatar-url.com/avatar.jpg",
      "provider": "google"
    },
    "message": "User authenticated successfully"
  }
}
```

#### GET `/api/auth/status`
Check if the user is authenticated (can be called without authentication).

**Response:**
```json
{
  "success": true,
  "message": "Authentication status retrieved",
  "data": true
}
```

#### GET `/api/auth/user`
Alternative endpoint to get user information.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "avatarUrl": "https://avatar-url.com/avatar.jpg",
    "provider": "google"
  }
}
```

### User Management APIs (`/api/users`)

#### GET `/api/users`
Get all users in the system.

**Response:**
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": [
    {
      "id": "user-uuid-1",
      "name": "John Doe",
      "email": "john@example.com",
      "avatarUrl": "https://avatar-url.com/avatar1.jpg",
      "provider": "google"
    },
    {
      "id": "user-uuid-2",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "avatarUrl": "https://avatar-url.com/avatar2.jpg",
      "provider": "github"
    }
  ]
}
```

#### GET `/api/users/{userId}`
Get a specific user by their ID.

**Response:**
```json
{
  "success": true,
  "message": "User found",
  "data": {
    "id": "user-uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "avatarUrl": "https://avatar-url.com/avatar.jpg",
    "provider": "google"
  }
}
```

#### GET `/api/users/provider/{provider}/id/{providerId}`
Get a user by their OAuth provider and provider ID.

**Response:**
```json
{
  "success": true,
  "message": "User found",
  "data": {
    "id": "user-uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "avatarUrl": "https://avatar-url.com/avatar.jpg",
    "provider": "google"
  }
}
```

## Authentication Flow

### Login Process
1. Frontend redirects to: `GET /oauth2/authorization/{provider}` (where provider is 'google' or 'github')
2. User completes OAuth flow with the provider
3. Backend processes the OAuth response and creates/updates user in database
4. User is redirected back to frontend with authentication cookies
5. Frontend can now call protected API endpoints

### Logout Process
1. Frontend redirects to: `GET /logout`
2. Backend invalidates the session and clears authentication cookies
3. User is redirected to the home page

## Frontend Integration

### Environment Setup
Create a `.env.local` file in your frontend directory:
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Using the API Client
The `auth-api.ts` file provides convenient functions and React hooks:

```typescript
import { useAuth, authApi, userApi } from '@/lib/api/auth-api';

// In a React component
function MyComponent() {
  const { user, isAuthenticated, loading, login, logout } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  
  if (!isAuthenticated) {
    return <button onClick={() => login('google')}>Login with Google</button>;
  }
  
  return (
    <div>
      <p>Welcome, {user.name}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Making Direct API Calls
```typescript
// Check authentication status
const authStatus = await authApi.getAuthStatus();

// Get current user
const currentUser = await authApi.getCurrentUser();

// Get all users
const allUsers = await userApi.getAllUsers();

// Get specific user
const specificUser = await userApi.getUserById('user-uuid');
```

## CORS Configuration

The backend is configured to accept requests from:
- `http://localhost:3000` (default Next.js dev server)
- `http://localhost:3001` (alternative dev port)
- Your production domain (update in `CorsConfig.java`)

## Important Notes

1. **Cookies Required**: Authentication uses HTTP-only cookies, so make sure to set `withCredentials: true` in your API client.

2. **CSRF Disabled**: CSRF protection is disabled for API endpoints to simplify frontend integration.

3. **Error Handling**: All API responses follow the `ApiResponse<T>` format with `success`, `message`, and `data` fields.

4. **Authentication Required**: Most endpoints require authentication except for:
   - `/api/auth/status`
   - OAuth login endpoints
   - Public static resources

## Migration from Static Templates

### Before (Static Templates)
- Backend served HTML templates with embedded data
- Frontend was server-side rendered by Spring Boot
- Tight coupling between frontend and backend

### After (REST APIs)
- Backend provides JSON APIs
- Frontend is a separate Next.js application
- Loose coupling allows independent development and deployment

## Testing the APIs

You can test the APIs using curl or any HTTP client:

```bash
# Check auth status (no authentication required)
curl http://localhost:8080/api/auth/status

# Get current user (requires authentication cookies)
curl -b cookies.txt http://localhost:8080/api/auth/me

# Get all users (requires authentication)
curl -b cookies.txt http://localhost:8080/api/users
```

## Next Steps

1. Update your frontend to use these new APIs
2. Remove the static template dependencies from your frontend
3. Test the authentication flow end-to-end
4. Deploy both frontend and backend as separate applications
5. Update CORS configuration for production domains
