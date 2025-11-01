/**
 * Email Queue Types
 * 
 * Types and interfaces for email queue processing with RabbitMQ
 */

import { EmailMessage, EmailTemplateData, EmailResult } from '../services/email-service.ts';

/**
 * Email queue message types
 */
export enum EmailQueueMessageType {
  SEND_EMAIL = 'send_email',
  SEND_TEMPLATE_EMAIL = 'send_template_email',
  SEND_BULK_EMAIL = 'send_bulk_email',
}

/**
 * Base email queue message
 */
export interface BaseEmailQueueMessage {
  id: string;
  type: EmailQueueMessageType;
  correlationId?: string;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  attempts: number;
  maxAttempts: number;
  metadata?: Record<string, unknown>;
}

/**
 * Send email queue message
 */
export interface SendEmailQueueMessage extends BaseEmailQueueMessage {
  type: EmailQueueMessageType.SEND_EMAIL;
  email: EmailMessage;
}

/**
 * Send template email queue message
 */
export interface SendTemplateEmailQueueMessage extends BaseEmailQueueMessage {
  type: EmailQueueMessageType.SEND_TEMPLATE_EMAIL;
  templateData: EmailTemplateData;
}

/**
 * Send bulk email queue message
 */
export interface SendBulkEmailQueueMessage extends BaseEmailQueueMessage {
  type: EmailQueueMessageType.SEND_BULK_EMAIL;
  emails: EmailMessage[];
}

/**
 * Union type for all email queue messages
 */
export type EmailQueueMessage = 
  | SendEmailQueueMessage 
  | SendTemplateEmailQueueMessage 
  | SendBulkEmailQueueMessage;

/**
 * Email queue processing result
 */
export interface EmailQueueProcessingResult {
  success: boolean;
  messageId?: string;
  error?: string;
  processingTime: number;
  attempts: number;
  shouldRetry: boolean;
  result?: EmailResult | EmailResult[];
}

/**
 * Email queue configuration
 */
export interface EmailQueueConfig {
  /** Whether email queuing is enabled */
  enabled: boolean;
  
  /** Number of concurrent workers processing emails */
  concurrency: number;
  
  /** Maximum number of retry attempts for failed emails */
  maxRetryAttempts: number;
  
  /** Base delay between retries in milliseconds */
  retryDelay: number;
  
  /** Maximum delay between retries in milliseconds */
  maxRetryDelay: number;
  
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;
  
  /** Message TTL in milliseconds */
  messageTtl: number;
  
  /** Maximum queue length */
  maxQueueLength: number;
  
  /** Dead letter queue TTL in milliseconds */
  deadLetterTtl: number;
}

/**
 * Email queue routing keys
 */
export const EMAIL_ROUTING_KEYS = {
  SEND: 'email.send',
  SEND_TEMPLATE: 'email.send.template',
  SEND_BULK: 'email.send.bulk',
  RETRY: 'email.retry',
  FAILED: 'email.failed',
  DEAD_LETTER: 'email.dead_letter',
} as const;

/**
 * Email queue names
 */
export const EMAIL_QUEUE_NAMES = {
  EMAIL: 'email_queue',
  EMAIL_RETRY: 'email_retry_queue',
  EMAIL_DEAD_LETTER: 'email_dead_letter_queue',
} as const;

/**
 * Email exchange name
 */
export const EMAIL_EXCHANGE_NAME = 'simplycast.email';

/**
 * Email queue statistics
 */
export interface EmailQueueStats {
  /** Total messages processed */
  totalProcessed: number;
  
  /** Successfully processed messages */
  successfullyProcessed: number;
  
  /** Failed messages */
  failedMessages: number;
  
  /** Messages currently in queue */
  queueDepth: number;
  
  /** Messages in retry queue */
  retryQueueDepth: number;
  
  /** Messages in dead letter queue */
  deadLetterQueueDepth: number;
  
  /** Average processing time in milliseconds */
  averageProcessingTime: number;
  
  /** Success rate percentage */
  successRate: number;
  
  /** Current worker count */
  activeWorkers: number;
  
  /** Last processed message timestamp */
  lastProcessedAt?: Date;
}

/**
 * Email queue health status
 */
export interface EmailQueueHealth {
  /** Whether the queue is healthy */
  healthy: boolean;
  
  /** Queue connection status */
  connected: boolean;
  
  /** Number of active workers */
  activeWorkers: number;
  
  /** Queue depth */
  queueDepth: number;
  
  /** Error rate in last hour */
  errorRate: number;
  
  /** Last health check timestamp */
  lastCheck: Date;
  
  /** Additional health details */
  details?: Record<string, unknown>;
}