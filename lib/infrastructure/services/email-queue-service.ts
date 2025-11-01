/**
 * Email Queue Service
 * 
 * Integrates email queue publisher and consumer with the email service
 * for asynchronous email processing with RabbitMQ
 */

import { EmailService, EmailMessage, EmailTemplateData, EmailResult } from '../../domain/services/email-service.ts';
import { EmailQueueConfig, EmailQueueStats, EmailQueueHealth } from '../../domain/types/email-queue.ts';
import { RabbitMQConfig } from '../../domain/types/rabbitmq-config.ts';
import { EmailQueuePublisher, createEmailQueuePublisher } from './email-queue-publisher.ts';
import { EmailQueueConsumer, createEmailQueueConsumer } from './email-queue-consumer.ts';
import { Result } from '../../domain/types/common.ts';

/**
 * Email queue service that provides async email processing
 */
export class EmailQueueService {
  private publisher: EmailQueuePublisher;
  private consumer: EmailQueueConsumer;
  private isInitialized = false;

  constructor(
    private emailService: EmailService,
    private rabbitMQConfig: RabbitMQConfig,
    private emailQueueConfig: EmailQueueConfig,
    publisher?: EmailQueuePublisher,
    consumer?: EmailQueueConsumer
  ) {
    if (publisher && consumer) {
      this.publisher = publisher;
      this.consumer = consumer;
    } else {
      // Will be initialized in initialize() method
      this.publisher = null as any;
      this.consumer = null as any;
    }
  }

  /**
   * Initialize the email queue service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create publisher and consumer if not provided
      if (!this.publisher) {
        this.publisher = await createEmailQueuePublisher(
          this.rabbitMQConfig,
          this.emailQueueConfig
        );
      }

      if (!this.consumer) {
        this.consumer = await createEmailQueueConsumer(
          this.emailService,
          this.rabbitMQConfig,
          this.emailQueueConfig,
          this.publisher
        );
      }

      this.isInitialized = true;
      console.log('✅ Email queue service initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to initialize email queue service:', errorMessage);
      throw error;
    }
  }

  /**
   * Start the email queue consumer
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.emailQueueConfig.enabled) {
      console.log('📧 Email queue is disabled, skipping consumer start');
      return;
    }

    await this.consumer.start();
    console.log('🚀 Email queue consumer started');
  }

  /**
   * Stop the email queue consumer
   */
  async stop(): Promise<void> {
    if (!this.isInitialized || !this.emailQueueConfig.enabled) {
      return;
    }

    await this.consumer.stop();
    console.log('⏹️ Email queue consumer stopped');
  }

