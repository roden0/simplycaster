/**
 * Email Instrumentation - OpenTelemetry instrumentation for email operations
 * 
 * This module provides:
 * - Email operation tracing and metrics
 * - Template rendering instrumentation
 * - Queue processing instrumentation
 * - Provider-specific instrumentation
 */

import { trace, metrics, SpanStatusCode, SpanKind } from "npm:@opentelemetry/api@1.7.0";
import type { Span, Tracer, Meter, Counter, Histogram, UpDownCounter } from "npm:@opentelemetry/api@1.7.0";
import { createComponentLogger } from "../logging/index.ts";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Email operation context for instrumentation
 */
export interface EmailOperationContext {
  /** Operation type */
  operation: 'send' | 'send_template' | 'send_bulk' | 'render_template' | 'health_check';
  /** Email provider */
  provider: string;
  /** Template ID if applicable */
  templateId?: string;
  /** Number of recipients */
  recipientCount: number;
  /** Email priority */
  priority?: 'low' | 'normal' | 'high';
  /** Correlation ID */
  correlationId?: string;
  /** User ID */
  userId?: string;
  /** Room ID if applicable */
  roomId?: string;
  /** Success status */
  success: boolean;
  /** Duration in milliseconds */
  duration?: number;
  /** Error type if failed */
  errorType?: string;
  /** Message size in bytes */
  messageSize?: number;
  /** Queue depth if queued */
  queueDepth?: number;
}

/**
 * Email queue operation context
 */
export interface EmailQueueOperationContext {
  /** Queue operation type */
  operation: 'publish' | 'consume' | 'retry' | 'dead_letter';
  /** Queue name */
  queueName: string;
  /** Message ID */
  messageId: string;
  /** Correlation ID */
  correlationId?: string;
  /** Success status */
  success: boolean;
  /** Duration in milliseconds */
  duration?: number;
  /** Error type if failed */
  errorType?: string;
  /** Retry attempt number */
  retryAttempt?: number;
  /** Queue depth */
  queueDepth?: number;
  /** Processing time */
  processingTime?: number;
}

/**
 * Email template operation context
 */
export interface EmailTemplateOperationContext {
  /** Template operation type */
  operation: 'render' | 'validate' | 'cache_hit' | 'cache_miss';
  /** Template ID */
  templateId: string;
  /** Template format */
  format: 'html' | 'text';
  /** Success status */
  success: boolean;
  /** Duration in milliseconds */
  duration?: number;
  /** Error type if failed */
  errorType?: string;
  /** Template size in bytes */
  templateSize?: number;
  /** Variable count */
  variableCount?: number;
}

/**
 * Email provider health context
 */
export interface EmailProviderHealthContext {
  /** Provider name */
  provider: string;
  /** Health status */
  healthy: boolean;
  /** Response time in milliseconds */
  responseTime: number;
  /** Error message if unhealthy */
  error?: string;
  /** Last successful check */
  lastSuccessfulCheck?: Date;
}

/**
 * Email instrumentation interface
 */
export interface IEmailInstrumentation {
  /** Instrument email operation */
  instrumentEmailOperation<T>(
    context: Omit<EmailOperationContext, 'success' | 'duration'>,
    operation: () => Promise<T>
  ): Promise<T>;

  /** Instrument queue operation */
  instrumentQueueOperation<T>(
    context: Omit<EmailQueueOperationContext, 'success' | 'duration'>,
    operation: () => Promise<T>
  ): Promise<T>;

  /** Instrument template operation */
  instrumentTemplateOperation<T>(
    context: Omit<EmailTemplateOperationContext, 'success' | 'duration'>,
    operation: () => Promise<T>
  ): Promise<T>;

  /** Record email metrics */
  recordEmailMetrics(context: EmailOperationContext): void;

  /** Record queue metrics */
  recordQueueMetrics(context: EmailQueueOperationContext): void;

  /** Record template metrics */
  recordTemplateMetrics(context: EmailTemplateOperationContext): void;

  /** Record provider health */
  recordProviderHealth(context: EmailProviderHealthContext): void;

  /** Get instrumentation health */
  getHealth(): {
    healthy: boolean;
    initialized: boolean;
    metricsRecorded: number;
    lastError?: string;
  };

  /** Initialize instrumentation */
  initialize(serviceName: string, serviceVersion: string): Promise<void>;

