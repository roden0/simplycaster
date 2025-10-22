# RabbitMQ Asynchronous Event Publishing

This document describes the asynchronous event publishing system implemented for SimplyCaster's RabbitMQ domain events.

## Overview

The asynchronous event publishing system provides:

1. **Non-blocking event publishing** with Promise handling
2. **Event queuing** for batch publishing
3. **Background processing** for event buffer management
4. **Local event buffering** for RabbitMQ outages
5. **Automatic buffer flushing** when connection recovers

## Components

### RabbitMQAsyncEventPublisher

The main async event publisher that extends the base event publisher with:

- **Asynchronous publishing**: Events are published without blocking the main thread
- **Concurrency control**: Limits the number of concurrent publish operations
- **Priority handling**: High priority events are published immediately
- **Queue management**: Normal/low priority events are queued for batch processing
- **Background processing**: Automatic processing of queued events
- **Connection monitoring**: Detects RabbitMQ availability and manages buffer accordingly

### RabbitMQEventBuffer

A local event buffer that handles RabbitMQ outages:

- **In-memory buffering**: Stores events when RabbitMQ is unavailable
- **Size limits**: Prevents memory overflow with configurable limits
- **Event aging**: Automatically removes old events
- **Priority ordering**: High priority events are flushed first
- **Persistence**: Optional persistent storage for buffer durability
- **Automatic cleanup**: Removes expired events periodically

## Configuration

### AsyncPublishConfig

```typescript
interface AsyncPublishConfig {
  maxBufferSize: number;           // Max events in memory queue
  flushInterval: number;           // Queue flush interval (ms)
  maxConcurrency: number;          // Max concurrent operations
  enableBackgroundProcessing: boolean; // Enable background processing
  batchSize: number;               // Background processing batch size
  publishTimeout: number;          // Operation timeout (ms)
  bufferConfig?: EventBufferConfig; // Buffer configuration
}
```

### EventBufferConfig

```typescript
interface EventBufferConfig {
  maxBufferSize: number;           // Max buffered events
  maxEventAge: number;             // Max event age (ms)
  enablePersistence: boolean;      // Enable persistent storage
  persistentStoragePath?: string;  // Storage file path
  cleanupInterval: number;         // Cleanup interval (ms)
  maxPersistentSize: number;       // Max storage size (bytes)
  flushBatchSize: number;          // Flush batch size
}
```

## Usage Examples

### Basic Usage

```typescript
import { createRabbitMQAsyncEventPublisher } from './rabbitmq-async-event-publisher.ts';

// Create async publisher
const publisher = await createRabbitMQAsyncEventPublisher(rabbitMQConfig, {
  maxConcurrency: 10,
  enableBackgroundProcessing: true,
  bufferConfig: {
    maxBufferSize: 5000,
    enablePersistence: true,
  },
});

// Publish high priority event (immediate)
await publisher.publish({
  id: crypto.randomUUID(),
  type: 'recording.failed',
  version: '1.0',
  timestamp: new Date(),
  data: { recordingId: '123', error: 'Storage failure' },
  metadata: { source: 'simplycast', priority: 'high' },
});

// Publish batch (queued for processing)
await publisher.publishBatch(events);
```

### Container Integration

```typescript
// Register in container
container.register('asyncEventPublisher', async () => {
  const config = await parseRabbitMQConfig();
  return await createRabbitMQAsyncEventPublisher(config, asyncConfig);
});

// Use in use cases
const publisher = await container.get<EventPublisher>('asyncEventPublisher');
await publisher.publish(event);
```

### Monitoring and Statistics

```typescript
// Get publisher statistics
const stats = await publisher.getStats();
console.log({
  publishedEvents: stats.publishedEvents,
  failedEvents: stats.failedEvents,
  bufferStats: stats.bufferStats,
  isRabbitMQAvailable: stats.isRabbitMQAvailable,
});

// Check health
const health = await publisher.getHealth();
console.log('Publisher healthy:', health.healthy);

// Monitor buffer
const bufferStats = publisher.getEventBuffer().getStats();
console.log('Buffer utilization:', bufferStats.utilizationPercent + '%');
```

## Event Flow

### Normal Operation (RabbitMQ Available)

