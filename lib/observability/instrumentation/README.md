# Custom Instrumentation Layer

This module provides comprehensive OpenTelemetry instrumentation for SimplyCaster operations. The instrumentation layer is designed to provide detailed observability into the application's core functionality.

## Overview

The custom instrumentation layer includes four main components:

1. **Room Management Instrumentation** - Tracks room operations, participant management, and recording activities
2. **WebRTC Operations Instrumentation** - Monitors signaling, connection establishment, and media stream management
3. **Database Operations Instrumentation** - Instruments queries, transactions, and connection pool usage
4. **Redis Cache Instrumentation** - Tracks cache operations, session management, and rate limiting

## Features

### Room Management Instrumentation

- **Room Operations**: Create, join, leave, and close operations
- **Participant Management**: Join, leave, and kick operations with participant type tracking
- **Recording Operations**: Start/stop recording with duration and participant count metrics
- **Statistics**: Real-time room statistics including participant count, utilization, and session duration

### WebRTC Operations Instrumentation

- **Signaling**: Offer/answer exchange, ICE candidate processing
- **Connection Management**: Connection establishment, state changes, and quality monitoring
- **Media Streams**: Stream addition/removal, mute/unmute operations
- **Quality Metrics**: RTT, packet loss, jitter, bitrates, and frame rates

### Database Operations Instrumentation

- **Query Instrumentation**: Automatic query timing and result tracking
- **Transaction Management**: Transaction boundaries and query count tracking
- **Connection Pool Monitoring**: Pool utilization, active/idle connections, and wait times
- **Performance Metrics**: Query duration percentiles, error rates, and slow query detection

### Redis Cache Instrumentation

- **Cache Operations**: Hit/miss tracking, set/delete operations with TTL monitoring
- **Session Management**: Session creation, updates, and cleanup operations
- **Rate Limiting**: Request counting, limit enforcement, and violation tracking
- **Connection Pool**: Redis connection pool monitoring and statistics

## Usage

### Basic Usage

```typescript
import {
  instrumentRoomCreation,
  instrumentSignaling,
  autoInstrumentQuery,
  instrumentCacheOperation,
} from "lib/observability/index.ts";

// Room creation
const room = await instrumentRoomCreation(
  {
    roomId: "room-123",
    roomName: "My Room",
    hostId: "user-456",
    operation: "create",
    maxParticipants: 10,
  },
  async () => {
    // Your room creation logic here
    return createRoomInDatabase();
  }
);

// WebRTC signaling
const answer = await instrumentSignaling(
  {
    roomId: "room-123",
    participantId: "user-789",
    participantType: "guest",
    operation: "offer",
    sdpType: "offer",
  },
  async () => {
    // Your signaling logic here
    return processWebRTCOffer();
  }
);

// Database query
const users = await autoInstrumentQuery(
  "SELECT * FROM users WHERE active = true",
  "user-123", // userId
  "conn-456", // connectionId
  undefined,  // transactionId
  async () => {
    // Your database query logic here
    return executeQuery();
  }
);

// Cache operation
const cachedData = await instrumentCacheOperation(
  {
    operation: "hit",
    cacheType: "user",
    key: "user:123",
    userId: "user-123",
    ttl: 3600,
  },
  async () => {
    // Your cache logic here
    return getCachedUser();
  }
);
```

### Advanced Usage

See `examples/custom-instrumentation-example.ts` for comprehensive examples including:

- Complete room creation flow with multiple instrumentation types
- Error handling with automatic error recording
- Integration with existing SimplyCaster services
- Periodic statistics recording

## Metrics Generated

### Room Management Metrics

- `room_operations_total` - Counter of room operations by type and status
- `room_operation_duration_ms` - Histogram of room operation durations
- `room_participant_operations_total` - Counter of participant operations
- `recording_operations_total` - Counter of recording operations
- `active_recordings_total` - Gauge of currently active recordings
- `room_participants_current` - Gauge of current participant count per room
- `room_utilization_percent` - Gauge of room utilization percentage

### WebRTC Metrics

- `webrtc_signaling_operations_total` - Counter of signaling operations
- `webrtc_signaling_duration_ms` - Histogram of signaling operation durations
- `webrtc_ice_candidates_total` - Counter of ICE candidates processed
- `webrtc_connection_operations_total` - Counter of connection operations
- `webrtc_connection_establishment_duration_ms` - Histogram of connection establishment times
- `webrtc_media_operations_total` - Counter of media stream operations
- `webrtc_connection_rtt_ms` - Gauge of connection round-trip time
- `webrtc_connection_packet_loss_percent` - Gauge of packet loss percentage

### Database Metrics

- `db_queries_total` - Counter of database queries by operation and status
- `db_query_duration_ms` - Histogram of query execution times
- `db_transactions_total` - Counter of database transactions
- `db_pool_connections_total` - Gauge of total pool connections
- `db_pool_connections_active` - Gauge of active pool connections
- `db_pool_utilization_percent` - Gauge of connection pool utilization
- `db_slow_queries_total` - Counter of slow queries (>1s)

### Redis Metrics

- `redis_operations_total` - Counter of Redis operations by type and status
- `redis_operation_duration_ms` - Histogram of Redis operation durations
- `redis_cache_requests_total` - Counter of cache requests with hit/miss results
- `cache_operations_total` - Counter of cache operations by type
- `cache_hit_rate_percent` - Gauge of cache hit rate by cache type
- `session_operations_total` - Counter of session operations
- `rate_limit_operations_total` - Counter of rate limiting operations
- `rate_limit_violations_total` - Counter of rate limit violations

## Spans Generated

All instrumentation creates detailed spans with the following attributes:

### Common Attributes

- `component.name` - The component generating the span
- `operation.name` - The specific operation being performed
- `user.id` - User ID when available
- `room.id` - Room ID when applicable

### Operation-Specific Attributes

Each instrumentation type adds relevant attributes such as:

- Room operations: `room.name`, `room.max_participants`, `participant.type`
- WebRTC operations: `webrtc.signaling.type`, `webrtc.ice.candidate_type`, `webrtc.media.type`
- Database operations: `db.statement`, `db.table`, `db.rows_affected`
- Redis operations: `redis.key`, `cache.type`, `session.id`

## Error Handling

All instrumentation automatically handles errors by:

1. Recording error metrics with error type classification
2. Adding exception details to spans
3. Setting appropriate span status codes
4. Allowing the original error to propagate

## Performance Considerations

The instrumentation layer is designed for minimal performance impact:

- Lazy initialization of metric instruments
- Efficient attribute handling with sanitization
- Non-blocking telemetry export
- Graceful degradation when observability is disabled

## Configuration

Instrumentation can be configured through the main observability configuration:

```typescript
import { initializeObservability } from "lib/observability/index.ts";

await initializeObservability({
  otel: {
    enabled: true,
    serviceName: "simplycast",
    serviceVersion: "1.0.0",
  },
  // ... other config options
});
```

## Integration

The instrumentation layer integrates seamlessly with:

- OpenTelemetry automatic instrumentation (Deno runtime)
- Structured logging with trace correlation
- Grafana dashboards for visualization
- Alert rules for monitoring thresholds

## Files

- `room-instrumentation.ts` - Room management instrumentation
- `webrtc-instrumentation.ts` - WebRTC operations instrumentation  
- `database-instrumentation.ts` - Database operations instrumentation
- `redis-instrumentation.ts` - Redis cache instrumentation
- `index.ts` - Main exports and utilities
- `examples/custom-instrumentation-example.ts` - Usage examples