  /** Shutdown instrumentation */
  shutdown(): Promise<void>;
}

// ============================================================================
// EMAIL INSTRUMENTATION IMPLEMENTATION
// ============================================================================

/**
 * Email instrumentation implementation
 */
export class EmailInstrumentation implements IEmailInstrumentation {
  private tracer: Tracer | null = null;
  private meter: Meter | null = null;
  private logger = createComponentLogger('EmailInstrumentation');
  private initialized = false;
  private metricsRecorded = 0;
  private lastError: string | null = null;

  // Email operation metrics
  private emailOperationCounter: Counter | null = null;
  private emailOperationDuration: Histogram | null = null;
  private emailMessageSize: Histogram | null = null;
  private emailRecipientCount: Histogram | null = null;
  private activeEmailOperations: UpDownCounter | null = null;

  // Queue metrics
  private queueOperationCounter: Counter | null = null;
  private queueOperationDuration: Histogram | null = null;
  private queueDepthGauge: UpDownCounter | null = null;
  private queueProcessingTime: Histogram | null = null;

  // Template metrics
  private templateOperationCounter: Counter | null = null;
  private templateOperationDuration: Histogram | null = null;
  private templateSize: Histogram | null = null;
  private templateCacheHitRate: Histogram | null = null;

  // Provider health metrics
  private providerHealthGauge: UpDownCounter | null = null;
  private providerResponseTime: Histogram | null = null;

