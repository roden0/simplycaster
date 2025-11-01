/**
 * RabbitMQ Configuration Factory
 * 
 * This module provides configuration factory functions for RabbitMQ
 * connection and queue topology setup.
 */

import {
  RabbitMQConfig,
  ConnectionOptions,
  PublishOptions,
  QueueConfig,
  CircuitBreakerConfig,
  RetryConfig,
  ExchangeConfig,
  QueueName,
  ExchangeName,
  DEFAULT_ROUTING_PATTERNS,
} from '../../domain/types/rabbitmq-config.ts';
import {
  getRabbitMQUrl,
  getRabbitMQExchange,
  getRabbitMQVHost,
  getConfig,
} from '../../secrets.ts';

/**
 * Creates default RabbitMQ configuration from environment variables and secrets
 */
export async function createRabbitMQConfig(): Promise<RabbitMQConfig> {
  const url = await getRabbitMQUrl();
  const exchange = await getRabbitMQExchange();
  const vhost = await getRabbitMQVHost();

  return {
    url,
    exchange,
    vhost,
    queues: await createDefaultQueues(),
    connectionOptions: await createConnectionOptions(),
    publishOptions: await createPublishOptions(),
    circuitBreaker: await createCircuitBreakerConfig(),
    retry: await createRetryConfig(),
  };
}

/**
 * Creates default connection options from environment variables
 */
async function createConnectionOptions(): Promise<ConnectionOptions> {
  return {
    poolSize: parseInt(await getConfig('RABBITMQ_POOL_SIZE', undefined, '10') || '10'),
    connectionTimeout: parseInt(await getConfig('RABBITMQ_CONNECTION_TIMEOUT', undefined, '30000') || '30000'),
    heartbeat: parseInt(await getConfig('RABBITMQ_HEARTBEAT', undefined, '60') || '60'),
    reconnectAttempts: parseInt(await getConfig('RABBITMQ_RECONNECT_ATTEMPTS', undefined, '5') || '5'),
    reconnectDelay: parseInt(await getConfig('RABBITMQ_RECONNECT_DELAY', undefined, '1000') || '1000'),
    maxReconnectDelay: parseInt(await getConfig('RABBITMQ_MAX_RECONNECT_DELAY', undefined, '30000') || '30000'),
  };
}

/**
 * Creates default publish options from environment variables
 */
async function createPublishOptions(): Promise<PublishOptions> {
  return {
    confirmTimeout: parseInt(await getConfig('RABBITMQ_CONFIRM_TIMEOUT', undefined, '5000') || '5000'),
    mandatory: (await getConfig('RABBITMQ_MANDATORY', undefined, 'true')) === 'true',
    persistent: (await getConfig('RABBITMQ_PERSISTENT', undefined, 'true')) === 'true',
    messageTtl: parseInt(await getConfig('RABBITMQ_MESSAGE_TTL', undefined, '86400000') || '86400000'), // 24 hours
    priority: parseInt(await getConfig('RABBITMQ_DEFAULT_PRIORITY', undefined, '0') || '0'),
  };
}

/**
 * Creates circuit breaker configuration from environment variables
 */
async function createCircuitBreakerConfig(): Promise<CircuitBreakerConfig> {
  return {
    failureThreshold: parseInt(await getConfig('RABBITMQ_FAILURE_THRESHOLD', undefined, '5') || '5'),
    resetTimeout: parseInt(await getConfig('RABBITMQ_RESET_TIMEOUT', undefined, '60000') || '60000'),
    monitoringWindow: parseInt(await getConfig('RABBITMQ_MONITORING_WINDOW', undefined, '60000') || '60000'),
    expectedFailureRate: parseFloat(await getConfig('RABBITMQ_EXPECTED_FAILURE_RATE', undefined, '0.1') || '0.1'),
  };
}

/**
 * Creates retry configuration from environment variables
 */
