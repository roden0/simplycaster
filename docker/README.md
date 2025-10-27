# SimplyCaster Docker Setup

This directory contains Docker configuration for SimplyCaster development and production environments.

## Quick Start

### Development with Docker Compose

1. **Start the services:**
   ```bash
   deno task docker:up
   ```

2. **View logs:**
   ```bash
   deno task docker:logs
   ```

3. **Stop services:**
   ```bash
   deno task docker:down
   ```

### First Time Setup

1. **Copy environment file:**
   ```bash
   cp .env.example .env.docker
   ```

2. **Start services:**
   ```bash
   docker-compose up -d
   ```

3. **Run database migrations:**
   ```bash
   deno task db:migrate
   ```

4. **Access the application:**
   - Application: http://localhost:8000
   - Database Admin (Adminer): http://localhost:8080

## Services

### Application (api)
- **Image:** denoland/deno:1.46.3
- **Port:** 8000
- **Environment:** Development with hot reload
- **Volumes:** Source code mounted for development

### Database (db)
- **Image:** postgres:16
- **Port:** 5432
- **Database:** appdb
- **User:** app
- **Password:** secret

### Database Admin (adminer)
- **Image:** adminer:4.8.1
- **Port:** 8080
- **Purpose:** Database administration interface

### Coturn ICE Server (coturn)
- **Image:** Custom build based on coturn/coturn:4.6.2-alpine
- **Ports:** 3478 (STUN/TURN), 5349 (TURNS), 49152-65535 (relay range)
- **Purpose:** WebRTC NAT traversal for peer-to-peer connections
- **Configuration:** See `docker/coturn/README.md` for details

## Database Management

### Migrations
```bash
# Generate migration from schema changes
deno task db:generate

# Apply migrations to database
deno task db:migrate

# Push schema directly (development only)
deno task db:push

# Open Drizzle Studio
deno task db:studio
```

### Database Access
```bash
# Connect to PostgreSQL directly
docker-compose exec db psql -U app -d appdb

# View database logs
docker-compose logs db
```

## Environment Variables

### Development (.env.docker)
- `DATABASE_URL`: PostgreSQL connection string for Docker
- `NODE_ENV`: Set to "development"
- `PORT`: Application port (8000)
- `LOG_LEVEL`: Logging level (debug for development)

### Coturn ICE Server
- `COTURN_SECRET`: Shared secret for TURN authentication
- `COTURN_REALM`: TURN realm (default: simplycast.local)
- `COTURN_EXTERNAL_IP`: External IP for NAT traversal (auto-detected if empty)
- `COTURN_LOG_LEVEL`: Coturn logging level (0-4, default: 3)
- `COTURN_MIN_PORT`: Minimum relay port (default: 49152)
- `COTURN_MAX_PORT`: Maximum relay port (default: 49252)

### Production
- Use environment-specific values
- Secure JWT secrets
- Production database credentials
- HTTPS configuration

## Volumes

### Persistent Data
- `postgres_data`: Database files
- `deno_cache`: Deno module cache

### Development Mounts
- `.:/app`: Source code (with watch mode)
- `deno_cache:/deno-dir`: Deno cache directory

## Networking

All services run on the `simplycast_network` Docker network, allowing internal communication between containers.

## Health Checks

### Database
- Command: `pg_isready -U app -d appdb`
- Interval: 10s
- Timeout: 5s
- Retries: 5

### Application
- Endpoint: `/api/health`
- Checks database connectivity
- Returns service status

## Troubleshooting

### Common Issues

1. **Port conflicts:**
   ```bash
   # Check if ports are in use
   lsof -i :8000
   lsof -i :5432
   lsof -i :8080
   ```

2. **Database connection issues:**
   ```bash
   # Check database logs
   docker-compose logs db
   
   # Restart database
   docker-compose restart db
   ```

3. **Permission issues:**
   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER .
   ```

4. **Clear everything and restart:**
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```

### Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f db
```

## Production Deployment

For production deployment, use the included `Dockerfile`:

```bash
# Build production image
docker build -t simplycast:latest .

# Run with production environment
docker run -d \
  --name simplycast \
  -p 8000:8000 \
  -e DATABASE_URL=your-production-db-url \
  -e NODE_ENV=production \
  simplycast:latest
```