  /**
   * Initialize email instrumentation
   */
  async initialize(serviceName: string, serviceVersion: string): Promise<void> {
    try {
      this.lastError = null;

      // Initialize tracer and meter
      this.tracer = trace.getTracer(serviceName, serviceVersion);
      this.meter = metrics.getMeter(serviceName, serviceVersion);

      // Initialize email operation metrics
      await this.initializeEmailMetrics();

      // Initialize queue metrics
      await this.initializeQueueMetrics();

      // Initialize template metrics
      await this.initializeTemplateMetrics();

      // Initialize provider health metrics
      await this.initializeProviderHealthMetrics();

      this.initialized = true;
      this.logger.info('Email instrumentation initialized successfully', {
        operation: 'initialize',
        serviceName,
        serviceVersion,
      });

    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to initialize email instrumentation', error instanceof Error ? error : new Error(String(error)), {
        operation: 'initialize',
      });
      throw error;
    }
  }

  /**
   * Initialize email operation metrics
   */
  private async initializeEmailMetrics(): Promise<void> {
    if (!this.meter) return;

    this.emailOperationCounter = this.meter.createCounter('simplycast_email_operations_total', {
      description: 'Total number of email operations',
      unit: '1',
    });

    this.emailOperationDuration = this.meter.createHistogram('simplycast_email_operation_duration_ms', {
      description: 'Duration of email operations in milliseconds',
      unit: 'ms',
    });

    this.emailMessageSize = this.meter.createHistogram('simplycast_email_message_size_bytes', {
      description: 'Size of email messages in bytes',
      unit: 'By',
    });

    this.emailRecipientCount = this.meter.createHistogram('simplycast_email_recipient_count', {
      description: 'Number of recipients per email',
      unit: '1',
    });

    this.activeEmailOperations = this.meter.createUpDownCounter('simplycast_active_email_operations', {
      description: 'Number of currently active email operations',
      unit: '1',
    });
  }

  /**
   * Initialize queue metrics
   */
  private async initializeQueueMetrics(): Promise<void> {
    if (!this.meter) return;

    this.queueOperationCounter = this.meter.createCounter('simplycast_email_queue_operations_total', {
      description: 'Total number of email queue operations',
      unit: '1',
    });

    this.queueOperationDuration = this.meter.createHistogram('simplycast_email_queue_operation_duration_ms', {
      description: 'Duration of email queue operations in milliseconds',
      unit: 'ms',
    });

    this.queueDepthGauge = this.meter.createUpDownCounter('simplycast_email_queue_depth', {
      description: 'Current depth of email queues',
      unit: '1',
    });

    this.queueProcessingTime = this.meter.createHistogram('simplycast_email_queue_processing_time_ms', {
      description: 'Time to process email messages from queue in milliseconds',
      unit: 'ms',
    });
  }

  /**
   * Initialize template metrics
   */
  private async initializeTemplateMetrics(): Promise<void> {
    if (!this.meter) return;

    this.templateOperationCounter = this.meter.createCounter('simplycast_email_template_operations_total', {
      description: 'Total number of email template operations',
      unit: '1',
    });

    this.templateOperationDuration = this.meter.createHistogram('simplycast_email_template_operation_duration_ms', {
      description: 'Duration of email template operations in milliseconds',
      unit: 'ms',
    });

    this.templateSize = this.meter.createHistogram('simplycast_email_template_size_bytes', {
      description: 'Size of email templates in bytes',
      unit: 'By',
    });

    this.templateCacheHitRate = this.meter.createHistogram('simplycast_email_template_cache_hit_rate', {
      description: 'Email template cache hit rate (0-1)',
      unit: '1',
    });
  }

  /**
   * Initialize provider health metrics
   */
  private async initializeProviderHealthMetrics(): Promise<void> {
    if (!this.meter) return;

    this.providerHealthGauge = this.meter.createUpDownCounter('simplycast_email_provider_health', {
      description: 'Email provider health status (1=healthy, 0=unhealthy)',
      unit: '1',
    });

    this.providerResponseTime = this.meter.createHistogram('simplycast_email_provider_response_time_ms', {
      description: 'Email provider response time in milliseconds',
      unit: 'ms',
    });
  }

  /**
   * Instrument email operation with tracing and metrics
   */
  async instrumentEmailOperation<T>(
    context: Omit<EmailOperationContext, 'success' | 'duration'>,
    operation: () => Promise<T>
  ): Promise<T> {
    if (!this.initialized || !this.tracer) {
      return await operation();
    }

    const spanName = `email.${context.operation}`;
    const startTime = Date.now();

    return await this.tracer.startActiveSpan(spanName, {
      kind: SpanKind.CLIENT,
      attributes: {
        'email.operation': context.operation,
        'email.provider': context.provider,
        'email.recipient_count': context.recipientCount,
        ...(context.templateId && { 'email.template_id': context.templateId }),
        ...(context.priority && { 'email.priority': context.priority }),
        ...(context.correlationId && { 'email.correlation_id': context.correlationId }),
        ...(context.userId && { 'user.id': context.userId }),
        ...(context.roomId && { 'room.id': context.roomId }),
      },
    }, async (span: Span) => {
      // Increment active operations
      this.activeEmailOperations?.add(1, {
        operation: context.operation,
        provider: context.provider,
      });

      try {
        const result = await operation();
        const duration = Date.now() - startTime;

        // Record success
        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttributes({
          'email.success': true,
          'email.duration_ms': duration,
        });

        // Record metrics
        this.recordEmailMetrics({
          ...context,
          success: true,
          duration,
        });

        this.logger.debug('Email operation completed successfully', {
          operation: context.operation,
          provider: context.provider,
          duration,
          correlationId: context.correlationId,
        });

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;
        const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

        // Record error
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.setAttributes({
          'email.success': false,
          'email.duration_ms': duration,
          'email.error_type': errorType,
        });

        // Record metrics
        this.recordEmailMetrics({
          ...context,
          success: false,
          duration,
          errorType,
        });

        this.logger.error('Email operation failed', error instanceof Error ? error : new Error(String(error)), {
          operation: context.operation,
          provider: context.provider,
          duration,
          correlationId: context.correlationId,
        });

        throw error;

      } finally {
        // Decrement active operations
        this.activeEmailOperations?.add(-1, {
          operation: context.operation,
          provider: context.provider,
        });
      }
    });
  }

  /**
   * Instrument queue operation with tracing and metrics
   */
  async instrumentQueueOperation<T>(
    context: Omit<EmailQueueOperationContext, 'success' | 'duration'>,
    operation: () => Promise<T>
  ): Promise<T> {
    if (!this.initialized || !this.tracer) {
      return await operation();
    }

    const spanName = `email.queue.${context.operation}`;
    const startTime = Date.now();

    return await this.tracer.startActiveSpan(spanName, {
      kind: SpanKind.PRODUCER,
      attributes: {
        'email.queue.operation': context.operation,
        'email.queue.name': context.queueName,
        'email.message_id': context.messageId,
        ...(context.correlationId && { 'email.correlation_id': context.correlationId }),
        ...(context.retryAttempt && { 'email.retry_attempt': context.retryAttempt }),
        ...(context.queueDepth && { 'email.queue_depth': context.queueDepth }),
      },
    }, async (span: Span) => {
      try {
        const result = await operation();
        const duration = Date.now() - startTime;

        // Record success
        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttributes({
          'email.queue.success': true,
          'email.queue.duration_ms': duration,
        });

        // Record metrics
        this.recordQueueMetrics({
          ...context,
          success: true,
          duration,
        });

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;
        const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

        // Record error
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.setAttributes({
          'email.queue.success': false,
          'email.queue.duration_ms': duration,
          'email.queue.error_type': errorType,
        });

        // Record metrics
        this.recordQueueMetrics({
          ...context,
          success: false,
          duration,
          errorType,
        });

        throw error;
      }
    });
  }

  /**
   * Instrument template operation with tracing and metrics
   */
  async instrumentTemplateOperation<T>(
    context: Omit<EmailTemplateOperationContext, 'success' | 'duration'>,
    operation: () => Promise<T>
  ): Promise<T> {
    if (!this.initialized || !this.tracer) {
      return await operation();
    }

    const spanName = `email.template.${context.operation}`;
    const startTime = Date.now();

    return await this.tracer.startActiveSpan(spanName, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'email.template.operation': context.operation,
        'email.template.id': context.templateId,
        'email.template.format': context.format,
        ...(context.templateSize && { 'email.template.size_bytes': context.templateSize }),
        ...(context.variableCount && { 'email.template.variable_count': context.variableCount }),
      },
    }, async (span: Span) => {
      try {
        const result = await operation();
        const duration = Date.now() - startTime;

        // Record success
        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttributes({
          'email.template.success': true,
          'email.template.duration_ms': duration,
        });

        // Record metrics
        this.recordTemplateMetrics({
          ...context,
          success: true,
          duration,
        });

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;
        const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

        // Record error
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.setAttributes({
          'email.template.success': false,
          'email.template.duration_ms': duration,
          'email.template.error_type': errorType,
        });

        // Record metrics
        this.recordTemplateMetrics({
          ...context,
          success: false,
          duration,
          errorType,
        });

        throw error;
      }
    });
  }

  /**
   * Record email operation metrics
   */
  recordEmailMetrics(context: EmailOperationContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        operation: context.operation,
        provider: context.provider,
        success: context.success.toString(),
        ...(context.templateId && { template_id: context.templateId }),
        ...(context.priority && { priority: context.priority }),
        ...(context.errorType && { error_type: context.errorType }),
      };

      this.emailOperationCounter?.add(1, attributes);

      if (context.duration !== undefined) {
        this.emailOperationDuration?.record(context.duration, attributes);
      }

      if (context.messageSize !== undefined) {
        this.emailMessageSize?.record(context.messageSize, attributes);
      }

      this.emailRecipientCount?.record(context.recipientCount, attributes);

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordEmailMetrics', error);
    }
  }

  /**
   * Record queue operation metrics
   */
  recordQueueMetrics(context: EmailQueueOperationContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        operation: context.operation,
        queue_name: context.queueName,
        success: context.success.toString(),
        ...(context.errorType && { error_type: context.errorType }),
        ...(context.retryAttempt && { retry_attempt: context.retryAttempt.toString() }),
      };

      this.queueOperationCounter?.add(1, attributes);

      if (context.duration !== undefined) {
        this.queueOperationDuration?.record(context.duration, attributes);
      }

      if (context.queueDepth !== undefined) {
        this.queueDepthGauge?.add(context.queueDepth, { queue_name: context.queueName });
      }

      if (context.processingTime !== undefined) {
        this.queueProcessingTime?.record(context.processingTime, attributes);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordQueueMetrics', error);
    }
  }

  /**
   * Record template operation metrics
   */
  recordTemplateMetrics(context: EmailTemplateOperationContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        operation: context.operation,
        template_id: context.templateId,
        format: context.format,
        success: context.success.toString(),
        ...(context.errorType && { error_type: context.errorType }),
      };

      this.templateOperationCounter?.add(1, attributes);

      if (context.duration !== undefined) {
        this.templateOperationDuration?.record(context.duration, attributes);
      }

      if (context.templateSize !== undefined) {
        this.templateSize?.record(context.templateSize, attributes);
      }

      // Record cache hit rate for cache operations
      if (context.operation === 'cache_hit') {
        this.templateCacheHitRate?.record(1, { template_id: context.templateId });
      } else if (context.operation === 'cache_miss') {
        this.templateCacheHitRate?.record(0, { template_id: context.templateId });
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordTemplateMetrics', error);
    }
  }

  /**
   * Record provider health metrics
   */
  recordProviderHealth(context: EmailProviderHealthContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        provider: context.provider,
      };

      this.providerHealthGauge?.add(context.healthy ? 1 : 0, attributes);
      this.providerResponseTime?.record(context.responseTime, attributes);

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordProviderHealth', error);
    }
  }

  /**
   * Get instrumentation health
   */
  getHealth(): { healthy: boolean; initialized: boolean; metricsRecorded: number; lastError?: string } {
    return {
      healthy: this.initialized && this.lastError === null,
      initialized: this.initialized,
      metricsRecorded: this.metricsRecorded,
      lastError: this.lastError || undefined,
    };
  }

  /**
   * Shutdown instrumentation
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      this.logger.info('Shutting down email instrumentation');

      // Reset all instruments
      this.emailOperationCounter = null;
      this.emailOperationDuration = null;
      this.emailMessageSize = null;
      this.emailRecipientCount = null;
      this.activeEmailOperations = null;

      this.queueOperationCounter = null;
      this.queueOperationDuration = null;
      this.queueDepthGauge = null;
      this.queueProcessingTime = null;

      this.templateOperationCounter = null;
      this.templateOperationDuration = null;
      this.templateSize = null;
      this.templateCacheHitRate = null;

      this.providerHealthGauge = null;
      this.providerResponseTime = null;

      // Reset state
      this.tracer = null;
      this.meter = null;
      this.initialized = false;

      this.logger.info('Email instrumentation shutdown completed');
    } catch (error) {
      this.handleError('shutdown', error);
      throw error;
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(operation: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.lastError = `${operation}: ${errorMessage}`;
    this.logger.error(`EmailInstrumentation.${operation} failed`, error instanceof Error ? error : new Error(String(error)));
  }
}

// ============================================================================
// SINGLETON INSTANCE AND CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Global email instrumentation instance
 */
