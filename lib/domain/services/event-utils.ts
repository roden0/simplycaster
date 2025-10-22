/**
 * Event Utilities
 * 
 * This module provides utility functions for working with domain events,
 * including ID generation, validation, and serialization.
 */

import {
  DomainEvent,
  EventEnvelope,
  EventValidationResult,
  EventType,
  EventPriority,
} from '../types/events.ts';

/**
 * Generates a unique event ID using crypto.randomUUID()
 */
export function generateEventId(): string {
  return crypto.randomUUID();
}

/**
 * Generates a correlation ID for tracing events across services
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Creates a standardized event envelope from a domain event
 */
export function createEventEnvelope(event: DomainEvent): EventEnvelope {
  return {
    id: event.id,
    type: event.type,
    version: event.version,
    timestamp: event.timestamp.toISOString(),
    correlationId: event.correlationId,
    userId: event.userId,
    sessionId: event.sessionId,
    data: event.data,
    metadata: event.metadata,
  };
}

/**
 * Creates a domain event from an event envelope
 */
export function createDomainEventFromEnvelope(envelope: EventEnvelope): DomainEvent {
  return {
    id: envelope.id,
    type: envelope.type,
    version: envelope.version,
    timestamp: new Date(envelope.timestamp),
    correlationId: envelope.correlationId,
    userId: envelope.userId,
    sessionId: envelope.sessionId,
    data: envelope.data,
    metadata: envelope.metadata,
  };
}

/**
 * Validates a domain event structure
 */
export function validateDomainEvent(event: DomainEvent): EventValidationResult {
  const errors: string[] = [];

  // Validate required fields
  if (!event.id || typeof event.id !== 'string') {
    errors.push('Event ID is required and must be a string');
  }

  if (!event.type || typeof event.type !== 'string') {
    errors.push('Event type is required and must be a string');
  }

  if (!event.version || typeof event.version !== 'string') {
    errors.push('Event version is required and must be a string');
  }

  if (!event.timestamp || !(event.timestamp instanceof Date)) {
    errors.push('Event timestamp is required and must be a Date');
  }

  if (!event.data || typeof event.data !== 'object') {
    errors.push('Event data is required and must be an object');
  }

  // Validate event type format (should be dot notation)
  if (event.type && !event.type.includes('.')) {
    errors.push('Event type should use dot notation (e.g., "room.created")');
  }

  // Validate known event types
  if (event.type && !Object.values(EventType).includes(event.type as EventType)) {
    errors.push(`Unknown event type: ${event.type}`);
  }

  // Validate UUID format for IDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (event.id && !uuidRegex.test(event.id)) {
    errors.push('Event ID must be a valid UUID');
  }

  if (event.correlationId && !uuidRegex.test(event.correlationId)) {
    errors.push('Correlation ID must be a valid UUID');
  }

  if (event.userId && !uuidRegex.test(event.userId)) {
    errors.push('User ID must be a valid UUID');
  }

  // Validate metadata if present
  if (event.metadata) {
    if (typeof event.metadata !== 'object') {
      errors.push('Event metadata must be an object');
    } else {
      if (event.metadata.priority && !['high', 'normal', 'low'].includes(event.metadata.priority as string)) {
        errors.push('Event priority must be "high", "normal", or "low"');
      }

      if (event.metadata.retryCount && (typeof event.metadata.retryCount !== 'number' || event.metadata.retryCount < 0)) {
        errors.push('Retry count must be a non-negative number');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Creates a base domain event with common fields populated
 */
export function createBaseEvent(
  type: EventType,
  data: Record<string, unknown>,
  options: {
    correlationId?: string;
    userId?: string;
    sessionId?: string;
    priority?: EventPriority;
    source?: string;
  } = {}
): DomainEvent {
  return {
    id: generateEventId(),
    type,
    version: '1.0',
    timestamp: new Date(),
    correlationId: options.correlationId,
    userId: options.userId,
    sessionId: options.sessionId,
    data,
    metadata: {
      source: options.source || 'simplycast',
      priority: options.priority || 'normal',
    },
  };
}

/**
 * Serializes a domain event to JSON string
 */
export function serializeEvent(event: DomainEvent): string {
  const envelope = createEventEnvelope(event);
  return JSON.stringify(envelope);
}

/**
 * Deserializes a JSON string to a domain event
 */
export function deserializeEvent(json: string): DomainEvent {
  try {
    const envelope: EventEnvelope = JSON.parse(json);
    return createDomainEventFromEnvelope(envelope);
  } catch (error) {
    throw new Error(`Failed to deserialize event: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Gets the routing key for an event type
 */
export function getRoutingKey(eventType: string): string {
  // Convert event type to routing key
  // e.g., "room.created" -> "rooms.created"
  const [domain, action] = eventType.split('.');
  
  switch (domain) {
    case 'room':
      return `rooms.${action}`;
    case 'recording':
      return `recordings.${action}`;
    case 'user':
      return `users.${action}`;
    case 'auth':
      return `auth.${action}`;
    case 'feed':
      return `feed.${action}`;
    default:
      return eventType; // fallback to original type
  }
}

/**
 * Checks if an event type is retryable
 */
export function isRetryableEvent(eventType: string): boolean {
  // Define which event types should be retried on failure
  const retryableEvents = [
    EventType.ROOM_CREATED,
    EventType.ROOM_CLOSED,
    EventType.RECORDING_STARTED,
    EventType.RECORDING_STOPPED,
    EventType.RECORDING_COMPLETED,
    EventType.USER_JOINED,
    EventType.USER_LEFT,
    EventType.EPISODE_PUBLISHED,
  ];

  return retryableEvents.includes(eventType as EventType);
}

/**
 * Gets the priority for an event type
 */
export function getEventPriority(eventType: string): EventPriority {
  // Define priority levels for different event types
  const highPriorityEvents = [
    EventType.RECORDING_FAILED,
    EventType.USER_LOGIN,
    EventType.USER_LOGOUT,
  ];

  const lowPriorityEvents = [
    EventType.EPISODE_PUBLISHED,
    EventType.EPISODE_UPDATED,
    EventType.EPISODE_DELETED,
  ];

  if (highPriorityEvents.includes(eventType as EventType)) {
    return 'high';
  }

  if (lowPriorityEvents.includes(eventType as EventType)) {
    return 'low';
  }

  return 'normal';
}