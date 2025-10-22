# SimplyCaster Database

This directory contains the comprehensive database schema, migrations, and utilities for SimplyCaster's podcast recording platform.

## 🚀 Quick Start

### Option 1: Docker (Recommended)
```bash
# Start PostgreSQL and application
deno task docker:up

# Set up database (migrations + seed data)
deno task db:setup

# Access the application
open http://localhost:8000
```

### Option 2: Local PostgreSQL
```bash
# Set your DATABASE_URL
export DATABASE_URL="postgres://user:pass@localhost:5432/dbname"

# Set up database
deno task db:setup

# Start application
deno task dev
```

## 📊 Database Schema

### Core Security Features
- **🔐 Salt + Pepper Authentication**: Per-user salt + global pepper for password hashing
- **🛡️ Row-Level Security (RLS)**: User-based data access control
- **🔒 Account Lockout**: Protection against brute force attacks
- **⏰ Token Expiration**: Automatic cleanup of expired tokens
- **📝 Audit Logging**: Complete action tracking
- **🗑️ Soft Deletes**: Data retention with logical deletion

### Table Structure

#### User Management
- **`users`**: Permanent users (admin, host) with security features
- **`user_invitations`**: Host/admin invitation system with token validation
- **`password_reset_tokens`**: Secure password reset flow
- **`guests`**: Temporary participants with magic link access

#### Content Management
- **`rooms`**: Recording rooms with status management and constraints
- **`recordings`**: Room recording metadata with status tracking
- **`recording_files`**: Individual participant recording files
- **`feed_episodes`**: Podcast episodes for RSS feed generation

#### Security & Monitoring
- **`audit_log`**: Immutable activity tracking with context
- **Comprehensive constraints**: Data integrity and validation
- **Optimized indexes**: Performance and search optimization

## 🛠️ Database Tasks

```bash
# Schema Management
deno task db:generate     # Generate migrations from schema changes
deno task db:migrate      # Apply pending migrations
deno task db:push         # Push schema directly (dev only)
deno task db:studio       # Open Drizzle Studio (database GUI)

# Data Management
deno task db:seed         # Seed initial data
deno task db:setup        # Complete setup (migrate + seed)
deno task db:reset        # Reset database (Docker restart + setup)

# Docker Management
deno task docker:up       # Start all services
deno task docker:down     # Stop all services
deno task docker:logs     # View container logs
```

## 🔧 Development Workflow

### Making Schema Changes
1. **Modify** `database/schema.ts`
2. **Generate migration**: `deno task db:generate`
3. **Review** generated migration in `database/migrations/`
4. **Apply migration**: `deno task db:migrate`
5. **Test** changes with `deno task db:studio`

### Adding New Features
1. **Update schema** with new tables/columns
2. **Update services** in `database/services.ts`
3. **Add business logic** in application layer
4. **Update API endpoints** to use new data
5. **Test thoroughly** with real data

## 🌍 Environment Configuration

### Docker with Secrets (Recommended)
```bash
# Secrets are automatically read from Docker secrets
# No environment variables needed - all handled via secrets files
```

### Local Development
```bash
# Option 1: Use environment variables
cp .env.example .env
# Edit .env with your database credentials

# Option 2: Use Docker secrets (recommended)
deno task docker:up  # Uses secrets from secrets/ directory
```

### Production Deployment
```bash
# Generate secure secrets for production
deno task secrets:generate

# Update docker-compose.yml to use production secrets
# Deploy with proper secret management
```

## 🔍 Database Services

The `database/services.ts` file provides high-level database operations:

```typescript
// User operations
await getUserById(id)
await getUserByEmail(email)
await getAllUsers()

// Room operations
await getRoomById(id)
await getActiveRooms()
await getRoomsByHostId(hostId)

// Recording operations
await getRecordingsByUserId(userId)
await getAllRecordings()

// Feed operations
await getPublishedFeedEpisodes()
await getAllFeedEpisodes()

// Audit operations
await createAuditLog(userId, action, entityType)
await getRecentAuditLogs()
```

## 🏗️ Production Deployment

### Security Checklist
- [ ] Use strong, unique passwords and secrets
- [ ] Enable SSL/TLS for database connections
- [ ] Set up regular automated backups
- [ ] Configure connection pooling
- [ ] Enable database monitoring and alerting
- [ ] Review and test Row-Level Security policies
- [ ] Set up log rotation for audit logs

### Performance Optimization
- [ ] Monitor query performance with `EXPLAIN ANALYZE`
- [ ] Consider read replicas for scaling
- [ ] Implement database connection pooling
- [ ] Set up proper indexing for search queries
- [ ] Configure PostgreSQL for your workload

### Backup Strategy
```bash
# Create backup
pg_dump $DATABASE_URL > backup.sql

# Restore backup
psql $DATABASE_URL < backup.sql
```

## 🐛 Troubleshooting

### Connection Issues
```bash
# Check database status
deno task docker:logs db

# Test connection
deno task db:studio

# Verify environment
echo $DATABASE_URL
```

### Migration Problems
```bash
# Reset development database
deno task db:reset

# Check migration status
deno task db:studio
```

### Performance Issues
```bash
# Analyze slow queries
EXPLAIN ANALYZE SELECT ...

# Check database stats
SELECT * FROM pg_stat_activity;
```

### Data Integrity Issues
```bash
# Check constraints
SELECT * FROM information_schema.check_constraints;

# Verify foreign keys
SELECT * FROM information_schema.referential_constraints;
```

## 📚 Additional Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Database Design Best Practices](https://www.postgresql.org/docs/current/ddl-best-practices.html)
- [Row-Level Security Guide](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)