  /**
   * Queue a single email for asynchronous processing
   */
  async queueEmail(email: EmailMessage): Promise<Result<string>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.publisher.queueEmail(email);
  }

  /**
   * Queue a template email for asynchronous processing
   */
  async queueTemplateEmail(templateData: EmailTemplateData): Promise<Result<string>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.publisher.queueTemplateEmail(templateData);
  }

  /**
   * Queue bulk emails for asynchronous processing
   */
  async queueBulkEmails(emails: EmailMessage[]): Promise<Result<string>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.publisher.queueBulkEmails(emails);
  }

  /**
   * Send email synchronously or queue it based on configuration
   */
  async sendEmail(email: EmailMessage): Promise<Result<EmailResult>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.emailQueueConfig.enabled) {
      // Queue the email for async processing
      const queueResult = await this.queueEmail(email);
      if (queueResult.success) {
        return {
          success: true,
          data: {
            success: true,
            messageId: queueResult.data,
            provider: 'queue',
            timestamp: new Date(),
          },
        };
      } else {
        return {
          success: false,
          error: queueResult.error,
        };
      }
    } else {
      // Send email synchronously
      return await this.emailService.send(email);
    }
  }

  /**
   * Send template email synchronously or queue it based on configuration
   */
  async sendTemplateEmail(templateData: EmailTemplateData): Promise<Result<EmailResult>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.emailQueueConfig.enabled) {
      // Queue the template email for async processing
      const queueResult = await this.queueTemplateEmail(templateData);
      if (queueResult.success) {
        return {
          success: true,
          data: {
            success: true,
            messageId: queueResult.data,
            provider: 'queue',
            timestamp: new Date(),
          },
        };
      } else {
        return {
          success: false,
          error: queueResult.error,
        };
      }
    } else {
      // Send template email synchronously
      return await this.emailService.sendTemplate(templateData);
    }
  }

  /**
   * Send bulk emails synchronously or queue them based on configuration
   */
  async sendBulkEmails(emails: EmailMessage[]): Promise<Result<EmailResult[]>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.emailQueueConfig.enabled) {
      // Queue the bulk emails for async processing
      const queueResult = await this.queueBulkEmails(emails);
      if (queueResult.success) {
        return {
          success: true,
          data: emails.map(() => ({
            success: true,
            messageId: queueResult.data,
            provider: 'queue',
            timestamp: new Date(),
          })),
        };
      } else {
        return {
          success: false,
          error: queueResult.error,
        };
      }
    } else {
      // Send bulk emails synchronously
      return await this.emailService.sendBulk(emails);
    }
  }

  /**
   * Get email queue statistics
   */
  getStats(): EmailQueueStats {
    if (!this.isInitialized) {
      return {
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
    }

    return this.consumer.getStats();
  }

  /**
   * Get email queue health status
   */
  async getHealth(): Promise<EmailQueueHealth> {
    if (!this.isInitialized) {
      return {
        healthy: false,
        connected: false,
        activeWorkers: 0,
        queueDepth: 0,
        errorRate: 0,
        lastCheck: new Date(),
        details: {
          error: 'Email queue service not initialized',
        },
      };
    }

    return await this.consumer.getHealth();
  }

  /**
   * Check if the email queue service is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }

    const publisherHealthy = await this.publisher.isHealthy();
    const consumerHealth = await this.consumer.getHealth();
    
    return publisherHealthy && consumerHealth.healthy;
  }

  /**
   * Get publisher statistics
   */
  getPublisherStats() {
    if (!this.isInitialized) {
      return {
        publishedCount: 0,
        failedCount: 0,
        successRate: 0,
      };
    }

    return this.publisher.getStats();
  }

  /**
   * Close the email queue service and cleanup resources
   */
  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      await this.stop();
      await this.consumer.close();
      await this.publisher.close();
      
      this.isInitialized = false;
      console.log('✅ Email queue service closed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error closing email queue service:', errorMessage);
      throw error;
    }
  }

  /**
   * Get the underlying email service
   */
  getEmailService(): EmailService {
    return this.emailService;
  }

  /**
   * Get the queue configuration
   */
  getConfig(): EmailQueueConfig {
    return this.emailQueueConfig;
  }

  /**
   * Check if queue is enabled
   */
  isQueueEnabled(): boolean {
    return this.emailQueueConfig.enabled;
  }
}

/**
 * Factory function to create and initialize email queue service
 */
export async function createEmailQueueService(
  emailService: EmailService,
  rabbitMQConfig: RabbitMQConfig,
  emailQueueConfig: EmailQueueConfig
): Promise<EmailQueueService> {
  const service = new EmailQueueService(emailService, rabbitMQConfig, emailQueueConfig);
  await service.initialize();
  return service;
}

/**
 * Create email queue configuration from environment variables
 */
export async function createEmailQueueConfig(): Promise<EmailQueueConfig> {
  const { getConfig } = await import('../../secrets.ts');
  
  return {
    enabled: (await getConfig('EMAIL_QUEUE_ENABLED', undefined, 'true')) === 'true',
    concurrency: parseInt(await getConfig('EMAIL_QUEUE_CONCURRENCY', undefined, '5') || '5'),
    maxRetryAttempts: parseInt(await getConfig('EMAIL_MAX_RETRY_ATTEMPTS', undefined, '3') || '3'),
    retryDelay: parseInt(await getConfig('EMAIL_RETRY_DELAY', undefined, '5000') || '5000'),
    maxRetryDelay: parseInt(await getConfig('EMAIL_MAX_RETRY_DELAY', undefined, '300000') || '300000'), // 5 minutes
    backoffMultiplier: parseFloat(await getConfig('EMAIL_BACKOFF_MULTIPLIER', undefined, '2.0') || '2.0'),
    messageTtl: parseInt(await getConfig('EMAIL_MESSAGE_TTL', undefined, '86400000') || '86400000'), // 24 hours
    maxQueueLength: parseInt(await getConfig('EMAIL_MAX_QUEUE_LENGTH', undefined, '10000') || '10000'),
    deadLetterTtl: parseInt(await getConfig('EMAIL_DEAD_LETTER_TTL', undefined, '2592000000') || '2592000000'), // 30 days
  };
}