1. **High Priority Events**: Published immediately
2. **Normal/Low Priority Events**: Queued for batch processing
3. **Background Processing**: Processes queued events in batches
4. **Concurrency Control**: Limits concurrent operations

### Outage Handling (RabbitMQ Unavailable)

1. **Event Buffering**: All events are buffered locally
2. **Connection Monitoring**: Periodically checks RabbitMQ availability
3. **Automatic Recovery**: Flushes buffer when connection recovers
4. **Persistence**: Optionally persists buffer to disk

## Priority Handling

- **High Priority**: Published immediately, bypassing queue
- **Normal Priority**: Queued for batch processing
- **Low Priority**: Queued with lowest precedence

## Error Handling

### Retry Logic

- Failed events are retried with exponential backoff
- After max retries, events are buffered or sent to DLQ
- Retriable vs non-retriable errors are classified

### Circuit Breaker

- Opens circuit after failure threshold
- Provides fallback to local buffering
- Automatically attempts recovery

### Dead Letter Queue

- Events that exceed max retries are sent to DLQ
- Includes failure metadata and retry count
- Enables manual inspection and reprocessing

## Performance Considerations

### Memory Usage

- Configure `maxBufferSize` based on available memory
- Monitor buffer utilization percentage
- Enable persistence for large buffers

### Concurrency

- Set `maxConcurrency` based on RabbitMQ capacity
- Higher concurrency = faster processing but more resources
- Monitor active operations count

### Batch Processing

- Larger batches = better throughput but higher latency
- Smaller batches = lower latency but more overhead
- Tune `batchSize` based on event volume

## Environment Variables

```bash
# Async Publishing Configuration
RABBITMQ_ASYNC_BUFFER_SIZE=1000
RABBITMQ_ASYNC_FLUSH_INTERVAL=5000
RABBITMQ_ASYNC_MAX_CONCURRENCY=10
RABBITMQ_ASYNC_BACKGROUND_PROCESSING=true
RABBITMQ_ASYNC_BATCH_SIZE=50
RABBITMQ_ASYNC_PUBLISH_TIMEOUT=30000

# Buffer Configuration
RABBITMQ_BUFFER_MAX_SIZE=10000
RABBITMQ_BUFFER_MAX_AGE=3600000
RABBITMQ_BUFFER_PERSISTENCE=true
RABBITMQ_BUFFER_STORAGE_PATH=./data/event-buffer.json
RABBITMQ_BUFFER_CLEANUP_INTERVAL=300000
RABBITMQ_BUFFER_MAX_PERSISTENT_SIZE=52428800
RABBITMQ_BUFFER_FLUSH_BATCH_SIZE=100
```

## Best Practices

### Configuration

1. **Size Limits**: Set appropriate buffer sizes based on memory
2. **Timeouts**: Configure reasonable timeouts for operations
3. **Persistence**: Enable for critical events that must not be lost
4. **Cleanup**: Set appropriate cleanup intervals

### Monitoring

1. **Statistics**: Regularly check publisher statistics
2. **Health Checks**: Monitor connection health
3. **Buffer Utilization**: Watch buffer usage patterns
4. **Error Rates**: Track failure rates and patterns

### Error Handling

1. **Graceful Degradation**: Use buffering during outages
2. **Retry Strategy**: Configure appropriate retry limits
3. **Dead Letter Handling**: Monitor and process DLQ events
4. **Alerting**: Set up alerts for high error rates

### Shutdown

1. **Graceful Shutdown**: Always call `close()` method
2. **Buffer Flushing**: Ensure buffer is flushed before shutdown
3. **Active Operations**: Wait for active operations to complete
4. **Resource Cleanup**: Clean up timers and connections

## Troubleshooting

### High Memory Usage

- Check buffer size configuration
- Monitor buffer utilization
- Enable buffer cleanup
- Consider reducing max event age

### Slow Publishing

- Increase concurrency limits
- Check RabbitMQ connection health
- Monitor batch processing performance
- Tune flush intervals

### Lost Events

- Enable buffer persistence
- Check DLQ for failed events
- Monitor retry configurations
- Verify graceful shutdown procedures

### Connection Issues

- Monitor connection health checks
- Check circuit breaker status
- Verify RabbitMQ availability
- Review connection configuration