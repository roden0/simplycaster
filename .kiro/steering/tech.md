# Coding rules

1. Reveal the purpose The code should clearly explain what it does and why,
   without having to read comments or ask the person who programmed it (that
   person could be the you from a few months ago). The names of variables,
   functions, and classes should be expressive. The flow of logic should be easy
   to follow.

2. Minimize the number of elements The fewer concepts, classes, functions, and
   modules there are, the easier it will be to understand and maintain the
   system. Try not to overuse this rule, as it can result in highly coupled
   code.

3. No duplication If the same knowledge or logic is in more than one place,
   modifying one component will likely affect the others. This rule must be
   interpreted carefully; otherwise, it can be very problematic, as it can fill
   the entire code with premature abstractions. There are various techniques for
   how to proceed, but the most recommended is the rule of three: Until you see
   it duplicated three times, don't consider abstracting it.

4. Pass the tests The code must fulfill its purpose and function as expected.
   New code has tests. Refactored code doesn't break the tests.

Comply with DRY and SOLID principles.

Try to reuse and abstract code as much as possible without overengineering or
reinventing the wheel, rely in native browser elements, APIs, and modern CSS
aproaches. Less is more.

# Technology Stack

## Core Framework

- **Fresh**: Deno-based full-stack web framework with SSR and islands
  architecture
- **Deno**: Modern JavaScript/TypeScript runtime for server-side execution
- **Preact**: Lightweight React alternative for UI components
- **Vite**: Build tool and development server

## Audio/Video Processing

- **WebRTC**: Real-time peer-to-peer communication for audio/video
- **Mediasoup**: WebRTC SFU (Selective Forwarding Unit) for multi-party
  communication
- **MediaRecorder API**: Browser-native audio/video recording
- **FFmpeg.wasm**: Client-side audio processing and optimization
- **IndexedDB**: Temporary chunk buffering for recordings

## Database & Storage

- **PostgreSQL**: Primary database for business models and authentication
- **Redis**: Caching layer for real-time data
- **Drizzle**: ORM for PostgreSQL with TypeScript support
- **Server Storage**: File system storage for recordings and uploads
- **IndexedDB**: Client-side temporary storage for recording chunks

## Authentication & Security

- **OAuth2 with JWT PKCE**: Secure authentication flow
- **JWT Tokens**: Stateless authentication with automatic expiration
- **Role-based Access Control**: Admin, Host, Guest permissions
- **Rate Limiting**: Abuse prevention on critical endpoints
- **HTTPS**: Secure communication protocol

## Styling & UI

- **Tailwind CSS v4**: Utility-first CSS framework
- **Custom CSS**: Semantic classes in `assets/styles.css` for layout and theming
- **Dark/Light Theme**: CSS custom properties with system preference detection
- **WCAG 2.0**: Accessibility compliance with ARIA labels and keyboard
  navigation

## State Management

- **Preact Signals**: Reactive state management for islands
- **Fresh State**: Server-side state sharing via `ctx.state`
- **localStorage**: Client-side persistence for themes and tokens

## File Processing

- **ID3 Tag Parsing**: Metadata extraction from audio files
- **Resumable Uploads**: Handling unstable connections
- **RSS Feed Generation**: Standard podcast feed format
- **CDN Integration**: ETags and Cache-Control headers

## Testing

- **Deno Test**: Built-in test runner
- **JSDoc**: For component testing utilities
- **Preact Test Utils**: Component testing helpers

## Development Tools

- **TypeScript**: Full TypeScript support with JSX precompilation
- **Deno Lint**: Code linting with Fresh recommended rules
- **Deno Fmt**: Code formatting

## Deployment & Infrastructure

- **Docker**: Containerization for deployment
- **Kubernetes**: Container orchestration
- **Self-hosted SaaS**: Private server deployment model

## Common Commands

```bash
# Development
deno task dev          # Start development server with hot reload

# Building
deno task build        # Build for production
deno task start        # Start production server

# Quality Assurance
deno task check        # Run formatting, linting, and type checking
deno task test         # Run all tests

# Maintenance
deno task update       # Update Fresh framework
```

## Architecture Patterns

- **File-based Routing**: Routes defined in `routes/` directory
- **Islands**: Interactive components in `islands/` directory for WebRTC and
  recording
- **Components**: Reusable UI components in `components/` directory
- **Middleware**: Authentication, rate limiting, and security via Fresh
  middleware
- **Layouts**: Nested layouts with `_layout.tsx` and `_app.tsx`
- **Copy manager**: All the displayed texts are inside a JSON file
- **Local-first Processing**: Client-side audio processing before upload
- **Resumable Operations**: Handling network instability for uploads
