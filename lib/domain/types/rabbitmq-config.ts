/**
 * RabbitMQ Configuration Types
 * 
 * This module defines configuration interfaces for RabbitMQ connection,
 * queue topology, and publishing options.
 */

/**
 * RabbitMQ connection configuration
 */
export interface RabbitMQConfig {
  /** RabbitMQ connection URL (amqp://user:password@host:port/vhost) */
  url: string;
  
  /** Main topic exchange name for event routing */
  exchange: string;
  
  /** Virtual host (optional, defaults to /) */
  vhost?: string;
  
  /** Queue configurations */
  queues: QueueConfig[];
  
  /** Connection options */
  connectionOptions: ConnectionOptions;
  
  /** Publishing options */
  publishOptions: PublishOptions;
  
  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfig;
  
  /** Retry configuration */
  retry: RetryConfig;
}

/**
 * RabbitMQ connection options
 */
export interface ConnectionOptions {
  /** Connection pool size */
  poolSize: number;
  
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
  
  /** Heartbeat interval in seconds */
  heartbeat: number;
  
  /** Reconnection attempts */
  reconnectAttempts: number;
  
  /** Reconnection delay in milliseconds */
  reconnectDelay: number;
  
  /** Maximum reconnection delay in milliseconds */
  maxReconnectDelay: number;
}

/**
 * Message publishing options
 */
export interface PublishOptions {
  /** Confirm timeout in milliseconds */
  confirmTimeout: number;
  
  /** Whether messages should be mandatory (return if unroutable) */
  mandatory: boolean;
  
  /** Whether messages should be persistent */
  persistent: boolean;
  
  /** Default message TTL in milliseconds */
  messageTtl?: number;
  
  /** Default message priority */
  priority?: number;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** Queue name */
  name: string;
  
  /** Routing key pattern for binding to exchange */
  routingKey: string;
  
  /** Queue options */
  options: QueueOptions;
  
  /** Dead letter queue configuration */
  deadLetterQueue?: DeadLetterQueueConfig;
}

/**
 * Queue creation and binding options
 */
export interface QueueOptions {
  /** Whether the queue should survive broker restarts */
  durable: boolean;
  
  /** Whether the queue should be exclusive to this connection */
  exclusive: boolean;
  
  /** Whether the queue should be auto-deleted when not in use */
  autoDelete: boolean;
  
  /** Additional queue arguments */
  arguments: QueueArguments;
}

/**
 * Queue arguments for advanced configuration
 */
export interface QueueArguments {
  /** Message TTL in milliseconds */
  'x-message-ttl'?: number;
  
  /** Maximum queue length */
  'x-max-length'?: number;
  
  /** Maximum queue size in bytes */
  'x-max-length-bytes'?: number;
  
  /** Queue TTL in milliseconds */
  'x-expires'?: number;
  
  /** Dead letter exchange */
  'x-dead-letter-exchange'?: string;
  
  /** Dead letter routing key */
  'x-dead-letter-routing-key'?: string;
  
  /** Queue priority */
  'x-max-priority'?: number;
  
  /** Additional custom arguments */
  [key: string]: unknown;
}

/**
 * Dead letter queue configuration
 */
export interface DeadLetterQueueConfig {
  /** Dead letter exchange name */
  exchange: string;
  
  /** Dead letter queue name */
  queueName: string;
  
  /** Dead letter routing key */
  routingKey: string;
  
  /** TTL for messages in dead letter queue */
  messageTtl?: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  
  /** Time to wait before attempting reset (milliseconds) */
  resetTimeout: number;
  
  /** Monitoring window for failure counting (milliseconds) */
  monitoringWindow: number;
  
  /** Expected failure rate threshold (0-1) */
  expectedFailureRate: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  
  /** Base delay between retries (milliseconds) */
  baseDelay: number;
  
  /** Maximum delay between retries (milliseconds) */
  maxDelay: number;
  
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;
  
  /** List of error types that should trigger retries */
  retryableErrors: string[];
}

/**
 * Exchange configuration
 */
export interface ExchangeConfig {
  /** Exchange name */
  name: string;
  
  /** Exchange type (topic, direct, fanout, headers) */
  type: 'topic' | 'direct' | 'fanout' | 'headers';
  
  /** Whether the exchange should survive broker restarts */
  durable: boolean;
  
  /** Whether the exchange should be auto-deleted when not in use */
  autoDelete: boolean;
  
  /** Additional exchange arguments */
  arguments?: Record<string, unknown>;
}

/**
 * Routing key patterns for different event types
 */
export interface RoutingKeyPatterns {
  /** Room events routing pattern */
  rooms: string;
  
  /** Recording events routing pattern */
  recordings: string;
  
  /** User events routing pattern */
  users: string;
  
  /** Authentication events routing pattern */
  auth: string;
  
  /** Feed events routing pattern */
  feed: string;
  
  /** Email events routing pattern */
  email: string;
  
  /** Dead letter routing pattern */
  deadLetter: string;
}

/**
 * Default routing key patterns
 */
export const DEFAULT_ROUTING_PATTERNS: RoutingKeyPatterns = {
  rooms: 'rooms.*',
  recordings: 'recordings.*',
  users: 'users.*',
  auth: 'auth.*',
  feed: 'feed.*',
  email: 'email.*',
  deadLetter: 'failed.*',
};

/**
 * Queue names enumeration
 */
export enum QueueName {
  ROOMS = 'rooms_queue',
  RECORDINGS = 'recordings_queue',
  USERS = 'users_queue',
  FEED = 'feed_queue',
  EMAIL = 'email_queue',
  EMAIL_RETRY = 'email_retry_queue',
  EMAIL_DEAD_LETTER = 'email_dead_letter_queue',
  DEAD_LETTER = 'dead_letter_queue',
}

/**
 * Exchange names enumeration
 */
export enum ExchangeName {
  MAIN = 'simplycast.events',
  EMAIL = 'simplycast.email',
  DEAD_LETTER = 'simplycast.dlx',
}

/**
 * RabbitMQ connection state
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  CLOSING = 'closing',
  CLOSED = 'closed',
}

/**
 * Publishing result
 */
export interface PublishResult {
  /** Whether the publish was successful */
  success: boolean;
  
  /** Error message if publish failed */
  error?: string;
  
  /** Message ID if successful */
  messageId?: string;
  
  /** Timestamp of publish attempt */
  timestamp: Date;
}

/**
 * Connection health status
 */
export interface ConnectionHealth {
  /** Whether the connection is healthy */
  isHealthy: boolean;
  
  /** Current connection state */
  state: ConnectionState;
  
  /** Last successful operation timestamp */
  lastSuccessfulOperation?: Date;
  
  /** Number of failed operations */
  failedOperations: number;
  
  /** Additional health details */
  details?: Record<string, unknown>;
}