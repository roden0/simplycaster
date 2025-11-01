/**
 * Instrumented Email Service - Email service wrapper with observability
 * 
 * This module provides:
 * - Email service wrapper with automatic instrumentation
 * - Tracing for all email operations
 * - Metrics collection for delivery rates and performance
 * - Structured logging with correlation IDs
 * - Health monitoring and alerting
 */

import { EmailService, EmailMessage, EmailTemplateData, EmailResult, HealthStatus } from '../../domain/services/email-service.ts';
import { Result } from '../../domain/types/common.ts';
import { 
  instrumentEmailOperation,
  instrumentTemplateOperation,
  recordEmailMetrics,
  recordTemplateMetrics,
  recordProviderHealth,
  EmailOperationContext,
  EmailTemplateOperationContext,
  EmailProviderHealthContext,
} from '../../observability/instrumentation/email-instrumentation.ts';
import {
  recordEmailDelivery,
  recordEmailProviderPerformance,
  EmailDeliveryMetricsContext,
  EmailProviderPerformanceContext,
} from '../../observability/metrics/email-metrics.ts';
import { createComponentLogger } from '../../observability/logging/index.ts';
import { getCurrentTraceContext } from '../../observability/tracing/trace-context.ts';

/**
 * Instrumented email service configuration
 */
export interface InstrumentedEmailServiceConfig {
  /** Enable tracing for email operations */
  enableTracing: boolean;
  /** Enable metrics collection */
  enableMetrics: boolean;
  /** Enable structured logging */
  enableLogging: boolean;
  /** Enable health monitoring */
  enableHealthMonitoring: boolean;
  /** Provider name for metrics */
  providerName: string;
  /** Service name for logging */
  serviceName: string;
}

/**
 * Default configuration for instrumented email service
 */
const DEFAULT_CONFIG: InstrumentedEmailServiceConfig = {
  enableTracing: true,
  enableMetrics: true,
  enableLogging: true,
  enableHealthMonitoring: true,
  providerName: 'unknown',
  serviceName: 'email-service',
};

/**
 * Instrumented email service wrapper
 */
