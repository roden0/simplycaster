# SimplyCaster

A podcast/conversation recording platform built with Fresh (Deno) and focused on simplicity, audio quality, and self-hosted deployment.

## 🎯 Features

### Core Functionality
- **Real-time Audio Recording**: WebRTC-based multi-participant recording with high-quality audio processing
- **Room Management**: Create and manage recording rooms with guest invitation system
- **User Management**: Role-based access control (Admin, Host, Guest) with secure authentication
- **Feed Generation**: Automatic podcast RSS feed generation with ID3 tag support
- **Archive System**: Organized storage and management of recorded sessions

### Technical Features
- **Clean Architecture**: Service layer with dependency injection and use cases
- **Event-Driven Architecture**: RabbitMQ-based domain events for scalable, decoupled operations
- **Better Auth Integration**: Modern authentication system with session management and security features
- **Redis Performance Layer**: High-performance caching, session management, and real-time features
- **Server-Side Rendering (SSR)**: Optimal performance with Fresh framework
- **Islands Architecture**: Interactive components hydrated only where needed
- **Dark/Light Theme**: System preference detection with localStorage persistence
- **Responsive Design**: Mobile-first layout using Tailwind CSS
- **Type Safety**: Full TypeScript support throughout the application
- **Database**: PostgreSQL with Drizzle ORM and Row-Level Security (RLS)
- **Monitoring & Observability**: Comprehensive metrics, health checks, and structured logging

## 🚀 Quick Start

### Prerequisites

