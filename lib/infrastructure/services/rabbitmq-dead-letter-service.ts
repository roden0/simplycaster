/**
 * RabbitMQ Dead Letter Queue Service
 * 
 * Handles failed event routing to dead letter queues with failure metadata
 * enrichment and dead letter exchange topology management.
 */

import type { ChannelWrapper } from 'amqp-connection-manager';
import { DomainEvent, EventEnvelope } from '../../domain/types/events.ts';
import { RabbitMQConfig } from '../../domain/types/rabbitmq-config.ts';
import { RabbitMQConnectionManager } from './rabbitmq-connection-manager.ts';

/**
 * Dead letter queue configuration
 */
export interface DeadLetterConfig {
  /** Dead letter exchange name */
  exchangeName: string;
  
  /** Dead letter queue name */
  queueName: string;
  
  /** Routing key for dead letter messages */
  routingKey: string;
  
  /** TTL for messages in dead letter queue (milliseconds) */
  messageTtl: number;
  
  /** Maximum number of messages in dead letter queue */
  maxLength: number;
  
  /** Whether to enable dead letter queue persistence */
  durable: boolean;
}

/**
 * Default dead letter configuration
 */
export const DEFAULT_DEAD_LETTER_CONFIG: DeadLetterConfig = {
  exchangeName: 'simplycast.dlx',
  queueName: 'simplycast.dead_letters',
  routingKey: 'failed',
  messageTtl: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxLength: 10000,
  durable: true,
};

/**
 * Dead letter event metadata
 */
export interface DeadLetterMetadata {
  /** Original event that failed */
  originalEvent: DomainEvent;
  
  /** Failure reason */
  failureReason: string;
  
  /** Error stack trace */
  errorStack?: string;
  
  /** Number of retry attempts made */
  retryAttempts: number;
  
  /** Timestamp when event was sent to DLQ */
  deadLetterTimestamp: string;
  
  /** Original queue/routing key where event failed */
  originalQueue?: string;
  
  /** Original routing key */
  originalRoutingKey: string;
  
  /** Total processing time before failure */
  processingTimeMs: number;
  
  /** Additional failure context */
  failureContext?: Record<string, unknown>;
}

/**
 * Dead letter event envelope
 */
export interface DeadLetterEvent extends EventEnvelope {
  /** Dead letter specific metadata */
  deadLetterMetadata: DeadLetterMetadata;
}

/**
 * Dead letter statistics
 */
export interface DeadLetterStats {
  totalDeadLetters: number;
  deadLettersByType: Record<string, number>;
  deadLettersByReason: Record<string, number>;
  averageRetryAttempts: number;
  oldestDeadLetter?: Date;
  newestDeadLetter?: Date;
}

/**
 * RabbitMQ Dead Letter Queue Service
 */
export class RabbitMQDeadLetterService {
  private connectionManager: RabbitMQConnectionManager;
  private deadLetterStats: DeadLetterStats = {
    totalDeadLetters: 0,
    deadLettersByType: {},
    deadLettersByReason: {},
    averageRetryAttempts: 0,
  };

  constructor(
    private rabbitMQConfig: RabbitMQConfig,
    private deadLetterConfig: DeadLetterConfig = DEFAULT_DEAD_LETTER_CONFIG
  ) {
    this.connectionManager = new RabbitMQConnectionManager(rabbitMQConfig);
  }

  /**
   * Initialize dead letter service and setup topology
   */
  async initialize(): Promise<void> {
    await this.connectionManager.connect();
    await this.setupDeadLetterTopology();
    console.log('✅ Dead letter service initialized');
  }

