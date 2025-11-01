/**
 * Email Queue Consumer
 * 
 * Consumes email messages from RabbitMQ and processes them asynchronously
 */

import type { ChannelWrapper, ConsumeMessage } from 'amqp-connection-manager';
import { EmailService } from '../../domain/services/email-service.ts';
import {
  EmailQueueMessage,
  EmailQueueMessageType,
  EmailQueueProcessingResult,
  EmailQueueConfig,
  EmailQueueStats,
  EmailQueueHealth,
  EMAIL_QUEUE_NAMES,
  EMAIL_EXCHANGE_NAME,
} from '../../domain/types/email-queue.ts';
import { RabbitMQConfig, QueueName } from '../../domain/types/rabbitmq-config.ts';
import { RabbitMQConnectionManager } from './rabbitmq-connection-manager.ts';
import { EmailQueuePublisher } from './email-queue-publisher.ts';
import { RabbitMQLogger, createRabbitMQLogger } from './rabbitmq-logger.ts';

/**
 * Email queue consumer for processing email messages
 */
export class EmailQueueConsumer {
  private connectionManager: RabbitMQConnectionManager;
  private publisher: EmailQueuePublisher;
  private logger: RabbitMQLogger;
  private isRunning = false;
  private workers: Map<string, boolean> = new Map();
  private stats: EmailQueueStats = {
    totalProcessed: 0,
    successfullyProcessed: 0,
    failedMessages: 0,
    queueDepth: 0,
    retryQueueDepth: 0,
    deadLetterQueueDepth: 0,
    averageProcessingTime: 0,
    successRate: 0,
    activeWorkers: 0,
  };
  private processingTimes: number[] = [];

  constructor(
    private emailService: EmailService,
    private rabbitMQConfig: RabbitMQConfig,
    private emailQueueConfig: EmailQueueConfig,
    publisher?: EmailQueuePublisher
  ) {
    this.connectionManager = new RabbitMQConnectionManager(rabbitMQConfig);
    this.publisher = publisher || new EmailQueuePublisher(rabbitMQConfig, emailQueueConfig);
    this.logger = createRabbitMQLogger();
  }

  /**
   * Initialize the consumer
   */
  async initialize(): Promise<void> {
    await this.connectionManager.connect();
    await this.publisher.initialize();
    
    this.logger.info('Email queue consumer initialized', {
      operation: 'initialize',
      concurrency: this.emailQueueConfig.concurrency,
      maxRetryAttempts: this.emailQueueConfig.maxRetryAttempts,
    });
  }

