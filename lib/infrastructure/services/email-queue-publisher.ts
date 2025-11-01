/**
 * Email Queue Publisher
 * 
 * Publishes email messages to RabbitMQ for asynchronous processing
 */

import type { ChannelWrapper } from 'amqp-connection-manager';
import { EmailMessage, EmailTemplateData, EmailResult } from '../../domain/services/email-service.ts';
import {
  EmailQueueMessage,
  EmailQueueMessageType,
  SendEmailQueueMessage,
  SendTemplateEmailQueueMessage,
  SendBulkEmailQueueMessage,
  EmailQueueConfig,
  EMAIL_ROUTING_KEYS,
  EMAIL_EXCHANGE_NAME,
} from '../../domain/types/email-queue.ts';
import { RabbitMQConfig, ExchangeName } from '../../domain/types/rabbitmq-config.ts';
import { RabbitMQConnectionManager } from './rabbitmq-connection-manager.ts';
import { RabbitMQLogger, createRabbitMQLogger } from './rabbitmq-logger.ts';
import { Result } from '../../domain/types/common.ts';

/**
 * Email queue publisher for async email processing
 */
export class EmailQueuePublisher {
  private connectionManager: RabbitMQConnectionManager;
  private logger: RabbitMQLogger;
  private publishedCount = 0;
  private failedCount = 0;

  constructor(
    private rabbitMQConfig: RabbitMQConfig,
    private emailQueueConfig: EmailQueueConfig
  ) {
    this.connectionManager = new RabbitMQConnectionManager(rabbitMQConfig);
    this.logger = createRabbitMQLogger();
  }

  /**
   * Initialize the publisher
   */
  async initialize(): Promise<void> {
    await this.connectionManager.connect();
    this.logger.info('Email queue publisher initialized', {
      operation: 'initialize',
      exchange: ExchangeName.EMAIL,
    });
  }

  /**
   * Queue a single email for processing
   */
  async queueEmail(email: EmailMessage): Promise<Result<string>> {
    if (!this.emailQueueConfig.enabled) {
      return {
        success: false,
        error: 'Email queue is disabled',
      };
    }

    const message: SendEmailQueueMessage = {
      id: crypto.randomUUID(),
      type: EmailQueueMessageType.SEND_EMAIL,
      email,
      correlationId: email.correlationId || crypto.randomUUID(),
      priority: email.priority || 'normal',
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: this.emailQueueConfig.maxRetryAttempts,
      metadata: {
        source: 'email-queue-publisher',
        queuedAt: new Date().toISOString(),
      },
    };

    return await this.publishMessage(message, EMAIL_ROUTING_KEYS.SEND);
  }

  /**
   * Queue a template email for processing
   */
  async queueTemplateEmail(templateData: EmailTemplateData): Promise<Result<string>> {
    if (!this.emailQueueConfig.enabled) {
      return {
        success: false,
        error: 'Email queue is disabled',
      };
    }

    const message: SendTemplateEmailQueueMessage = {
      id: crypto.randomUUID(),
      type: EmailQueueMessageType.SEND_TEMPLATE_EMAIL,
      templateData,
      correlationId: templateData.correlationId || crypto.randomUUID(),
      priority: templateData.priority || 'normal',
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: this.emailQueueConfig.maxRetryAttempts,
      metadata: {
        source: 'email-queue-publisher',
        templateId: templateData.templateId,
        queuedAt: new Date().toISOString(),
      },
    };

    return await this.publishMessage(message, EMAIL_ROUTING_KEYS.SEND_TEMPLATE);
  }

  /**
   * Queue bulk emails for processing
   */
  async queueBulkEmails(emails: EmailMessage[]): Promise<Result<string>> {
    if (!this.emailQueueConfig.enabled) {
      return {
        success: false,
        error: 'Email queue is disabled',
      };
    }

    if (emails.length === 0) {
      return {
        success: false,
        error: 'No emails provided for bulk processing',
      };
    }

    const message: SendBulkEmailQueueMessage = {
      id: crypto.randomUUID(),
      type: EmailQueueMessageType.SEND_BULK_EMAIL,
      emails,
      correlationId: crypto.randomUUID(),
      priority: 'normal', // Bulk emails default to normal priority
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: this.emailQueueConfig.maxRetryAttempts,
      metadata: {
        source: 'email-queue-publisher',
        emailCount: emails.length,
        queuedAt: new Date().toISOString(),
      },
    };

    return await this.publishMessage(message, EMAIL_ROUTING_KEYS.SEND_BULK);
  }