- **Deno** (version 1.37 or later) - [Install Deno](https://deno.land/manual/getting_started/installation)
- **PostgreSQL** (version 14 or later) - [Install PostgreSQL](https://www.postgresql.org/download/)
- **Redis** (version 6 or later) - [Install Redis](https://redis.io/download)
- **RabbitMQ** (version 3.8 or later) - [Install RabbitMQ](https://www.rabbitmq.com/download.html)
- **Node.js** (for some build tools) - [Install Node.js](https://nodejs.org/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/simplycaster.git
   cd simplycaster
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```

3. **Configure your database, Redis, and RabbitMQ in `.env`:**
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/simplycaster
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=your-redis-password
   RABBITMQ_HOST=localhost
   RABBITMQ_PORT=5672
   RABBITMQ_USERNAME=guest
   RABBITMQ_PASSWORD=guest
   JWT_SECRET=your-super-secret-jwt-key-here
   PASSWORD_PEPPER=your-password-pepper-here
   BASE_URL=http://localhost:8000
   ```

4. **Set up the database, Redis, and RabbitMQ:**
   ```bash
   # Create the database
   createdb simplycaster
   
   # Run migrations (if available)
   deno task db:migrate
   
   # Start Redis server (if not running as service)
   redis-server
   
   # Start RabbitMQ server (if not running as service)
   rabbitmq-server
   
   # Enable RabbitMQ Management Plugin (optional, for web UI)
   rabbitmq-plugins enable rabbitmq_management
   ```

5. **Install dependencies and start development server:**
   ```bash
   deno task dev
   ```

6. **Open your browser:**
   Navigate to [http://localhost:8000](http://localhost:8000)

### First-Time Setup

1. **Create an admin user:**
   The application will guide you through creating the first admin user on initial setup.

2. **Configure your first room:**
   - Login with your admin account
   - Navigate to the dashboard
   - Create your first recording room

3. **Monitor system health (optional):**
   - RabbitMQ Management UI: [http://localhost:15672](http://localhost:15672) (guest/guest)
   - Application health checks: [http://localhost:8000/api/health/rabbitmq](http://localhost:8000/api/health/rabbitmq)
   - Metrics dashboard: [http://localhost:8000/api/metrics/rabbitmq/summary](http://localhost:8000/api/metrics/rabbitmq/summary)

## 🛠️ Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `deno task dev` | Start development server with hot reload |
| `deno task build` | Build for production |
| `deno task start` | Start production server |
| `deno task check` | Run formatting, linting, and type checking |
| `deno task test` | Run all tests |
| `deno task db:migrate` | Run database migrations |
| `deno task db:seed` | Seed database with sample data |

### Project Structure

```
├── components/              # Reusable UI components
├── islands/                # Interactive client-side components
├── routes/                 # File-based routing
│   ├── api/               # API endpoints
│   │   ├── auth/          # Authentication routes
│   │   ├── users/         # User management
│   │   └── rooms/         # Room management
│   └── ...                # Page routes
├── lib/                   # Core business logic
│   ├── application/       # Use cases (application layer)
│   ├── auth/             # Better Auth configuration and types
│   ├── domain/           # Domain entities and interfaces
│   ├── infrastructure/   # Repository implementations
│   ├── container/        # Dependency injection
│   ├── middleware/       # Authentication middleware
│   └── services/         # Client-side API services
├── database/             # Database schema and migrations
├── static/              # Static assets
└── tests/               # Test files
```

### Architecture

SimplyCaster follows **Clean Architecture** principles:

- **Domain Layer**: Core business entities and rules
- **Application Layer**: Use cases and business operations
- **Infrastructure Layer**: Database, external services, and technical implementations
- **Presentation Layer**: Routes, components, and user interface

### Redis Performance Layer

SimplyCaster leverages **Redis** for high-performance caching and real-time features:

#### Core Redis Features
- **Intelligent Caching**: Multi-layer caching strategy with automatic invalidation
- **Session Management**: Redis-based session storage with automatic cleanup
- **Rate Limiting**: Sliding window rate limiting for API protection
- **Real-time Communication**: Pub/Sub for live room updates and notifications
- **Performance Optimization**: Query result caching and database load reduction

#### Monitoring & Observability
- **Health Monitoring**: Comprehensive Redis health checks and diagnostics
- **Performance Metrics**: Real-time metrics collection with alerting
- **Operation Logging**: Structured logging for all Redis operations
- **Slow Query Detection**: Automatic detection and logging of slow operations
- **Cache Analytics**: Hit rates, response times, and performance insights

#### Redis Configuration
```env
# Basic Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DATABASE=0

# Performance Tuning
REDIS_MAX_RETRIES=3
REDIS_RETRY_DELAY=1000
REDIS_COMMAND_TIMEOUT=5000
REDIS_KEEP_ALIVE=true

# Monitoring Configuration
REDIS_METRICS_INTERVAL=30000
REDIS_SLOW_QUERY_THRESHOLD=50
REDIS_LOG_LEVEL=info
REDIS_ENABLE_MONITORING=true
```

#### Redis APIs
- **Health Check**: `GET /api/admin/redis/health` - Redis health status and diagnostics
- **Metrics**: `GET /api/admin/redis/metrics` - Performance metrics and alerts
- **Logs**: `GET /api/admin/redis/logs` - Operation logs and error analysis
- **Cache Management**: `POST /api/admin/cache/warm` - Cache warming and invalidation

### Authentication & Security

SimplyCaster uses **Better Auth** for modern, secure authentication:

- **Better Auth Integration**: Comprehensive authentication system with session management
- **Email & Password**: Secure password-based authentication with proper hashing
- **Session Management**: Automatic session handling with configurable expiration
- **Role-Based Access**: Admin, Host, and Guest roles with granular permissions
- **Security Features**: Rate limiting, account lockout, and audit logging

### API Documentation

The API follows RESTful conventions with consistent error handling:

- **Authentication**: Better Auth with secure session management
- **Authorization**: Role-based access control
- **Error Handling**: Standardized error responses
- **Documentation**: Available at `/api/README.md`

## 🧪 Testing

### Running Tests

```bash
# Run all tests
deno task test

# Run specific test file
deno test tests/specific-test.ts

# Run tests with coverage
deno task test --coverage
```

### Test Structure

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test API endpoints and database operations
- **Component Tests**: Test UI components and user interactions

## 📦 Deployment

### Production Build

1. **Build the application:**
   ```bash
   deno task build
   ```

2. **Set production environment variables:**
   ```env
   NODE_ENV=production
   DATABASE_URL=your-production-database-url
   JWT_SECRET=your-production-jwt-secret
   BASE_URL=https://your-domain.com
   ```

3. **Start the production server:**
   ```bash
   deno task start
   ```

### Docker Deployment

1. **Build Docker image:**
   ```bash
   docker build -t simplycaster .
   ```

2. **Run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

### Self-Hosted Deployment

SimplyCaster is designed for self-hosted deployment:

1. **Server Requirements:**
   - 2GB RAM minimum (4GB recommended)
   - 20GB storage minimum
   - Ubuntu 20.04+ or similar Linux distribution

2. **Reverse Proxy Setup (Nginx):**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. **SSL Certificate:**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | - | ✅ |
| `REDIS_HOST` | Redis server hostname | `localhost` | ✅ |
| `REDIS_PORT` | Redis server port | `6379` | ✅ |
| `REDIS_PASSWORD` | Redis authentication password | - | ❌ |
| `JWT_SECRET` | Secret key for JWT tokens | - | ✅ |
| `PASSWORD_PEPPER` | Additional password security | - | ✅ |
| `BASE_URL` | Application base URL | `http://localhost:8000` | ✅ |
| `NODE_ENV` | Environment mode | `development` | ❌ |
| `PORT` | Server port | `8000` | ❌ |
| `RABBITMQ_HOST` | RabbitMQ server hostname | `localhost` | ✅ |
| `RABBITMQ_PORT` | RabbitMQ server port | `5672` | ✅ |
| `RABBITMQ_USERNAME` | RabbitMQ username | `guest` | ✅ |
| `RABBITMQ_PASSWORD` | RabbitMQ password | `guest` | ✅ |

### Redis Configuration Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_METRICS_INTERVAL` | Metrics collection interval (ms) | `30000` |
| `REDIS_SLOW_QUERY_THRESHOLD` | Slow query threshold (ms) | `50` |
| `REDIS_LOG_LEVEL` | Logging level (debug/info/warn/error) | `info` |
| `REDIS_ENABLE_MONITORING` | Enable Redis monitoring | `true` |
| `REDIS_CACHE_TTL_DEFAULT` | Default cache TTL (seconds) | `3600` |
| `REDIS_SESSION_TTL` | Session TTL (seconds) | `86400` |

### RabbitMQ Configuration Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RABBITMQ_HOST` | RabbitMQ server hostname | `localhost` |
| `RABBITMQ_PORT` | RabbitMQ server port | `5672` |
| `RABBITMQ_USERNAME` | RabbitMQ username | `guest` |
| `RABBITMQ_PASSWORD` | RabbitMQ password | `guest` |
| `RABBITMQ_VHOST` | RabbitMQ virtual host | `/` |
| `RABBITMQ_CONNECTION_TIMEOUT` | Connection timeout (ms) | `10000` |
| `RABBITMQ_HEARTBEAT_INTERVAL` | Heartbeat interval (seconds) | `60` |
| `RABBITMQ_MAX_RETRIES` | Maximum retry attempts | `3` |
| `RABBITMQ_RETRY_DELAY` | Retry delay (ms) | `1000` |
| `RABBITMQ_CIRCUIT_BREAKER_ENABLED` | Enable circuit breaker | `true` |
| `RABBITMQ_FAILURE_THRESHOLD` | Circuit breaker failure threshold | `5` |
| `RABBITMQ_RECOVERY_TIMEOUT` | Circuit breaker recovery timeout (ms) | `30000` |
| `RABBITMQ_QUEUE_TTL` | Queue message TTL (ms) | `86400000` |
| `RABBITMQ_MAX_QUEUE_DEPTH` | Maximum queue depth | `1000` |
| `RABBITMQ_MAX_DLQ_DEPTH` | Maximum dead letter queue depth | `100` |
| `RABBITMQ_METRICS_ENABLED` | Enable metrics collection | `true` |
| `RABBITMQ_HEALTH_CHECK_INTERVAL` | Health check interval (ms) | `30000` |

### Database Configuration

SimplyCaster uses PostgreSQL with the following features:
- **Row-Level Security (RLS)** for data isolation
- **UUID v7** for primary keys
- **Better Auth Tables** for session and account management
- **Audit logging** for security tracking
- **Soft deletes** for data retention

### Redis Configuration

SimplyCaster uses Redis for high-performance caching and real-time features:
- **Multi-layer Caching** with intelligent invalidation strategies
- **Session Storage** with automatic cleanup and expiration
- **Rate Limiting** using sliding window algorithms
- **Pub/Sub Messaging** for real-time room updates
- **Performance Monitoring** with comprehensive metrics and alerting
- **Operation Logging** with structured audit trails

### RabbitMQ Event-Driven Architecture

SimplyCaster implements a comprehensive **event-driven architecture** using **RabbitMQ** for reliable, scalable domain event publishing and processing.

#### Domain Events System

The application publishes domain events for all significant business operations, enabling:
- **Decoupled Architecture**: Services communicate through events rather than direct calls
- **Audit Trail**: Complete history of all business operations
- **Integration**: Easy integration with external systems and microservices
- **Scalability**: Asynchronous processing for improved performance
- **Reliability**: Guaranteed message delivery with retry mechanisms

#### Published Domain Events

SimplyCaster publishes the following domain events:

**Room Events:**
- `room.created` - When a new recording room is created
- `room.closed` - When a room is closed and all participants are removed
- `room.updated` - When room settings or metadata are modified

**Recording Events:**
- `recording.started` - When audio recording begins in a room
- `recording.stopped` - When recording is manually stopped
- `recording.completed` - When recording processing is finished successfully
- `recording.failed` - When recording processing encounters an error

**User Events:**
- `user.joined` - When a guest joins a room
- `user.left` - When a participant leaves a room voluntarily
- `user.kicked` - When a host removes a participant from a room

**Authentication Events:**
- `auth.login` - When a user successfully authenticates
- `auth.logout` - When a user logs out or session expires
- `user.created` - When a new user account is created
- `user.updated` - When user profile information is modified

**Feed Events:**
- `feed.published` - When a podcast episode is published to the RSS feed
- `feed.updated` - When episode metadata is modified
- `feed.deleted` - When an episode is removed from the feed

#### Event Structure

All domain events follow a standardized schema:

```typescript
interface DomainEvent {
  id: string;              // Unique event identifier (UUID)
  type: string;            // Event type (e.g., 'room.created')
  version: string;         // Schema version for compatibility
  timestamp: Date;         // When the event occurred
  correlationId?: string;  // For tracing across services
  userId?: string;         // User who triggered the event
  sessionId?: string;      // Session tracking
  data: Record<string, unknown>; // Event payload
  metadata?: EventMetadata;      // Additional context
}
```

#### RabbitMQ Infrastructure

**Queue Topology:**
- **Topic Exchange**: Routes events based on routing keys (e.g., `room.*`, `recording.*`)
- **Durable Queues**: Ensures message persistence across server restarts
- **Dead Letter Queues**: Handles failed message processing with retry logic
- **Message TTL**: Automatic cleanup of old messages

**Reliability Features:**
- **Circuit Breaker**: Prevents cascade failures when RabbitMQ is unavailable
- **Retry Logic**: Exponential backoff for failed message publishing
- **Connection Management**: Automatic reconnection with health monitoring
- **Message Confirmation**: Publisher confirms for guaranteed delivery

**Monitoring & Observability:**
- **Prometheus Metrics**: Comprehensive metrics for monitoring and alerting
- **Health Checks**: Real-time health status for queues and connections
- **Performance Tracking**: Latency, throughput, and error rate monitoring
- **Structured Logging**: Detailed logs for debugging and audit trails

#### RabbitMQ Configuration

```env
# RabbitMQ Connection
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/

# Performance & Reliability
RABBITMQ_CONNECTION_TIMEOUT=10000
RABBITMQ_HEARTBEAT_INTERVAL=60
RABBITMQ_MAX_RETRIES=3
RABBITMQ_RETRY_DELAY=1000

# Circuit Breaker
RABBITMQ_CIRCUIT_BREAKER_ENABLED=true
RABBITMQ_FAILURE_THRESHOLD=5
RABBITMQ_RECOVERY_TIMEOUT=30000

# Queue Configuration
RABBITMQ_QUEUE_TTL=86400000        # 24 hours
RABBITMQ_MAX_QUEUE_DEPTH=1000
RABBITMQ_MAX_DLQ_DEPTH=100

# Monitoring
RABBITMQ_METRICS_ENABLED=true
RABBITMQ_HEALTH_CHECK_INTERVAL=30000
```

#### RabbitMQ APIs

- **Health Check**: `GET /api/health/rabbitmq` - Overall RabbitMQ system health
- **Queue Health**: `GET /api/health/rabbitmq/queues` - Detailed queue status and metrics
- **Circuit Breaker**: `GET /api/health/rabbitmq/circuit-breaker` - Circuit breaker state and health
- **Metrics**: `GET /api/metrics/rabbitmq` - Prometheus-formatted metrics for monitoring
- **Metrics Summary**: `GET /api/metrics/rabbitmq/summary` - JSON metrics summary for dashboards

#### Event Processing

Events are processed asynchronously with the following guarantees:
- **At-least-once delivery**: Events are guaranteed to be delivered
- **Ordered processing**: Events for the same entity are processed in order
- **Idempotent handling**: Duplicate events are handled gracefully
- **Error recovery**: Failed events are retried with exponential backoff
- **Dead letter handling**: Permanently failed events are stored for manual review

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Quick Contribution Guide

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run tests: `deno task test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 📋 TODO & Roadmap

The following features are planned for future development:

### 🎥 WebRTC Infrastructure
- **Signaling Server**: Implement WebRTC signaling server for peer-to-peer connection establishment
  - WebSocket-based signaling for offer/answer exchange
  - Session management for multi-participant rooms
  - Connection state management and recovery
  - Integration with existing room management system

- **ICE Servers**: Configure and integrate ICE (Interactive Connectivity Establishment) servers
  - STUN server configuration for NAT traversal
  - TURN server setup for relay connections behind restrictive firewalls
  - Automatic server selection and failover
  - Cost optimization for TURN server usage

- **Client-side WebRTC Code**: Develop comprehensive client-side WebRTC implementation
  - MediaStream handling for audio/video capture
  - RTCPeerConnection management for multiple participants
  - Audio processing and quality optimization
  - Adaptive bitrate and quality control
  - Screen sharing and presentation mode
  - Real-time audio level monitoring
  - Connection quality indicators and diagnostics

### 📊 Enhanced Telemetry and Monitoring
- **Application Performance Monitoring (APM)**: Integrate comprehensive application monitoring
  - Request tracing and performance profiling
  - Database query performance monitoring
  - Memory usage and garbage collection metrics
  - Custom business metrics and KPIs
  - Error tracking and alerting

- **WebRTC Telemetry**: Implement detailed WebRTC connection monitoring
  - Connection quality metrics (latency, packet loss, jitter)
  - Audio quality measurements and analysis
  - Bandwidth usage and optimization tracking
  - Participant connection diagnostics
  - Real-time quality alerts and notifications

- **Business Intelligence**: Add analytics and reporting capabilities
  - Recording session analytics and insights
  - User engagement and usage patterns
  - System performance trends and capacity planning
  - Cost analysis and optimization recommendations
  - Custom dashboards and reporting tools

### 🔧 Implementation Priority
1. **Phase 1**: Signaling Server and basic WebRTC infrastructure
2. **Phase 2**: ICE servers configuration and NAT traversal
3. **Phase 3**: Client-side WebRTC implementation and audio processing
4. **Phase 4**: Enhanced telemetry and monitoring systems

### 🤝 Contributing to Roadmap
We welcome contributions and feedback on these planned features:
- Review and discuss roadmap items in [GitHub Discussions](https://github.com/your-username/simplycaster/discussions)
- Submit feature requests and improvements via [GitHub Issues](https://github.com/your-username/simplycaster/issues)


## 🆘 Support

- **Documentation**: Check the `/docs` directory for detailed guides
- **Issues**: Report bugs and request features on [GitHub Issues](https://github.com/your-username/simplycaster/issues)
- **Discussions**: Join community discussions on [GitHub Discussions](https://github.com/your-username/simplycaster/discussions)

## 🙏 Acknowledgments

[![Made with Fresh](https://fresh.deno.dev/fresh-badge.svg)](https://fresh.deno.dev)

- Powered by [Deno](https://deno.land/) - A modern runtime for JavaScript and TypeScript
- Database management with [Drizzle ORM](https://orm.drizzle.team/)
- UI components styled with [Tailwind CSS](https://tailwindcss.com/)

---

**SimplyCaster** - Making podcast recording simple, secure, and self-hosted. 🎙️