  /**
   * Setup dead letter exchange and queue topology
   */
  private async setupDeadLetterTopology(): Promise<void> {
    const channel = this.connectionManager.getPublishChannel();

    try {
      // Declare dead letter exchange
      await channel.assertExchange(
        this.deadLetterConfig.exchangeName,
        'topic',
        {
          durable: this.deadLetterConfig.durable,
          autoDelete: false,
        }
      );

      // Declare dead letter queue
      await channel.assertQueue(
        this.deadLetterConfig.queueName,
        {
          durable: this.deadLetterConfig.durable,
          exclusive: false,
          autoDelete: false,
          arguments: {
            'x-message-ttl': this.deadLetterConfig.messageTtl,
            'x-max-length': this.deadLetterConfig.maxLength,
            'x-overflow': 'drop-head', // Drop oldest messages when queue is full
          },
        }
      );

      // Bind dead letter queue to exchange
      await channel.bindQueue(
        this.deadLetterConfig.queueName,
        this.deadLetterConfig.exchangeName,
        this.deadLetterConfig.routingKey
      );

      // Bind specific routing patterns for different failure types
      const failurePatterns = [
        'failed.rooms.*',
        'failed.recordings.*',
        'failed.users.*',
        'failed.auth.*',
        'failed.feed.*',
      ];

      for (const pattern of failurePatterns) {
        await channel.bindQueue(
          this.deadLetterConfig.queueName,
          this.deadLetterConfig.exchangeName,
          pattern
        );
      }

      console.log(`✅ Dead letter topology setup complete: ${this.deadLetterConfig.exchangeName} -> ${this.deadLetterConfig.queueName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to setup dead letter topology:', errorMessage);
      throw new Error(`Dead letter topology setup failed: ${errorMessage}`);
    }
  }

  /**
   * Send failed event to dead letter queue
   */
  async sendToDeadLetterQueue(
    originalEvent: DomainEvent,
    error: Error,
    retryAttempts: number,
    originalRoutingKey: string,
    processingStartTime: number,
    failureContext?: Record<string, unknown>
  ): Promise<void> {
    try {
      const deadLetterEvent = this.createDeadLetterEvent(
        originalEvent,
        error,
        retryAttempts,
        originalRoutingKey,
        processingStartTime,
        failureContext
      );

      const routingKey = this.generateDeadLetterRoutingKey(originalEvent.type, error);
      const messageBuffer = this.serializeDeadLetterEvent(deadLetterEvent);

      const channel = this.connectionManager.getPublishChannel();

      await channel.publish(
        this.deadLetterConfig.exchangeName,
        routingKey,
        messageBuffer,
        {
          persistent: true,
          timestamp: Date.now(),
          messageId: `dlq-${originalEvent.id}`,
          correlationId: originalEvent.correlationId,
          type: 'dead_letter',
          headers: {
            originalEventType: originalEvent.type,
            failureReason: error.message,
            retryAttempts,
            deadLetterTimestamp: new Date().toISOString(),
          },
        }
      );

      // Update statistics
      this.updateDeadLetterStats(originalEvent, error, retryAttempts);

      console.warn(`💀 Event sent to dead letter queue: ${originalEvent.type} (${originalEvent.id}) - ${error.message}`);
    } catch (dlqError) {
      const errorMessage = dlqError instanceof Error ? dlqError.message : String(dlqError);
      console.error(`❌ Failed to send event to dead letter queue: ${errorMessage}`);
      
      // This is critical - if we can't send to DLQ, we need to handle it differently
      await this.handleDeadLetterFailure(originalEvent, error, dlqError as Error);
    }
  }

  /**
   * Create dead letter event with enriched metadata
   */
  private createDeadLetterEvent(
    originalEvent: DomainEvent,
    error: Error,
    retryAttempts: number,
    originalRoutingKey: string,
    processingStartTime: number,
    failureContext?: Record<string, unknown>
  ): DeadLetterEvent {
    const deadLetterMetadata: DeadLetterMetadata = {
      originalEvent,
      failureReason: error.message,
      errorStack: error.stack,
      retryAttempts,
      deadLetterTimestamp: new Date().toISOString(),
      originalRoutingKey,
      processingTimeMs: Date.now() - processingStartTime,
      failureContext,
    };

    return {
      id: `dlq-${originalEvent.id}`,
      type: 'dead_letter',
      version: '1.0',
      timestamp: new Date().toISOString(),
      correlationId: originalEvent.correlationId,
      userId: originalEvent.userId,
      sessionId: originalEvent.sessionId,
      data: {
        originalEventData: originalEvent.data,
      },
      metadata: {
        source: 'dead-letter-service',
        priority: 'high',
        ...originalEvent.metadata,
      },
      deadLetterMetadata,
    };
  }

  /**
   * Generate routing key for dead letter messages
   */
  private generateDeadLetterRoutingKey(eventType: string, error: Error): string {
    const [category] = eventType.split('.');
    const errorType = this.classifyError(error);
    
    return `failed.${category}.${errorType}`;
  }

  /**
   * Classify error type for routing
   */
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('validation')) return 'validation';
    if (message.includes('serialization')) return 'serialization';
    if (message.includes('connection')) return 'connection';
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('circuit breaker')) return 'circuit_breaker';
    if (message.includes('authentication')) return 'auth';
    if (message.includes('authorization')) return 'auth';
    
    return 'unknown';
  }

  /**
   * Serialize dead letter event to buffer
   */
  private serializeDeadLetterEvent(deadLetterEvent: DeadLetterEvent): Uint8Array {
    try {
      const jsonString = JSON.stringify(deadLetterEvent, null, 2);
      return new TextEncoder().encode(jsonString);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Dead letter event serialization failed: ${errorMessage}`);
    }
  }

