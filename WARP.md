# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

ChatMee is a full-stack real-time chat application with a modern monorepo structure:
- **Backend**: Spring Boot 3.5.5 with Java 17, MongoDB, OAuth2 authentication, and WebSocket support
- **Frontend**: Next.js 15.5.2 with TypeScript, TailwindCSS, and React 19

## Development Commands

### Frontend (Next.js)
```bash
cd frontend

# Development with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

### Backend (Spring Boot + Maven)
```bash
cd backend

# Run in development mode
./mvnw spring-boot:run

# Build the project
./mvnw clean compile

# Run tests
./mvnw test

# Package as JAR
./mvnw clean package

# Skip tests during package
./mvnw clean package -DskipTests
```

### Running Single Tests

#### Backend Tests
```bash
# Run specific test class
./mvnw test -Dtest=ChatmeeApplicationTests

# Run specific test method
./mvnw test -Dtest=ClassName#methodName
```

## Architecture Overview

### Backend Architecture (Spring Boot)
- **Package Structure**: `com.lnt.chatmee`
  - `config/`: CORS, Security, WebSocket configuration
  - `controller/`: REST API controllers (AuthApiController, UserApiController, ChatRoomController)
  - `service/`: Business logic (CustomOAuth2UserService, ChatRoomService, ParticipantService)
  - `model/`: Entity classes (User, ChatRoom, Message, Participant)
  - `repository/`: MongoDB repositories
  - `dto/`: Request/response DTOs with ApiResponse wrapper pattern
  - `exception/`: Custom exceptions with GlobalExceptionHandler

### Frontend Architecture (Next.js App Router)
- **App Directory Structure**:
  - `app/`: App Router pages (page.tsx, layout.tsx)
  - `components/`: Reusable UI components including shadcn/ui components
  - `lib/api/`: API client with axios, type-safe API calls
  - `hook/`: Custom React hooks (useAuth, useUsers)
  - `lib/type/`: TypeScript type definitions

### Authentication Flow
1. Frontend redirects to `/oauth2/authorization/{provider}` (Google/GitHub)
2. Backend handles OAuth2 callback and creates/updates user in MongoDB
3. Authentication state managed via HTTP-only cookies
4. Frontend uses `useAuth` hook for authentication state management
5. API calls include credentials for cookie-based authentication

### Data Models
- **ChatRoom**: Supports PUBLIC, PRIVATE, and DIRECT_MESSAGE types with participants, admins, and settings
- **User**: OAuth2 user model with provider information
- **Message**: Chat messages with timestamps and user references
- **Participant**: Junction model for chat room membership

### API Structure
- **Base URL**: `http://localhost:8080` (backend), `http://localhost:3000` (frontend)
- **API Prefix**: `/api/v1/` for all REST endpoints
- **Response Format**: Standardized `ApiResponse<T>` wrapper with success, message, and data fields
- **Authentication**: Cookie-based sessions, CORS configured for frontend origin

## Key Configuration Files

### Backend Configuration
- `application.properties`: Main Spring Boot configuration
- `application-dev.properties` / `application-prod.properties`: Environment-specific settings
- `SecurityConfig.java`: OAuth2 and CORS configuration
- `CorsConfig.java`: Cross-origin resource sharing setup

### Frontend Configuration
- `next.config.ts`: Next.js with Turbopack configuration
- `tailwind.config.ts`: TailwindCSS styling configuration
- `components.json`: shadcn/ui component configuration
- `eslint.config.mjs`: ESLint configuration

## Environment Setup

### Backend Environment Variables
Set in `application-dev.properties`:
```properties
spring.data.mongodb.uri=mongodb://localhost:27017/chatmee
spring.security.oauth2.client.registration.google.client-id=your-google-client-id
spring.security.oauth2.client.registration.google.client-secret=your-google-client-secret
```

### Frontend Environment Variables
Create `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

## Database
- **MongoDB**: Document database for scalable chat data
- **Collections**: users, chat_rooms, messages, participants
- **Connection**: Spring Data MongoDB with repository pattern

## Real-time Features
- **WebSocket**: Configured for real-time chat functionality
- **Config**: `WebSocketConfig.java` handles connection setup

## Key Dependencies

### Backend
- Spring Boot Starter Web, Security, OAuth2 Client
- Spring Data MongoDB
- WebSocket support
- Lombok for code generation
- Actuator for monitoring

### Frontend  
- React 19 with Next.js App Router
- TypeScript for type safety
- Axios for HTTP requests
- TailwindCSS + shadcn/ui for styling
- Framer Motion for animations
- React Hot Toast for notifications

## Testing Strategy
- Backend: Spring Boot Test with test slices
- Frontend: Built-in Next.js testing capabilities
- Integration: End-to-end authentication flow testing

## Development Notes
- **CORS**: Backend configured to accept requests from localhost:3000 and localhost:3001
- **Authentication**: Uses OAuth2 with Google and GitHub providers
- **Session Management**: HTTP-only cookies for security
- **API Client**: Centralized axios configuration with credential inclusion
- **Error Handling**: Global exception handling with consistent error responses
- **Type Safety**: Full TypeScript coverage on frontend with shared type definitions

## Common Development Patterns
- **API Responses**: All endpoints return `ApiResponse<T>` wrapper
- **Authentication Guard**: `useAuth` hook provides authentication state
- **Component Structure**: shadcn/ui components with Tailwind styling
- **State Management**: React hooks for local state, API calls for server state
- **Error Handling**: Toast notifications for user feedback