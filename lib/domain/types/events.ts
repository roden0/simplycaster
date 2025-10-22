/**
 * Domain Events - Core interfaces and types for event-driven architecture
 * 
 * This module defines the standardized event schema and base types for
 * publishing domain events to RabbitMQ queues.
 */

/**
 * Base domain event interface following the standardized event envelope
 * All domain events must implement this interface
 */
export interface DomainEvent {
  /** Unique event identifier (UUID) */
  id: string;
  
  /** Event type in dot notation (e.g., 'room.created', 'recording.started') */
  type: string;
  
  /** Schema version for backward compatibility */
  version: string;
  
  /** ISO 8601 timestamp when the event occurred */
  timestamp: Date;
  
  /** Correlation ID for tracing across services */
  correlationId?: string;
  
  /** ID of the user who triggered the event */
  userId?: string;
  
  /** Session ID for user session tracking */
  sessionId?: string;
  
  /** Event payload data */
  data: Record<string, unknown>;
  
  /** Additional metadata */
  metadata?: EventMetadata;
}

/**
 * Event metadata for additional context and processing information
 */
export interface EventMetadata {
  /** Source service that generated the event */
  source: string;
  
  /** Event priority level */
  priority: EventPriority;
  
  /** Retry count for failed processing */
  retryCount?: number;
  
  /** Original timestamp if this is a retry */
  originalTimestamp?: string;
  
  /** Additional custom metadata */
  [key: string]: unknown;
}

/**
 * Event priority levels for processing and routing
 */
export type EventPriority = 'high' | 'normal' | 'low';

/**
 * Event types enumeration for type safety
 */
export enum EventType {
  // Room events
  ROOM_CREATED = 'room.created',
  ROOM_CLOSED = 'room.closed',
  ROOM_UPDATED = 'room.updated',
  
  // Recording events
  RECORDING_STARTED = 'recording.started',
  RECORDING_STOPPED = 'recording.stopped',
  RECORDING_COMPLETED = 'recording.completed',
  RECORDING_FAILED = 'recording.failed',
  
  // User events
  USER_JOINED = 'user.joined',
  USER_LEFT = 'user.left',
  USER_KICKED = 'user.kicked',
  
  // Authentication events
  USER_LOGIN = 'auth.login',
  USER_LOGOUT = 'auth.logout',
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  
  // Feed events
  EPISODE_PUBLISHED = 'feed.published',
  EPISODE_UPDATED = 'feed.updated',
  EPISODE_DELETED = 'feed.deleted',
}

/**
 * Base event data interfaces for specific event types
 */

export interface RoomEventData extends Record<string, unknown> {
  roomId: string;
  roomName: string;
  hostId: string;
  maxParticipants?: number;
  allowVideo?: boolean;
}

export interface RecordingEventData extends Record<string, unknown> {
  recordingId: string;
  roomId: string;
  folderName: string;
  participantCount?: number;
  durationSeconds?: number;
  totalSizeBytes?: number;
}

export interface UserEventData extends Record<string, unknown> {
  userId?: string;
  roomId: string;
  displayName: string;
  participantType: 'host' | 'guest';
  email?: string;
}

export interface AuthEventData extends Record<string, unknown> {
  userId: string;
  email: string;
  role: 'admin' | 'host' | 'guest';
  sessionId?: string;
  ipAddress?: string;
}

export interface FeedEventData extends Record<string, unknown> {
  episodeId: string;
  title: string;
  slug: string;
  audioFilePath: string;
  durationSeconds: number;
  audioSizeBytes: number;
  publishedAt?: Date;
}

/**
 * Typed domain events for specific business events
 */

export interface RoomCreatedEvent extends DomainEvent {
  type: EventType.ROOM_CREATED;
  data: RoomEventData;
}

export interface RoomClosedEvent extends DomainEvent {
  type: EventType.ROOM_CLOSED;
  data: RoomEventData;
}

export interface RecordingStartedEvent extends DomainEvent {
  type: EventType.RECORDING_STARTED;
  data: RecordingEventData;
}

export interface RecordingStoppedEvent extends DomainEvent {
  type: EventType.RECORDING_STOPPED;
  data: RecordingEventData;
}

export interface UserJoinedEvent extends DomainEvent {
  type: EventType.USER_JOINED;
  data: UserEventData;
}

export interface UserLeftEvent extends DomainEvent {
  type: EventType.USER_LEFT;
  data: UserEventData;
}

export interface UserKickedEvent extends DomainEvent {
  type: EventType.USER_KICKED;
  data: UserEventData;
}

export interface UserLoginEvent extends DomainEvent {
  type: EventType.USER_LOGIN;
  data: AuthEventData;
}

export interface UserLogoutEvent extends DomainEvent {
  type: EventType.USER_LOGOUT;
  data: AuthEventData;
}

export interface EpisodePublishedEvent extends DomainEvent {
  type: EventType.EPISODE_PUBLISHED;
  data: FeedEventData;
}

/**
 * Union type of all domain events for type safety
 */
export type DomainEventUnion = 
  | RoomCreatedEvent
  | RoomClosedEvent
  | RecordingStartedEvent
  | RecordingStoppedEvent
  | UserJoinedEvent
  | UserLeftEvent
  | UserKickedEvent
  | UserLoginEvent
  | UserLogoutEvent
  | EpisodePublishedEvent;

/**
 * Event envelope for serialization/deserialization
 */
export interface EventEnvelope {
  id: string;
  type: string;
  version: string;
  timestamp: string; // ISO 8601 string for JSON serialization
  correlationId?: string;
  userId?: string;
  sessionId?: string;
  data: Record<string, unknown>;
  metadata?: EventMetadata;
}

/**
 * Event validation result
 */
export interface EventValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Event publisher interface
 */
export interface EventPublisher {
  /**
   * Publish a single domain event
   */
  publish(event: DomainEvent): Promise<void>;
  
  /**
   * Publish multiple events in a batch
   */
  publishBatch(events: DomainEvent[]): Promise<void>;
  
  /**
   * Close the publisher and cleanup resources
   */
  close(): Promise<void>;
  
  /**
   * Check if the publisher is healthy and connected
   */
  isHealthy(): Promise<boolean>;
}