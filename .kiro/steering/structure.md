# Project Structure

## Root Directory

```
├── main.ts              # Application entry point with middleware setup
├── utils.ts             # Shared utilities and Fresh define helper
├── deno.json            # Deno configuration and dependencies
├── vite.config.ts       # Vite build configuration
└── client.ts            # Client-side entry point
```

## Core Directories

### `/routes/` - File-based Routing

- `_app.tsx` - Root HTML document wrapper with theme detection
- `_layout.tsx` - Shared layout with Header/Footer
- `index.tsx` - Sign In page (authentication entry point)
- `dashboard.tsx` - Main dashboard with room/recording statistics
- `room.tsx` - WebRTC room interface with recording controls
- `archive.tsx` - Recording management and download interface
- `feed.tsx` - Podcast feed management and file uploads
- `crew.tsx` - User management (hosts, guests, invitations)
- `login.tsx` - OAuth2 authentication flow
- `invite.tsx` - Guest invitation landing page
- `host-creation.tsx` - Host registration completion page
- `/api/` - API endpoints for authentication, WebRTC, file operations

### `/components/` - Reusable UI Components

- Server-side rendered components
- Shared across multiple pages
- Examples: `Button.tsx`, `Header.tsx`, `Footer.tsx`, `FormInput.tsx`
- `RecordingControls.tsx` - Recording start/stop interface
- `UserList.tsx` - Participant display components
- `FileUpload.tsx` - File upload form components
- `SearchableList.tsx` - Paginated list components

### `/islands/` - Interactive Client Components

- Client-side hydrated components with WebRTC and recording functionality
- Use Preact Signals for state management
- Examples:
  - `WebRTCRoom.tsx` - Main WebRTC communication handler
  - `AudioRecorder.tsx` - MediaRecorder API integration
  - `VideoMosaic.tsx` - Participant video display
  - `ThemeToggle.tsx` - Dark/light theme switcher
  - `FileProcessor.tsx` - FFmpeg.wasm audio processing
  - `InviteManager.tsx` - Guest invitation interface

### `/lib/` - Core Business Logic

- `auth/` - OAuth2, JWT, and role-based access control
- `webrtc/` - Mediasoup integration and WebRTC utilities
- `recording/` - Audio processing, FFmpeg.wasm integration
- `storage/` - File system operations and database queries
- `feed/` - RSS generation and ID3 tag parsing
- `security/` - Rate limiting, input sanitization, token management

### `/assets/` - Static Assets & Styles

- `styles.css` - Global CSS with Tailwind imports and semantic classes
- Custom CSS organized by feature:
  - Login/authentication forms
  - Dashboard layout and statistics
  - Room interface and video mosaic
  - Archive and feed management
  - Crew management interface

### `/static/` - Public Static Files

- `favicon.ico`, `logo.svg`
- Audio processing workers
- WebRTC configuration files
- Served directly at root URL

### `/tests/` - Test Suite

- `test-utils.ts` - Shared testing utilities including WebRTC mocks
- Component tests: `*.test.tsx`
- Route tests: `routes.test.ts`
- Integration tests for authentication, WebRTC, and file operations
- `webrtc.test.ts` - WebRTC functionality tests
- `recording.test.ts` - Audio processing tests

### `/database/` - Database Schema & Migrations

- `migrations/` - PostgreSQL schema migrations
- `models/` - Database model definitions
- `seeds/` - Test data and initial setup

## Naming Conventions

### Files & Components

- **Routes**: lowercase with hyphens (`dashboard.tsx`, `crew.tsx`,
  `host-creation.tsx`)
- **Components**: PascalCase (`Button.tsx`, `RecordingControls.tsx`,
  `UserList.tsx`)
- **Islands**: PascalCase (`WebRTCRoom.tsx`, `AudioRecorder.tsx`,
  `VideoMosaic.tsx`)
- **Tests**: match source file with `.test.tsx` suffix
- **API Routes**: RESTful naming (`/api/rooms`, `/api/recordings`, `/api/auth`)

### CSS Classes

- **Semantic classes**: kebab-case (`recording-controls`, `video-mosaic`,
  `crew-list`)
- **Tailwind utilities**: standard Tailwind syntax
- **Theme variants**: use `dark:` prefix for dark mode styles
- **Component-specific**: prefix with component name (`room-participant`,
  `feed-item`)

### Database Tables

- **Snake_case**: PostgreSQL convention (`room_recordings`, `user_tokens`,
  `feed_items`)
- **Plural names**: for entity tables (`rooms`, `users`, `recordings`)
- **Junction tables**: descriptive names (`room_participants`, `user_roles`)

## Architecture Rules

### Component Organization

- **Components**: Pure, server-rendered UI components
- **Islands**: Interactive components requiring WebRTC, recording, or complex
  client-side logic
- **Layouts**: Nested layout system with authentication and navigation
- **Lib**: Business logic separated from UI components

### State Management

- **Server State**: Use `ctx.state` for user authentication and permissions
- **Client State**: Use Preact Signals for WebRTC connections and recording
  state
- **Persistent State**: localStorage for themes, IndexedDB for recording chunks
- **Real-time State**: WebRTC data channels for room communication

### Security Architecture

- **Route Protection**: Middleware-based authentication on protected routes
- **Role Validation**: Server-side role checking for admin/host/guest actions
- **Token Management**: Automatic expiration and refresh for guest tokens
- **Input Sanitization**: All user inputs validated and sanitized

### File Organization

- **Recording Storage**: Organized by room name with metadata JSON files
- **Feed Files**: Separate directory with ID3 tag parsing
- **Temporary Files**: IndexedDB for client-side, automatic cleanup
- **Upload Handling**: Resumable uploads with progress tracking

### Styling Approach

- **Mobile-first**: Responsive design starting from mobile
- **Semantic CSS**: Custom classes for complex layouts (room interface, video
  mosaic)
- **Tailwind utilities**: For spacing, colors, and common styles
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support
- **Theme System**: CSS custom properties with system preference detection
