# RabbitMQ Domain Events Infrastructure

This directory contains the RabbitMQ infrastructure components for the domain events system.

## Files

- `rabbitmq-config.ts` - Configuration factory for RabbitMQ connection and queue topology
- `rabbitmq-connection-manager.ts` - Connection management and pooling (to be implemented)
- `rabbitmq-event-publisher.ts` - Event publisher implementation (to be implemented)
- `rabbitmq-circuit-breaker.ts` - Circuit breaker for resilience (to be implemented)

## Configuration

The RabbitMQ configuration is loaded from environment variables and Docker secrets. See `.env.example` for all available configuration options.

### Required Environment Variables

- `RABBITMQ_URL` - RabbitMQ connection URL (default: `amqp://localhost:5672`)
- `RABBITMQ_EXCHANGE` - Main topic exchange name (default: `simplycast.events`)

### Optional Environment Variables

See `.env.example` for the complete list of optional configuration variables for connection pooling, retry logic, circuit breaker settings, and queue configuration.

## Queue Topology

The system uses a topic exchange with the following queues:

- `rooms_queue` - Room-related events (routing key: `rooms.*`)
- `recordings_queue` - Recording-related events (routing key: `recordings.*`)
- `users_queue` - User-related events (routing key: `users.*`)
- `feed_queue` - Feed/episode-related events (routing key: `feed.*`)
- `dead_letter_queue` - Failed events (routing key: `failed.*`)

Each queue has a corresponding dead letter queue for handling failed message processing.

## Usage

```typescript
import { createRabbitMQConfig } from './rabbitmq-config.ts';

// Create configuration
const config = await createRabbitMQConfig();

// Use with event publisher (to be implemented)
const publisher = new RabbitMQEventPublisher(config);
```

## Docker Setup

To run RabbitMQ locally with Docker:

```bash
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=admin \
  -e RABBITMQ_DEFAULT_PASS=admin \
  rabbitmq:3-management
```

The management UI will be available at http://localhost:15672 (admin/admin).