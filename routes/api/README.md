# SimplyCaster API Routes

This document describes the API routes that have been refactored to use the service layer architecture.

## Authentication Routes

### POST /api/auth/login
Authenticate a user and receive a JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "role": "host",
      "isActive": true,
      "emailVerified": true
    },
    "token": "jwt-token",
    "expiresAt": "2024-01-01T00:00:00.000Z",
    "message": "Authentication successful"
  }
}
```

### POST /api/auth/logout
Logout the current user by clearing the authentication cookie.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## User Management Routes

### POST /api/users/create
Create a new user (Admin only).

**Headers:**
- `Authorization: Bearer <token>` or `Cookie: auth_token=<token>`

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "role": "host",
  "isActive": true,
  "emailVerified": false
}
```

### PUT /api/users/{id}/update
Update a user profile (Own profile or Admin).

**Headers:**
- `Authorization: Bearer <token>` or `Cookie: auth_token=<token>`

**Request Body:**
```json
{
  "email": "updated@example.com",
  "currentPassword": "oldpassword",
  "newPassword": "newpassword",
  "role": "host"
}
```

## Room Management Routes

### POST /api/rooms/create
Create a new room (Host or Admin only).

**Headers:**
- `Authorization: Bearer <token>` or `Cookie: auth_token=<token>`

**Request Body:**
```json
{
  "name": "My Room",
  "slug": "my-room",
  "maxParticipants": 10,
  "allowVideo": true
}
```

### GET /api/rooms/list
List rooms for the authenticated user.

**Headers:**
- `Authorization: Bearer <token>` or `Cookie: auth_token=<token>`

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `status`: Filter by room status (optional)

### POST /api/rooms/{id}/start-recording
Start recording in a room (Host or Admin only).

**Headers:**
- `Authorization: Bearer <token>` or `Cookie: auth_token=<token>`

**Request Body:**
```json
{
  "participantCount": 3
}
```

### POST /api/rooms/{id}/invite-guest
Invite a guest to a room (Host or Admin only).

**Headers:**
- `Authorization: Bearer <token>` or `Cookie: auth_token=<token>`

**Request Body:**
```json
{
  "displayName": "Guest Name",
  "email": "guest@example.com",
  "tokenExpirationHours": 24
}
```

## Error Responses

All routes return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "field": "fieldName" // For validation errors
}
```

Common error codes:
- `VALIDATION_ERROR` (400): Invalid input data
- `AUTHENTICATION_REQUIRED` (401): No valid authentication token
- `INSUFFICIENT_PERMISSIONS` (403): User lacks required permissions
- `ENTITY_NOT_FOUND` (404): Requested resource not found
- `CONFLICT_ERROR` (409): Resource conflict (e.g., duplicate email)
- `BUSINESS_RULE_VIOLATION` (422): Business rule violation
- `INTERNAL_ERROR` (500): Server error

## Authentication

The API supports two authentication methods:

1. **Bearer Token**: Include `Authorization: Bearer <token>` header
2. **Cookie**: The login endpoint sets an HTTP-only cookie that's automatically sent

The authentication middleware automatically handles both methods and provides user context to the route handlers.

## Service Layer Integration

All routes use the service layer architecture:

- **Use Cases**: Business logic is handled by use case classes
- **Dependency Injection**: Services are resolved through the container
- **Error Handling**: Domain errors are properly mapped to HTTP responses
- **Validation**: Input validation happens at both the route and domain levels
- **Security**: Authentication and authorization are handled by middleware