  /**
   * Requeue a failed message for retry
   */
  async requeueForRetry(
    originalMessage: EmailQueueMessage,
    error: string,
    retryDelay: number
  ): Promise<Result<string>> {
    const retryMessage: EmailQueueMessage = {
      ...originalMessage,
      id: crypto.randomUUID(), // New ID for retry
      attempts: originalMessage.attempts + 1,
      metadata: {
        ...originalMessage.metadata,
        originalId: originalMessage.id,
        retryReason: error,
        retryDelay,
        requeuedAt: new Date().toISOString(),
      },
    };

    // Calculate delay for exponential backoff
    const delay = Math.min(
      this.emailQueueConfig.retryDelay * Math.pow(
        this.emailQueueConfig.backoffMultiplier,
        originalMessage.attempts
      ),
      this.emailQueueConfig.maxRetryDelay
    );

    this.logger.info('Requeuing email message for retry', {
      operation: 'requeue_retry',
      messageId: originalMessage.id,
      retryMessageId: retryMessage.id,
      attempt: retryMessage.attempts,
      maxAttempts: retryMessage.maxAttempts,
      delay,
      error,
    });

    // Publish to retry queue with delay
    return await this.publishMessage(
      retryMessage,
      EMAIL_ROUTING_KEYS.RETRY,
      delay
    );
  }

  /**
   * Send message to dead letter queue
   */
  async sendToDeadLetter(
    originalMessage: EmailQueueMessage,
    finalError: string
  ): Promise<Result<string>> {
    const deadLetterMessage: EmailQueueMessage = {
      ...originalMessage,
      metadata: {
        ...originalMessage.metadata,
        finalError,
        deadLetteredAt: new Date().toISOString(),
        totalAttempts: originalMessage.attempts,
      },
    };

    this.logger.error('Sending email message to dead letter queue', {
      operation: 'dead_letter',
      messageId: originalMessage.id,
      attempts: originalMessage.attempts,
      maxAttempts: originalMessage.maxAttempts,
      finalError,
    });

    return await this.publishMessage(
      deadLetterMessage,
      EMAIL_ROUTING_KEYS.DEAD_LETTER
    );
  }

  /**
   * Publish message to RabbitMQ
   */
  private async publishMessage(
    message: EmailQueueMessage,
    routingKey: string,
    delay?: number
  ): Promise<Result<string>> {
    const startTime = Date.now();

    try {
      const channel = this.connectionManager.getPublishChannel();
      const messageBuffer = this.serializeMessage(message);

      const publishOptions: any = {
        persistent: true,
        mandatory: true,
        timestamp: Date.now(),
        messageId: message.id,
        correlationId: message.correlationId,
        type: message.type,
        priority: this.getPriorityValue(message.priority),
        headers: {
          attempts: message.attempts,
          maxAttempts: message.maxAttempts,
          messageType: message.type,
          source: 'email-queue-publisher',
        },
      };

      // Add delay header for retry messages
      if (delay && delay > 0) {
        publishOptions.headers['x-delay'] = delay;
      }

      // Publish message
      await channel.publish(
        ExchangeName.EMAIL,
        routingKey,
        messageBuffer,
        publishOptions
      );

      const processingTime = Date.now() - startTime;
      this.publishedCount++;

      this.logger.info('Email message published to queue', {
        operation: 'publish_message',
        messageId: message.id,
        routingKey,
        messageType: message.type,
        priority: message.priority,
        attempts: message.attempts,
        processingTime,
        delay,
      });

      return {
        success: true,
        data: message.id,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.failedCount++;

      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('Failed to publish email message to queue', {
        operation: 'publish_message',
        messageId: message.id,
        routingKey,
        messageType: message.type,
        processingTime,
        error: errorMessage,
      }, error instanceof Error ? error : new Error(errorMessage));

      return {
        success: false,
        error: `Failed to publish email message: ${errorMessage}`,
      };
    }
  }

  /**
   * Serialize message to buffer
   */
  private serializeMessage(message: EmailQueueMessage): Uint8Array {
    try {
      const jsonString = JSON.stringify(message, (key, value) => {
        // Handle Date objects
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });
      
      return new TextEncoder().encode(jsonString);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Message serialization failed: ${errorMessage}`);
    }
  }

  /**
   * Convert priority string to numeric value for RabbitMQ
   */
  private getPriorityValue(priority: 'low' | 'normal' | 'high'): number {
    switch (priority) {
      case 'high':
        return 10;
      case 'normal':
        return 5;
      case 'low':
        return 1;
      default:
        return 5;
    }
  }

  /**
   * Get publisher statistics
   */
  getStats() {
    const successRate = this.publishedCount > 0 
      ? (this.publishedCount / (this.publishedCount + this.failedCount)) * 100 
      : 0;

    return {
      publishedCount: this.publishedCount,
      failedCount: this.failedCount,
      successRate,
      connectionStats: this.connectionManager.getStats(),
    };
  }

  /**
   * Check if publisher is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.connectionManager.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Close publisher and cleanup resources
   */
  async close(): Promise<void> {
    try {
      await this.connectionManager.close();
      this.logger.info('Email queue publisher closed', {
        operation: 'close',
        publishedCount: this.publishedCount,
        failedCount: this.failedCount,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error closing email queue publisher', {
        operation: 'close',
      }, error instanceof Error ? error : new Error(errorMessage));
      throw error;
    }
  }
}

/**
 * Factory function to create and initialize email queue publisher
 */
export async function createEmailQueuePublisher(
  rabbitMQConfig: RabbitMQConfig,
  emailQueueConfig: EmailQueueConfig
): Promise<EmailQueuePublisher> {
  const publisher = new EmailQueuePublisher(rabbitMQConfig, emailQueueConfig);
  await publisher.initialize();
  return publisher;
}