  /**
   * Start consuming messages from the email queue
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Email queue consumer is already running', {
        operation: 'start',
      });
      return;
    }

    this.isRunning = true;
    
    try {
      const channel = this.connectionManager.getConsumeChannel();
      
      // Set prefetch count for concurrency control
      await channel.prefetch(this.emailQueueConfig.concurrency);

      // Start consuming from main email queue
      await channel.consume(
        QueueName.EMAIL,
        (message) => this.handleMessage(message),
        {
          noAck: false, // Manual acknowledgment
        }
      );

      // Start consuming from retry queue
      await channel.consume(
        QueueName.EMAIL_RETRY,
        (message) => this.handleMessage(message),
        {
          noAck: false, // Manual acknowledgment
        }
      );

      this.logger.info('Email queue consumer started', {
        operation: 'start',
        queues: [QueueName.EMAIL, QueueName.EMAIL_RETRY],
        concurrency: this.emailQueueConfig.concurrency,
      });
    } catch (error) {
      this.isRunning = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('Failed to start email queue consumer', {
        operation: 'start',
        error: errorMessage,
      }, error instanceof Error ? error : new Error(errorMessage));
      
      throw error;
    }
  }

  /**
   * Stop consuming messages
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Wait for active workers to finish
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.workers.size > 0 && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.info('Email queue consumer stopped', {
      operation: 'stop',
      activeWorkers: this.workers.size,
      totalProcessed: this.stats.totalProcessed,
      successRate: this.stats.successRate,
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.isRunning) {
      return;
    }

    const workerId = crypto.randomUUID();
    this.workers.set(workerId, true);
    this.stats.activeWorkers = this.workers.size;

    try {
      const emailMessage = this.deserializeMessage(message.content);
      const result = await this.processMessage(emailMessage);

      if (result.success) {
        // Acknowledge successful processing
        message.ack();
        this.stats.successfullyProcessed++;
        
        this.logger.info('Email message processed successfully', {
          operation: 'process_message',
          messageId: emailMessage.id,
          messageType: emailMessage.type,
          attempts: result.attempts,
          processingTime: result.processingTime,
        });
      } else {
        await this.handleFailedMessage(message, emailMessage, result);
      }

      this.stats.totalProcessed++;
      this.updateProcessingStats(result.processingTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('Error handling email message', {
        operation: 'handle_message',
        error: errorMessage,
      }, error instanceof Error ? error : new Error(errorMessage));

      // Reject message and don't requeue to prevent infinite loops
      message.nack(false, false);
      this.stats.failedMessages++;
      this.stats.totalProcessed++;
    } finally {
      this.workers.delete(workerId);
      this.stats.activeWorkers = this.workers.size;
    }
  }

  /**
   * Process email message based on type
   */
  private async processMessage(message: EmailQueueMessage): Promise<EmailQueueProcessingResult> {
    const startTime = Date.now();
    
    try {
      let result;
      
      switch (message.type) {
        case EmailQueueMessageType.SEND_EMAIL:
          result = await this.emailService.send(message.email);
          break;
          
        case EmailQueueMessageType.SEND_TEMPLATE_EMAIL:
          result = await this.emailService.sendTemplate(message.templateData);
          break;
          
        case EmailQueueMessageType.SEND_BULK_EMAIL:
          result = await this.emailService.sendBulk(message.emails);
          break;
          
        default:
          throw new Error(`Unknown message type: ${(message as any).type}`);
      }

      const processingTime = Date.now() - startTime;

      if (result.success) {
        return {
          success: true,
          processingTime,
          attempts: message.attempts + 1,
          shouldRetry: false,
          result: result.data,
        };
      } else {
        const shouldRetry = this.shouldRetryMessage(message, result.error || 'Unknown error');
        
        return {
          success: false,
          error: result.error,
          processingTime,
          attempts: message.attempts + 1,
          shouldRetry,
        };
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const shouldRetry = this.shouldRetryMessage(message, errorMessage);

      this.logger.error('Error processing email message', {
        operation: 'process_message',
        messageId: message.id,
        messageType: message.type,
        attempts: message.attempts + 1,
        processingTime,
        error: errorMessage,
        shouldRetry,
      }, error instanceof Error ? error : new Error(errorMessage));

      return {
        success: false,
        error: errorMessage,
        processingTime,
        attempts: message.attempts + 1,
        shouldRetry,
      };
    }
  }

  /**
   * Handle failed message processing
   */
  private async handleFailedMessage(
    rabbitMessage: ConsumeMessage,
    emailMessage: EmailQueueMessage,
    result: EmailQueueProcessingResult
  ): Promise<void> {
    if (result.shouldRetry) {
      // Calculate retry delay with exponential backoff
      const retryDelay = Math.min(
        this.emailQueueConfig.retryDelay * Math.pow(
          this.emailQueueConfig.backoffMultiplier,
          emailMessage.attempts
        ),
        this.emailQueueConfig.maxRetryDelay
      );

      // Requeue for retry
      const requeueResult = await this.publisher.requeueForRetry(
        emailMessage,
        result.error || 'Processing failed',
        retryDelay
      );

      if (requeueResult.success) {
        // Acknowledge original message since we've requeued it
        rabbitMessage.ack();
        
        this.logger.info('Email message requeued for retry', {
          operation: 'requeue_retry',
          messageId: emailMessage.id,
          attempts: result.attempts,
          maxAttempts: emailMessage.maxAttempts,
          retryDelay,
        });
      } else {
        // Failed to requeue, reject message
        rabbitMessage.nack(false, false);
        this.stats.failedMessages++;
        
        this.logger.error('Failed to requeue email message for retry', {
          operation: 'requeue_retry',
          messageId: emailMessage.id,
          error: requeueResult.error,
        });
      }
    } else {
      // Send to dead letter queue
      const deadLetterResult = await this.publisher.sendToDeadLetter(
        emailMessage,
        result.error || 'Max retry attempts exceeded'
      );

      if (deadLetterResult.success) {
        // Acknowledge original message since we've sent it to DLQ
        rabbitMessage.ack();
        
        this.logger.error('Email message sent to dead letter queue', {
          operation: 'dead_letter',
          messageId: emailMessage.id,
          attempts: result.attempts,
          finalError: result.error,
        });
      } else {
        // Failed to send to DLQ, reject message
        rabbitMessage.nack(false, false);
        
        this.logger.error('Failed to send email message to dead letter queue', {
          operation: 'dead_letter',
          messageId: emailMessage.id,
          error: deadLetterResult.error,
        });
      }

      this.stats.failedMessages++;
    }
  }

  /**
   * Determine if message should be retried
   */
  private shouldRetryMessage(message: EmailQueueMessage, error: string): boolean {
    // Don't retry if max attempts reached
    if (message.attempts >= message.maxAttempts) {
      return false;
    }

    // Don't retry for certain types of errors
    const nonRetryableErrors = [
      'invalid email address',
      'template not found',
      'authentication failed',
      'invalid api key',
      'permission denied',
    ];

    const lowerError = error.toLowerCase();
    return !nonRetryableErrors.some(nonRetryable => lowerError.includes(nonRetryable));
  }

  /**
   * Deserialize message from buffer
   */
  private deserializeMessage(buffer: Buffer): EmailQueueMessage {
    try {
      const jsonString = buffer.toString('utf-8');
      const parsed = JSON.parse(jsonString);
      
      // Convert date strings back to Date objects
      if (parsed.createdAt) {
        parsed.createdAt = new Date(parsed.createdAt);
      }
      
      return parsed as EmailQueueMessage;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Message deserialization failed: ${errorMessage}`);
    }
  }

  /**
   * Update processing time statistics
   */
  private updateProcessingStats(processingTime: number): void {
    this.processingTimes.push(processingTime);
    
    // Keep only last 1000 processing times for average calculation
    if (this.processingTimes.length > 1000) {
      this.processingTimes = this.processingTimes.slice(-1000);
    }
    
    // Calculate average processing time
    this.stats.averageProcessingTime = this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
    
    // Calculate success rate
    this.stats.successRate = this.stats.totalProcessed > 0 
      ? (this.stats.successfullyProcessed / this.stats.totalProcessed) * 100 
      : 0;
    
    // Update last processed timestamp
    this.stats.lastProcessedAt = new Date();
  }

  /**
   * Get consumer statistics
   */
  getStats(): EmailQueueStats {
    return { ...this.stats };
  }

  /**
   * Get consumer health status
   */
  async getHealth(): Promise<EmailQueueHealth> {
    const isHealthy = this.isRunning && await this.publisher.isHealthy();
    const errorRate = this.stats.totalProcessed > 0 
      ? (this.stats.failedMessages / this.stats.totalProcessed) * 100 
      : 0;

    return {
      healthy: isHealthy,
      connected: this.isRunning,
      activeWorkers: this.stats.activeWorkers,
      queueDepth: this.stats.queueDepth,
      errorRate,
      lastCheck: new Date(),
      details: {
        totalProcessed: this.stats.totalProcessed,
        successfullyProcessed: this.stats.successfullyProcessed,
        failedMessages: this.stats.failedMessages,
        averageProcessingTime: this.stats.averageProcessingTime,
        successRate: this.stats.successRate,
      },
    };
  }

  /**
   * Close consumer and cleanup resources
   */
  async close(): Promise<void> {
    await this.stop();
    await this.publisher.close();
    await this.connectionManager.close();
    
    this.logger.info('Email queue consumer closed', {
      operation: 'close',
      totalProcessed: this.stats.totalProcessed,
      successRate: this.stats.successRate,
    });
  }
}

/**
 * Factory function to create and initialize email queue consumer
 */
export async function createEmailQueueConsumer(
  emailService: EmailService,
  rabbitMQConfig: RabbitMQConfig,
  emailQueueConfig: EmailQueueConfig,
  publisher?: EmailQueuePublisher
): Promise<EmailQueueConsumer> {
  const consumer = new EmailQueueConsumer(emailService, rabbitMQConfig, emailQueueConfig, publisher);
  await consumer.initialize();
  return consumer;
}