async function createRetryConfig(): Promise<RetryConfig> {
  const retryableErrorsStr = await getConfig('RABBITMQ_RETRYABLE_ERRORS', undefined, 'ECONNRESET,ENOTFOUND,ETIMEDOUT,ECONNREFUSED');
  const retryableErrors = retryableErrorsStr?.split(',').map(e => e.trim()) || [];

  return {
    maxAttempts: parseInt(await getConfig('RABBITMQ_MAX_RETRIES', undefined, '3') || '3'),
    baseDelay: parseInt(await getConfig('RABBITMQ_RETRY_DELAY', undefined, '1000') || '1000'),
    maxDelay: parseInt(await getConfig('RABBITMQ_MAX_RETRY_DELAY', undefined, '30000') || '30000'),
    backoffMultiplier: parseFloat(await getConfig('RABBITMQ_BACKOFF_MULTIPLIER', undefined, '2.0') || '2.0'),
    retryableErrors,
  };
}

/**
 * Creates default queue configurations
 */
async function createDefaultQueues(): Promise<QueueConfig[]> {
  const messageTtl = parseInt(await getConfig('RABBITMQ_MESSAGE_TTL', undefined, '86400000') || '86400000'); // 24 hours
  const maxLength = parseInt(await getConfig('RABBITMQ_MAX_QUEUE_LENGTH', undefined, '10000') || '10000');
  const deadLetterExchange = await getConfig('RABBITMQ_DLX_EXCHANGE', undefined, ExchangeName.DEAD_LETTER) || ExchangeName.DEAD_LETTER;

  return [
    {
      name: QueueName.ROOMS,
      routingKey: DEFAULT_ROUTING_PATTERNS.rooms,
      options: {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': messageTtl,
          'x-max-length': maxLength,
          'x-dead-letter-exchange': deadLetterExchange,
          'x-dead-letter-routing-key': 'failed.rooms',
        },
      },
      deadLetterQueue: {
        exchange: deadLetterExchange,
        queueName: `${QueueName.ROOMS}_dlq`,
        routingKey: 'failed.rooms',
        messageTtl: messageTtl * 7, // 7 days for DLQ
      },
    },
    {
      name: QueueName.RECORDINGS,
      routingKey: DEFAULT_ROUTING_PATTERNS.recordings,
      options: {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': messageTtl,
          'x-max-length': maxLength,
          'x-dead-letter-exchange': deadLetterExchange,
          'x-dead-letter-routing-key': 'failed.recordings',
        },
      },
      deadLetterQueue: {
        exchange: deadLetterExchange,
        queueName: `${QueueName.RECORDINGS}_dlq`,
        routingKey: 'failed.recordings',
        messageTtl: messageTtl * 7,
      },
    },
    {
      name: QueueName.USERS,
      routingKey: DEFAULT_ROUTING_PATTERNS.users,
      options: {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': messageTtl,
          'x-max-length': maxLength,
          'x-dead-letter-exchange': deadLetterExchange,
          'x-dead-letter-routing-key': 'failed.users',
        },
      },
      deadLetterQueue: {
        exchange: deadLetterExchange,
        queueName: `${QueueName.USERS}_dlq`,
        routingKey: 'failed.users',
        messageTtl: messageTtl * 7,
      },
    },
    {
      name: QueueName.FEED,
      routingKey: DEFAULT_ROUTING_PATTERNS.feed,
      options: {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': messageTtl,
          'x-max-length': maxLength,
          'x-dead-letter-exchange': deadLetterExchange,
          'x-dead-letter-routing-key': 'failed.feed',
        },
      },
      deadLetterQueue: {
        exchange: deadLetterExchange,
        queueName: `${QueueName.FEED}_dlq`,
        routingKey: 'failed.feed',
        messageTtl: messageTtl * 7,
      },
    },
    {
      name: QueueName.EMAIL,
      routingKey: 'email.send',
      options: {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': messageTtl,
          'x-max-length': maxLength,
          'x-dead-letter-exchange': deadLetterExchange,
          'x-dead-letter-routing-key': 'failed.email',
          'x-max-priority': 10, // Support priority queuing for emails
        },
      },
      deadLetterQueue: {
        exchange: deadLetterExchange,
        queueName: `${QueueName.EMAIL}_dlq`,
        routingKey: 'failed.email',
        messageTtl: messageTtl * 7,
      },
    },
    {
      name: QueueName.EMAIL_RETRY,
      routingKey: 'email.retry',
      options: {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': messageTtl,
          'x-max-length': maxLength,
          'x-dead-letter-exchange': deadLetterExchange,
          'x-dead-letter-routing-key': 'failed.email.retry',
          'x-max-priority': 10,
        },
      },
      deadLetterQueue: {
        exchange: deadLetterExchange,
        queueName: `${QueueName.EMAIL_RETRY}_dlq`,
        routingKey: 'failed.email.retry',
        messageTtl: messageTtl * 7,
      },
    },
    {
      name: QueueName.EMAIL_DEAD_LETTER,
      routingKey: 'email.dead_letter',
      options: {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': messageTtl * 30, // 30 days for email DLQ
          'x-max-length': maxLength,
        },
      },
    },
    {
      name: QueueName.DEAD_LETTER,
      routingKey: DEFAULT_ROUTING_PATTERNS.deadLetter,
      options: {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': messageTtl * 7, // 7 days for DLQ
          'x-max-length': maxLength * 2, // Larger capacity for DLQ
        },
      },
    },
  ];
}

