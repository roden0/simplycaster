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
- **Better Auth Integration**: Modern authentication system with session management and security features
- **Redis Performance Layer**: High-performance caching, session management, and real-time features
- **Server-Side Rendering (SSR)**: Optimal performance with Fresh framework
- **Islands Architecture**: Interactive components hydrated only where needed
- **Dark/Light Theme**: System preference detection with localStorage persistence
- **Responsive Design**: Mobile-first layout using Tailwind CSS
- **Type Safety**: Full TypeScript support throughout the application
- **Database**: PostgreSQL with Drizzle ORM and Row-Level Security (RLS)

## 🚀 Quick Start

### Prerequisites

- **Deno** (version 1.37 or later) - [Install Deno](https://deno.land/manual/getting_started/installation)
- **PostgreSQL** (version 14 or later) - [Install PostgreSQL](https://www.postgresql.org/download/)
- **Redis** (version 6 or later) - [Install Redis](https://redis.io/download)
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

3. **Configure your database and Redis in `.env`:**
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/simplycaster
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=your-redis-password
   JWT_SECRET=your-super-secret-jwt-key-here
   PASSWORD_PEPPER=your-password-pepper-here
   BASE_URL=http://localhost:8000
   ```

4. **Set up the database and Redis:**
   ```bash
   # Create the database
   createdb simplycaster
   
   # Run migrations (if available)
   deno task db:migrate
   
   # Start Redis server (if not running as service)
   redis-server
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

### Redis Configuration Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_METRICS_INTERVAL` | Metrics collection interval (ms) | `30000` |
| `REDIS_SLOW_QUERY_THRESHOLD` | Slow query threshold (ms) | `50` |
| `REDIS_LOG_LEVEL` | Logging level (debug/info/warn/error) | `info` |
| `REDIS_ENABLE_MONITORING` | Enable Redis monitoring | `true` |
| `REDIS_CACHE_TTL_DEFAULT` | Default cache TTL (seconds) | `3600` |
| `REDIS_SESSION_TTL` | Session TTL (seconds) | `86400` |

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