export class InstrumentedEmailService implements EmailService {
  private logger = createComponentLogger('InstrumentedEmailService');
  private config: InstrumentedEmailServiceConfig;
  private healthStats = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    lastHealthCheck: new Date(),
    averageResponseTime: 0,
    totalResponseTime: 0,
  };

  constructor(
    private wrappedService: EmailService,
    config: Partial<InstrumentedEmailServiceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createComponentLogger('InstrumentedEmailService', {
      provider: this.config.providerName,
      service: this.config.serviceName,
    });
  }

  /**
   * Send a single email with instrumentation
   */
  async send(email: EmailMessage): Promise<Result<EmailResult>> {
    const correlationId = email.correlationId || crypto.randomUUID();
    const startTime = Date.now();

    // Get trace context for correlation
    const traceContext = getCurrentTraceContext();

    const operationContext: Omit<EmailOperationContext, 'success' | 'duration'> = {
      operation: 'send',
      provider: this.config.providerName,
      recipientCount: Array.isArray(email.to) ? email.to.length : 1,
      priority: email.priority,
      correlationId,
      messageSize: this.calculateMessageSize(email),
    };

    if (this.config.enableLogging) {
      this.logger.info('Starting email send operation', {
        operation: 'send',
        correlationId,
        recipientCount: operationContext.recipientCount,
        priority: email.priority,
        traceId: traceContext?.traceId,
      });
    }

    if (this.config.enableTracing) {
      return await instrumentEmailOperation(operationContext, async () => {
        return await this.executeSend(email, correlationId, startTime);
      });
    } else {
      return await this.executeSend(email, correlationId, startTime);
    }
  }

  /**
   * Send an email using a template with instrumentation
   */
  async sendTemplate(templateData: EmailTemplateData): Promise<Result<EmailResult>> {
    const correlationId = templateData.correlationId || crypto.randomUUID();
    const startTime = Date.now();

    // Get trace context for correlation
    const traceContext = getCurrentTraceContext();

    const operationContext: Omit<EmailOperationContext, 'success' | 'duration'> = {
      operation: 'send_template',
      provider: this.config.providerName,
      templateId: templateData.templateId,
      recipientCount: Array.isArray(templateData.to) ? templateData.to.length : 1,
      priority: templateData.priority,
      correlationId,
    };

    if (this.config.enableLogging) {
      this.logger.info('Starting template email send operation', {
        operation: 'send_template',
        templateId: templateData.templateId,
        correlationId,
        recipientCount: operationContext.recipientCount,
        traceId: traceContext?.traceId,
      });
    }

    if (this.config.enableTracing) {
      return await instrumentEmailOperation(operationContext, async () => {
        return await this.executeSendTemplate(templateData, correlationId, startTime);
      });
    } else {
      return await this.executeSendTemplate(templateData, correlationId, startTime);
    }
  }

  /**
   * Send multiple emails in bulk with instrumentation
   */
  async sendBulk(emails: EmailMessage[]): Promise<Result<EmailResult[]>> {
    const correlationId = crypto.randomUUID();
    const startTime = Date.now();

    // Get trace context for correlation
    const traceContext = getCurrentTraceContext();

    const totalRecipients = emails.reduce((total, email) => {
      return total + (Array.isArray(email.to) ? email.to.length : 1);
    }, 0);

    const operationContext: Omit<EmailOperationContext, 'success' | 'duration'> = {
      operation: 'send_bulk',
      provider: this.config.providerName,
      recipientCount: totalRecipients,
      correlationId,
      messageSize: emails.reduce((total, email) => total + this.calculateMessageSize(email), 0),
    };

    if (this.config.enableLogging) {
      this.logger.info('Starting bulk email send operation', {
        operation: 'send_bulk',
        emailCount: emails.length,
        totalRecipients,
        correlationId,
        traceId: traceContext?.traceId,
      });
    }

    if (this.config.enableTracing) {
      return await instrumentEmailOperation(operationContext, async () => {
        return await this.executeSendBulk(emails, correlationId, startTime);
      });
    } else {
      return await this.executeSendBulk(emails, correlationId, startTime);
    }
  }

  /**
   * Check the health status of the email service with instrumentation
   */
  async healthCheck(): Promise<Result<HealthStatus>> {
    const startTime = Date.now();
    const correlationId = crypto.randomUUID();

    const operationContext: Omit<EmailOperationContext, 'success' | 'duration'> = {
      operation: 'health_check',
      provider: this.config.providerName,
      recipientCount: 0,
      correlationId,
    };

    if (this.config.enableLogging) {
      this.logger.debug('Starting health check operation', {
        operation: 'health_check',
        correlationId,
      });
    }

    if (this.config.enableTracing) {
      return await instrumentEmailOperation(operationContext, async () => {
        return await this.executeHealthCheck(correlationId, startTime);
      });
    } else {
      return await this.executeHealthCheck(correlationId, startTime);
    }
  }

  /**
   * Render a template with provided data with instrumentation
   */
  async renderTemplate(templateId: string, variables: Record<string, unknown>): Promise<Result<string>> {
    const startTime = Date.now();
    const correlationId = crypto.randomUUID();

    const templateContext: Omit<EmailTemplateOperationContext, 'success' | 'duration'> = {
      operation: 'render',
      templateId,
      format: 'html', // Assume HTML for now
      variableCount: Object.keys(variables).length,
    };

    if (this.config.enableLogging) {
      this.logger.debug('Starting template render operation', {
        operation: 'render_template',
        templateId,
        variableCount: templateContext.variableCount,
        correlationId,
      });
    }

    if (this.config.enableTracing) {
      return await instrumentTemplateOperation(templateContext, async () => {
        return await this.executeRenderTemplate(templateId, variables, correlationId, startTime);
      });
    } else {
      return await this.executeRenderTemplate(templateId, variables, correlationId, startTime);
    }
  }

  /**
   * Get instrumentation statistics
   */
  getInstrumentationStats(): {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    successRate: number;
    averageResponseTime: number;
    lastHealthCheck: Date;
  } {
    const successRate = this.healthStats.totalOperations > 0 
      ? (this.healthStats.successfulOperations / this.healthStats.totalOperations) * 100 
      : 100;

    return {
      totalOperations: this.healthStats.totalOperations,
      successfulOperations: this.healthStats.successfulOperations,
      failedOperations: this.healthStats.failedOperations,
      successRate,
      averageResponseTime: this.healthStats.averageResponseTime,
      lastHealthCheck: this.healthStats.lastHealthCheck,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<InstrumentedEmailServiceConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Updated instrumentation configuration', {
      operation: 'update_config',
      config: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): InstrumentedEmailServiceConfig {
    return { ...this.config };
  }

  // ============================================================================
  // PRIVATE EXECUTION METHODS
  // ============================================================================

  /**
   * Execute send operation with metrics and logging
   */
  private async executeSend(email: EmailMessage, correlationId: string, startTime: number): Promise<Result<EmailResult>> {
    try {
      const result = await this.wrappedService.send(email);
      const duration = Date.now() - startTime;

      // Update health stats
      this.updateHealthStats(true, duration);

      // Record metrics
      if (this.config.enableMetrics) {
        this.recordDeliveryMetrics(email, result, duration, correlationId);
      }

      if (this.config.enableLogging) {
        if (result.success) {
          this.logger.info('Email send operation completed successfully', {
            operation: 'send',
            correlationId,
            duration,
            messageId: result.data?.messageId,
          });
        } else {
          this.logger.warn('Email send operation failed', {
            operation: 'send',
            correlationId,
            duration,
            error: result.error,
          });
        }
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateHealthStats(false, duration);

      if (this.config.enableLogging) {
        this.logger.error('Email send operation threw exception', error instanceof Error ? error : new Error(String(error)), {
          operation: 'send',
          correlationId,
          duration,
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute send template operation with metrics and logging
   */
  private async executeSendTemplate(templateData: EmailTemplateData, correlationId: string, startTime: number): Promise<Result<EmailResult>> {
    try {
      const result = await this.wrappedService.sendTemplate(templateData);
      const duration = Date.now() - startTime;

      // Update health stats
      this.updateHealthStats(true, duration);

      // Record metrics
      if (this.config.enableMetrics) {
        this.recordTemplateDeliveryMetrics(templateData, result, duration, correlationId);
      }

      if (this.config.enableLogging) {
        if (result.success) {
          this.logger.info('Template email send operation completed successfully', {
            operation: 'send_template',
            templateId: templateData.templateId,
            correlationId,
            duration,
            messageId: result.data?.messageId,
          });
        } else {
          this.logger.warn('Template email send operation failed', {
            operation: 'send_template',
            templateId: templateData.templateId,
            correlationId,
            duration,
            error: result.error,
          });
        }
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateHealthStats(false, duration);

      if (this.config.enableLogging) {
        this.logger.error('Template email send operation threw exception', error instanceof Error ? error : new Error(String(error)), {
          operation: 'send_template',
          templateId: templateData.templateId,
          correlationId,
          duration,
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute send bulk operation with metrics and logging
   */
  private async executeSendBulk(emails: EmailMessage[], correlationId: string, startTime: number): Promise<Result<EmailResult[]>> {
    try {
      const result = await this.wrappedService.sendBulk(emails);
      const duration = Date.now() - startTime;

      // Update health stats
      this.updateHealthStats(result.success, duration);

      // Record metrics for each email
      if (this.config.enableMetrics && result.success && result.data) {
        for (let i = 0; i < emails.length; i++) {
          const email = emails[i];
          const emailResult = result.data[i];
          if (emailResult) {
            this.recordDeliveryMetrics(email, { success: true, data: emailResult }, duration / emails.length, correlationId);
          }
        }
      }

      if (this.config.enableLogging) {
        if (result.success) {
          this.logger.info('Bulk email send operation completed successfully', {
            operation: 'send_bulk',
            emailCount: emails.length,
            correlationId,
            duration,
          });
        } else {
          this.logger.warn('Bulk email send operation failed', {
            operation: 'send_bulk',
            emailCount: emails.length,
            correlationId,
            duration,
            error: result.error,
          });
        }
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateHealthStats(false, duration);

      if (this.config.enableLogging) {
        this.logger.error('Bulk email send operation threw exception', error instanceof Error ? error : new Error(String(error)), {
          operation: 'send_bulk',
          emailCount: emails.length,
          correlationId,
          duration,
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute health check operation with metrics and logging
   */
  private async executeHealthCheck(correlationId: string, startTime: number): Promise<Result<HealthStatus>> {
    try {
      const result = await this.wrappedService.healthCheck();
      const duration = Date.now() - startTime;

      // Update health stats
      this.healthStats.lastHealthCheck = new Date();

      // Record provider health metrics
      if (this.config.enableMetrics && result.success && result.data) {
        const healthContext: EmailProviderHealthContext = {
          provider: this.config.providerName,
          healthy: result.data.healthy,
          responseTime: duration,
          error: result.data.error,
          lastSuccessfulCheck: result.data.healthy ? new Date() : undefined,
        };
        recordProviderHealth(healthContext);

        const performanceContext: EmailProviderPerformanceContext = {
          provider: this.config.providerName,
          responseTime: duration,
          successRate: this.healthStats.totalOperations > 0 
            ? this.healthStats.successfulOperations / this.healthStats.totalOperations 
            : 1,
          errorRate: this.healthStats.totalOperations > 0 
            ? this.healthStats.failedOperations / this.healthStats.totalOperations 
            : 0,
          throughput: 0, // Would need to calculate based on time window
          healthy: result.data.healthy,
        };
        recordEmailProviderPerformance(performanceContext);
      }

      if (this.config.enableLogging) {
        this.logger.debug('Health check operation completed', {
          operation: 'health_check',
          correlationId,
          duration,
          healthy: result.data?.healthy,
        });
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      if (this.config.enableLogging) {
        this.logger.error('Health check operation threw exception', error instanceof Error ? error : new Error(String(error)), {
          operation: 'health_check',
          correlationId,
          duration,
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute render template operation with metrics and logging
   */
  private async executeRenderTemplate(templateId: string, variables: Record<string, unknown>, correlationId: string, startTime: number): Promise<Result<string>> {
    try {
      const result = await this.wrappedService.renderTemplate(templateId, variables);
      const duration = Date.now() - startTime;

      // Record template metrics
      if (this.config.enableMetrics) {
        const templateContext: EmailTemplateOperationContext = {
          operation: 'render',
          templateId,
          format: 'html',
          success: result.success,
          duration,
          variableCount: Object.keys(variables).length,
          templateSize: result.success && result.data ? new TextEncoder().encode(result.data).length : undefined,
        };
        recordTemplateMetrics(templateContext);
      }

      if (this.config.enableLogging) {
        if (result.success) {
          this.logger.debug('Template render operation completed successfully', {
            operation: 'render_template',
            templateId,
            correlationId,
            duration,
            templateSize: result.data ? new TextEncoder().encode(result.data).length : 0,
          });
        } else {
          this.logger.warn('Template render operation failed', {
            operation: 'render_template',
            templateId,
            correlationId,
            duration,
            error: result.error,
          });
        }
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      if (this.config.enableLogging) {
        this.logger.error('Template render operation threw exception', error instanceof Error ? error : new Error(String(error)), {
          operation: 'render_template',
          templateId,
          correlationId,
          duration,
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Calculate message size in bytes
   */
  private calculateMessageSize(email: EmailMessage): number {
    const encoder = new TextEncoder();
    let size = 0;

    // Subject
    if (email.subject) {
      size += encoder.encode(email.subject).length;
    }

    // HTML content
    if (email.html) {
      size += encoder.encode(email.html).length;
    }

    // Text content
    if (email.text) {
      size += encoder.encode(email.text).length;
    }

    // Recipients
    const recipients = Array.isArray(email.to) ? email.to : [email.to];
    for (const recipient of recipients) {
      size += encoder.encode(recipient).length;
    }

    // Attachments
    if (email.attachments) {
      for (const attachment of email.attachments) {
        size += attachment.content.length;
        size += encoder.encode(attachment.filename).length;
        size += encoder.encode(attachment.contentType).length;
      }
    }

    return size;
  }

  /**
   * Update health statistics
   */
  private updateHealthStats(success: boolean, duration: number): void {
    this.healthStats.totalOperations++;
    this.healthStats.totalResponseTime += duration;
    this.healthStats.averageResponseTime = this.healthStats.totalResponseTime / this.healthStats.totalOperations;

    if (success) {
      this.healthStats.successfulOperations++;
    } else {
      this.healthStats.failedOperations++;
    }
  }

  /**
   * Record delivery metrics for regular emails
   */
  private recordDeliveryMetrics(email: EmailMessage, result: Result<EmailResult>, duration: number, correlationId: string): void {
    const deliveryContext: EmailDeliveryMetricsContext = {
      provider: this.config.providerName,
      status: result.success ? 'sent' : 'failed',
      recipientCount: Array.isArray(email.to) ? email.to.length : 1,
      processingTime: duration,
      messageSize: this.calculateMessageSize(email),
      errorType: result.success ? undefined : 'delivery_failure',
    };

    recordEmailDelivery(deliveryContext);
  }

  /**
   * Record delivery metrics for template emails
   */
  private recordTemplateDeliveryMetrics(templateData: EmailTemplateData, result: Result<EmailResult>, duration: number, correlationId: string): void {
    const deliveryContext: EmailDeliveryMetricsContext = {
      provider: this.config.providerName,
      templateId: templateData.templateId,
      status: result.success ? 'sent' : 'failed',
      recipientCount: Array.isArray(templateData.to) ? templateData.to.length : 1,
      processingTime: duration,
      errorType: result.success ? undefined : 'template_delivery_failure',
    };

    recordEmailDelivery(deliveryContext);
  }
}

/**
 * Create an instrumented email service wrapper
 */
export function createInstrumentedEmailService(
  emailService: EmailService,
  config: Partial<InstrumentedEmailServiceConfig> = {}
): InstrumentedEmailService {
  return new InstrumentedEmailService(emailService, config);
}

/**
 * Wrap an existing email service with instrumentation
 */
export function wrapEmailServiceWithInstrumentation(
  emailService: EmailService,
  providerName: string,
  serviceName = 'email-service'
): InstrumentedEmailService {
  return createInstrumentedEmailService(emailService, {
    providerName,
    serviceName,
    enableTracing: true,
    enableMetrics: true,
    enableLogging: true,
    enableHealthMonitoring: true,
  });
}