  /**
   * Update dead letter statistics
   */
  private updateDeadLetterStats(
    originalEvent: DomainEvent,
    error: Error,
    retryAttempts: number
  ): void {
    this.deadLetterStats.totalDeadLetters++;
    
    // Update by event type
    const eventType = originalEvent.type;
    this.deadLetterStats.deadLettersByType[eventType] = 
      (this.deadLetterStats.deadLettersByType[eventType] || 0) + 1;
    
    // Update by failure reason
    const failureReason = this.classifyError(error);
    this.deadLetterStats.deadLettersByReason[failureReason] = 
      (this.deadLetterStats.deadLettersByReason[failureReason] || 0) + 1;
    
    // Update average retry attempts
    const totalRetryAttempts = Object.values(this.deadLetterStats.deadLettersByType)
      .reduce((sum, count) => sum + count, 0) * this.deadLetterStats.averageRetryAttempts + retryAttempts;
    this.deadLetterStats.averageRetryAttempts = totalRetryAttempts / this.deadLetterStats.totalDeadLetters;
    
    // Update timestamps
    const now = new Date();
    if (!this.deadLetterStats.oldestDeadLetter) {
      this.deadLetterStats.oldestDeadLetter = now;
    }
    this.deadLetterStats.newestDeadLetter = now;
  }

  /**
   * Handle failure to send to dead letter queue
   */
  private async handleDeadLetterFailure(
    originalEvent: DomainEvent,
    originalError: Error,
    dlqError: Error
  ): Promise<void> {
    // This is a critical situation - we can't even send to DLQ
    // Options:
    // 1. Log to file system
    // 2. Store in local database
    // 3. Send to alternative queue
    // 4. Trigger alert/notification
    
    const criticalFailure = {
      timestamp: new Date().toISOString(),
      originalEvent,
      originalError: {
        message: originalError.message,
        stack: originalError.stack,
      },
      dlqError: {
        message: dlqError.message,
        stack: dlqError.stack,
      },
    };

    // Log to console (in production, this should go to structured logging)
    console.error('🚨 CRITICAL: Failed to send event to dead letter queue!', JSON.stringify(criticalFailure, null, 2));
    
    // In a real implementation, you might:
    // - Write to a local file
    // - Store in a local database table
    // - Send to an alternative message queue
    // - Trigger an alert/notification system
    
    // For now, we'll just ensure it's logged
    try {
      // Could implement file-based fallback here
      // await this.writeToFailureLog(criticalFailure);
    } catch (fallbackError) {
      console.error('🚨 CRITICAL: All failure handling mechanisms failed!', fallbackError);
    }
  }

  /**
   * Get dead letter queue statistics
   */
  getStats(): DeadLetterStats {
    return { ...this.deadLetterStats };
  }

  /**
   * Get dead letter queue health
   */
  async getHealth(): Promise<{
    healthy: boolean;
    queueDepth?: number;
    exchangeExists: boolean;
    queueExists: boolean;
    error?: string;
  }> {
    try {
      const channel = this.connectionManager.getPublishChannel();
      
      // Check if exchange exists
      let exchangeExists = true;
      try {
        await channel.checkExchange(this.deadLetterConfig.exchangeName);
      } catch {
        exchangeExists = false;
      }
      
      // Check if queue exists and get depth
      let queueExists = true;
      let queueDepth: number | undefined;
      try {
        const queueInfo = await channel.checkQueue(this.deadLetterConfig.queueName);
        queueDepth = queueInfo.messageCount;
      } catch {
        queueExists = false;
      }
      
      const healthy = exchangeExists && queueExists;
      
      return {
        healthy,
        queueDepth,
        exchangeExists,
        queueExists,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        exchangeExists: false,
        queueExists: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Purge dead letter queue (for testing/maintenance)
   */
  async purgeDeadLetterQueue(): Promise<number> {
    try {
      const channel = this.connectionManager.getPublishChannel();
      const result = await channel.purgeQueue(this.deadLetterConfig.queueName);
      
      console.log(`🧹 Purged ${result.messageCount} messages from dead letter queue`);
      
      // Reset statistics
      this.deadLetterStats = {
        totalDeadLetters: 0,
        deadLettersByType: {},
        deadLettersByReason: {},
        averageRetryAttempts: 0,
      };
      
      return result.messageCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to purge dead letter queue:', errorMessage);
      throw new Error(`Dead letter queue purge failed: ${errorMessage}`);
    }
  }

  /**
   * Close dead letter service
   */
  async close(): Promise<void> {
    try {
      await this.connectionManager.close();
      console.log('✅ Dead letter service closed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error closing dead letter service:', errorMessage);
      throw error;
    }
  }
}

/**
 * Factory function to create dead letter service
 */
export function createDeadLetterService(
  rabbitMQConfig: RabbitMQConfig,
  deadLetterConfig?: Partial<DeadLetterConfig>
): RabbitMQDeadLetterService {
  const finalConfig = deadLetterConfig 
    ? { ...DEFAULT_DEAD_LETTER_CONFIG, ...deadLetterConfig }
    : DEFAULT_DEAD_LETTER_CONFIG;
    
  return new RabbitMQDeadLetterService(rabbitMQConfig, finalConfig);
}