export const emailInstrumentation = new EmailInstrumentation();

/**
 * Initialize email instrumentation
 */
export async function initializeEmailInstrumentation(serviceName: string, serviceVersion: string): Promise<void> {
  await emailInstrumentation.initialize(serviceName, serviceVersion);
}

/**
 * Instrument email operation
 */
export async function instrumentEmailOperation<T>(
  context: Omit<EmailOperationContext, 'success' | 'duration'>,
  operation: () => Promise<T>
): Promise<T> {
  return await emailInstrumentation.instrumentEmailOperation(context, operation);
}

/**
 * Instrument queue operation
 */
export async function instrumentQueueOperation<T>(
  context: Omit<EmailQueueOperationContext, 'success' | 'duration'>,
  operation: () => Promise<T>
): Promise<T> {
  return await emailInstrumentation.instrumentQueueOperation(context, operation);
}

/**
 * Instrument template operation
 */
export async function instrumentTemplateOperation<T>(
  context: Omit<EmailTemplateOperationContext, 'success' | 'duration'>,
  operation: () => Promise<T>
): Promise<T> {
  return await emailInstrumentation.instrumentTemplateOperation(context, operation);
}

/**
 * Record email metrics
 */
export function recordEmailMetrics(context: EmailOperationContext): void {
  emailInstrumentation.recordEmailMetrics(context);
}

/**
 * Record queue metrics
 */
export function recordQueueMetrics(context: EmailQueueOperationContext): void {
  emailInstrumentation.recordQueueMetrics(context);
}

/**
 * Record template metrics
 */
export function recordTemplateMetrics(context: EmailTemplateOperationContext): void {
  emailInstrumentation.recordTemplateMetrics(context);
}

/**
 * Record provider health
 */
export function recordProviderHealth(context: EmailProviderHealthContext): void {
  emailInstrumentation.recordProviderHealth(context);
}

/**
 * Get email instrumentation health
 */
export function getEmailInstrumentationHealth(): { healthy: boolean; initialized: boolean; metricsRecorded: number; lastError?: string } {
  return emailInstrumentation.getHealth();
}

/**
 * Shutdown email instrumentation
 */
export async function shutdownEmailInstrumentation(): Promise<void> {
  await emailInstrumentation.shutdown();
}