/**
 * Creates default exchange configurations
 */
export async function createDefaultExchanges(): Promise<ExchangeConfig[]> {
  return [
    {
      name: await getRabbitMQExchange(),
      type: 'topic',
      durable: true,
      autoDelete: false,
    },
    {
      name: ExchangeName.EMAIL,
      type: 'topic',
      durable: true,
      autoDelete: false,
    },
    {
      name: ExchangeName.DEAD_LETTER,
      type: 'topic',
      durable: true,
      autoDelete: false,
    },
  ];
}

/**
 * Parse RabbitMQ configuration from environment variables and secrets
 * This is a convenience function that wraps createRabbitMQConfig for synchronous usage
 */
export function parseRabbitMQConfig(): Promise<RabbitMQConfig> {
  return createRabbitMQConfig();
}

/**
 * Environment variable names for RabbitMQ configuration
 */
export const RABBITMQ_ENV_VARS = {
  // Connection
  URL: 'RABBITMQ_URL',
  EXCHANGE: 'RABBITMQ_EXCHANGE',
  VHOST: 'RABBITMQ_VHOST',
  
  // Connection Pool
  POOL_SIZE: 'RABBITMQ_POOL_SIZE',
  CONNECTION_TIMEOUT: 'RABBITMQ_CONNECTION_TIMEOUT',
  HEARTBEAT: 'RABBITMQ_HEARTBEAT',
  
  // Reconnection
  RECONNECT_ATTEMPTS: 'RABBITMQ_RECONNECT_ATTEMPTS',
  RECONNECT_DELAY: 'RABBITMQ_RECONNECT_DELAY',
  MAX_RECONNECT_DELAY: 'RABBITMQ_MAX_RECONNECT_DELAY',
  
  // Publishing
  CONFIRM_TIMEOUT: 'RABBITMQ_CONFIRM_TIMEOUT',
  MANDATORY: 'RABBITMQ_MANDATORY',
  PERSISTENT: 'RABBITMQ_PERSISTENT',
  MESSAGE_TTL: 'RABBITMQ_MESSAGE_TTL',
  DEFAULT_PRIORITY: 'RABBITMQ_DEFAULT_PRIORITY',
  
  // Circuit Breaker
  FAILURE_THRESHOLD: 'RABBITMQ_FAILURE_THRESHOLD',
  RESET_TIMEOUT: 'RABBITMQ_RESET_TIMEOUT',
  MONITORING_WINDOW: 'RABBITMQ_MONITORING_WINDOW',
  EXPECTED_FAILURE_RATE: 'RABBITMQ_EXPECTED_FAILURE_RATE',
  
  // Retry
  MAX_RETRIES: 'RABBITMQ_MAX_RETRIES',
  RETRY_DELAY: 'RABBITMQ_RETRY_DELAY',
  MAX_RETRY_DELAY: 'RABBITMQ_MAX_RETRY_DELAY',
  BACKOFF_MULTIPLIER: 'RABBITMQ_BACKOFF_MULTIPLIER',
  RETRYABLE_ERRORS: 'RABBITMQ_RETRYABLE_ERRORS',
  
  // Queue Configuration
  MAX_QUEUE_LENGTH: 'RABBITMQ_MAX_QUEUE_LENGTH',
  DLX_EXCHANGE: 'RABBITMQ_DLX_EXCHANGE',
} as const;