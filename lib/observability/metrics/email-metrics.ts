/**
 * Email Metrics - Specialized metrics collection for email operations
 * 
 * This module provides:
 * - Email delivery rate tracking
 * - Queue depth monitoring
 * - Processing time metrics
 * - Provider performance metrics
 * - Alerting thresholds
 */

import { metrics } from "npm:@opentelemetry/api@1.7.0";
import type { Meter, Counter, Histogram, UpDownCounter } from "npm:@opentelemetry/api@1.7.0";
import { createComponentLogger } from "../logging/index.ts";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Email delivery metrics context
 */
export interface EmailDeliveryMetricsContext {
  /** Email provider */
  provider: string;
  /** Template ID if applicable */
  templateId?: string;
  /** Delivery status */
  status: 'sent' | 'failed' | 'bounced' | 'queued' | 'retry';
  /** Number of recipients */
  recipientCount: number;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Queue wait time in milliseconds */
  queueWaitTime?: number;
  /** Error type if failed */
  errorType?: string;
  /** Retry attempt number */
  retryAttempt?: number;
  /** Message size in bytes */
  messageSize?: number;
}

/**
 * Email queue depth metrics context
 */
export interface EmailQueueDepthContext {
  /** Queue name */
  queueName: string;
  /** Current depth */
  depth: number;
  /** Queue type */
  queueType: 'main' | 'retry' | 'dead_letter';
  /** Processing rate (messages/second) */
  processingRate?: number;
  /** Average wait time in milliseconds */
  averageWaitTime?: number;
}

/**
 * Email provider performance context
 */
export interface EmailProviderPerformanceContext {
  /** Provider name */
  provider: string;
  /** Response time in milliseconds */
  responseTime: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Throughput (emails/minute) */
  throughput: number;
  /** Health status */
  healthy: boolean;
}

/**
 * Email alerting thresholds
 */
export interface EmailAlertingThresholds {
  /** Maximum failure rate before alerting (0-1) */
  maxFailureRate: number;
  /** Maximum queue depth before alerting */
  maxQueueDepth: number;
  /** Maximum processing time before alerting (ms) */
  maxProcessingTime: number;
  /** Maximum provider response time before alerting (ms) */
  maxProviderResponseTime: number;
  /** Minimum success rate before alerting (0-1) */
  minSuccessRate: number;
  /** Time window for rate calculations (minutes) */
  timeWindowMinutes: number;
}

/**
 * Email alert context
 */
export interface EmailAlertContext {
  /** Alert type */
  type: 'high_failure_rate' | 'queue_depth_exceeded' | 'slow_processing' | 'provider_unhealthy' | 'low_success_rate';
  /** Alert severity */
  severity: 'warning' | 'critical';
  /** Alert message */
  message: string;
  /** Current value that triggered the alert */
  currentValue: number;
  /** Threshold that was exceeded */
  threshold: number;
  /** Provider or queue name */
  source: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Email metrics collector interface
 */
export interface IEmailMetricsCollector {
  /** Record email delivery metrics */
  recordDelivery(context: EmailDeliveryMetricsContext): void;

  /** Record queue depth metrics */
  recordQueueDepth(context: EmailQueueDepthContext): void;

  /** Record provider performance metrics */
  recordProviderPerformance(context: EmailProviderPerformanceContext): void;

  /** Check alerting thresholds */
  checkAlertingThresholds(): EmailAlertContext[];

  /** Get delivery rate statistics */
  getDeliveryRateStats(timeWindowMinutes?: number): {
    totalSent: number;
    totalFailed: number;
    successRate: number;
    failureRate: number;
    averageProcessingTime: number;
  };

  /** Get queue statistics */
  getQueueStats(): {
    mainQueueDepth: number;
    retryQueueDepth: number;
    deadLetterQueueDepth: number;
    totalProcessingRate: number;
    averageWaitTime: number;
  };

  /** Get provider statistics */
  getProviderStats(): Record<string, {
    responseTime: number;
    successRate: number;
    errorRate: number;
    throughput: number;
    healthy: boolean;
  }>;

  /** Set alerting thresholds */
  setAlertingThresholds(thresholds: Partial<EmailAlertingThresholds>): void;

  /** Get alerting thresholds */
  getAlertingThresholds(): EmailAlertingThresholds;

  /** Get collector health */
  getHealth(): {
    healthy: boolean;
    initialized: boolean;
    metricsRecorded: number;
    lastError?: string;
  };

  /** Initialize collector */
  initialize(serviceName: string, serviceVersion: string): Promise<void>;

  /** Shutdown collector */
  shutdown(): Promise<void>;
}

// ============================================================================
// EMAIL METRICS COLLECTOR IMPLEMENTATION
// ============================================================================

/**
 * Default alerting thresholds
 */
const DEFAULT_ALERTING_THRESHOLDS: EmailAlertingThresholds = {
  maxFailureRate: 0.1, // 10%
  maxQueueDepth: 1000,
  maxProcessingTime: 30000, // 30 seconds
  maxProviderResponseTime: 10000, // 10 seconds
  minSuccessRate: 0.95, // 95%
  timeWindowMinutes: 15,
};

/**
 * Email metrics collector implementation
 */
export class EmailMetricsCollector implements IEmailMetricsCollector {
  private meter: Meter | null = null;
  private logger = createComponentLogger('EmailMetricsCollector');
  private initialized = false;
  private metricsRecorded = 0;
  private lastError: string | null = null;
  private alertingThresholds: EmailAlertingThresholds = { ...DEFAULT_ALERTING_THRESHOLDS };

  // Delivery metrics
  private deliveryCounter: Counter | null = null;
  private deliveryDuration: Histogram | null = null;
  private queueWaitTime: Histogram | null = null;
  private messageSize: Histogram | null = null;
  private recipientCount: Histogram | null = null;

  // Queue metrics
  private queueDepthGauge: UpDownCounter | null = null;
  private queueProcessingRate: Histogram | null = null;
  private queueWaitTimeAverage: Histogram | null = null;

  // Provider metrics
  private providerResponseTime: Histogram | null = null;
  private providerSuccessRate: Histogram | null = null;
  private providerThroughput: Histogram | null = null;
  private providerHealthGauge: UpDownCounter | null = null;

  // Alert metrics
  private alertCounter: Counter | null = null;

  // Statistics tracking
  private deliveryStats = new Map<string, {
    sent: number;
    failed: number;
    totalProcessingTime: number;
    lastReset: Date;
  }>();

  private queueStats = {
    mainDepth: 0,
    retryDepth: 0,
    deadLetterDepth: 0,
    processingRate: 0,
    averageWaitTime: 0,
  };

  private providerStats = new Map<string, {
    responseTime: number;
    successRate: number;
    errorRate: number;
    throughput: number;
    healthy: boolean;
    lastUpdate: Date;
  }>();

  /**
   * Initialize email metrics collector
   */
  async initialize(serviceName: string, serviceVersion: string): Promise<void> {
    try {
      this.lastError = null;

      // Get meter from OpenTelemetry
      this.meter = metrics.getMeter(serviceName, serviceVersion);

      // Initialize delivery metrics
      await this.initializeDeliveryMetrics();

      // Initialize queue metrics
      await this.initializeQueueMetrics();

      // Initialize provider metrics
      await this.initializeProviderMetrics();

      // Initialize alert metrics
      await this.initializeAlertMetrics();

      this.initialized = true;
      this.logger.info('Email metrics collector initialized successfully', {
        operation: 'initialize',
        serviceName,
        serviceVersion,
      });

    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to initialize email metrics collector', error instanceof Error ? error : new Error(String(error)), {
        operation: 'initialize',
      });
      throw error;
    }
  }

  /**
   * Initialize delivery metrics
   */
  private async initializeDeliveryMetrics(): Promise<void> {
    if (!this.meter) return;

    this.deliveryCounter = this.meter.createCounter('simplycast_email_deliveries_total', {
      description: 'Total number of email delivery attempts',
      unit: '1',
    });

    this.deliveryDuration = this.meter.createHistogram('simplycast_email_delivery_duration_ms', {
      description: 'Email delivery processing time in milliseconds',
      unit: 'ms',
    });

    this.queueWaitTime = this.meter.createHistogram('simplycast_email_queue_wait_time_ms', {
      description: 'Time emails spend waiting in queue before processing',
      unit: 'ms',
    });

    this.messageSize = this.meter.createHistogram('simplycast_email_message_size_bytes', {
      description: 'Size of email messages in bytes',
      unit: 'By',
    });

    this.recipientCount = this.meter.createHistogram('simplycast_email_recipients_per_message', {
      description: 'Number of recipients per email message',
      unit: '1',
    });
  }

  /**
   * Initialize queue metrics
   */
  private async initializeQueueMetrics(): Promise<void> {
    if (!this.meter) return;

    this.queueDepthGauge = this.meter.createUpDownCounter('simplycast_email_queue_depth_current', {
      description: 'Current depth of email queues',
      unit: '1',
    });

    this.queueProcessingRate = this.meter.createHistogram('simplycast_email_queue_processing_rate', {
      description: 'Email queue processing rate in messages per second',
      unit: '1/s',
    });

    this.queueWaitTimeAverage = this.meter.createHistogram('simplycast_email_queue_average_wait_time_ms', {
      description: 'Average wait time for emails in queue',
      unit: 'ms',
    });
  }

  /**
   * Initialize provider metrics
   */
  private async initializeProviderMetrics(): Promise<void> {
    if (!this.meter) return;

    this.providerResponseTime = this.meter.createHistogram('simplycast_email_provider_response_time_ms', {
      description: 'Email provider response time in milliseconds',
      unit: 'ms',
    });

    this.providerSuccessRate = this.meter.createHistogram('simplycast_email_provider_success_rate', {
      description: 'Email provider success rate (0-1)',
      unit: '1',
    });

    this.providerThroughput = this.meter.createHistogram('simplycast_email_provider_throughput', {
      description: 'Email provider throughput in emails per minute',
      unit: '1/min',
    });

    this.providerHealthGauge = this.meter.createUpDownCounter('simplycast_email_provider_health_status', {
      description: 'Email provider health status (1=healthy, 0=unhealthy)',
      unit: '1',
    });
  }

  /**
   * Initialize alert metrics
   */
  private async initializeAlertMetrics(): Promise<void> {
    if (!this.meter) return;

    this.alertCounter = this.meter.createCounter('simplycast_email_alerts_total', {
      description: 'Total number of email-related alerts triggered',
      unit: '1',
    });
  }

  /**
   * Record email delivery metrics
   */
  recordDelivery(context: EmailDeliveryMetricsContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        provider: context.provider,
        status: context.status,
        ...(context.templateId && { template_id: context.templateId }),
        ...(context.errorType && { error_type: context.errorType }),
        ...(context.retryAttempt && { retry_attempt: context.retryAttempt.toString() }),
      };

      // Record delivery counter
      this.deliveryCounter?.add(1, attributes);

      // Record processing time
      this.deliveryDuration?.record(context.processingTime, attributes);

      // Record queue wait time if available
      if (context.queueWaitTime !== undefined) {
        this.queueWaitTime?.record(context.queueWaitTime, attributes);
      }

      // Record message size if available
      if (context.messageSize !== undefined) {
        this.messageSize?.record(context.messageSize, attributes);
      }

      // Record recipient count
      this.recipientCount?.record(context.recipientCount, attributes);

      // Update internal statistics
      this.updateDeliveryStats(context);

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordDelivery', error);
    }
  }

  /**
   * Record queue depth metrics
   */
  recordQueueDepth(context: EmailQueueDepthContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        queue_name: context.queueName,
        queue_type: context.queueType,
      };

      // Record current queue depth
      this.queueDepthGauge?.add(context.depth, attributes);

      // Record processing rate if available
      if (context.processingRate !== undefined) {
        this.queueProcessingRate?.record(context.processingRate, attributes);
      }

      // Record average wait time if available
      if (context.averageWaitTime !== undefined) {
        this.queueWaitTimeAverage?.record(context.averageWaitTime, attributes);
      }

      // Update internal queue statistics
      this.updateQueueStats(context);

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordQueueDepth', error);
    }
  }

  /**
   * Record provider performance metrics
   */
  recordProviderPerformance(context: EmailProviderPerformanceContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        provider: context.provider,
      };

      // Record provider metrics
      this.providerResponseTime?.record(context.responseTime, attributes);
      this.providerSuccessRate?.record(context.successRate, attributes);
      this.providerThroughput?.record(context.throughput, attributes);
      this.providerHealthGauge?.add(context.healthy ? 1 : 0, attributes);

      // Update internal provider statistics
      this.updateProviderStats(context);

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordProviderPerformance', error);
    }
  }

  /**
   * Check alerting thresholds and return active alerts
   */
  checkAlertingThresholds(): EmailAlertContext[] {
    const alerts: EmailAlertContext[] = [];

    try {
      // Check delivery failure rate
      const deliveryStats = this.getDeliveryRateStats(this.alertingThresholds.timeWindowMinutes);
      if (deliveryStats.failureRate > this.alertingThresholds.maxFailureRate) {
        alerts.push({
          type: 'high_failure_rate',
          severity: deliveryStats.failureRate > this.alertingThresholds.maxFailureRate * 2 ? 'critical' : 'warning',
          message: `Email failure rate (${(deliveryStats.failureRate * 100).toFixed(1)}%) exceeds threshold (${(this.alertingThresholds.maxFailureRate * 100).toFixed(1)}%)`,
          currentValue: deliveryStats.failureRate,
          threshold: this.alertingThresholds.maxFailureRate,
          source: 'delivery_system',
        });
      }

      // Check success rate
      if (deliveryStats.successRate < this.alertingThresholds.minSuccessRate) {
        alerts.push({
          type: 'low_success_rate',
          severity: deliveryStats.successRate < this.alertingThresholds.minSuccessRate * 0.8 ? 'critical' : 'warning',
          message: `Email success rate (${(deliveryStats.successRate * 100).toFixed(1)}%) below threshold (${(this.alertingThresholds.minSuccessRate * 100).toFixed(1)}%)`,
          currentValue: deliveryStats.successRate,
          threshold: this.alertingThresholds.minSuccessRate,
          source: 'delivery_system',
        });
      }

      // Check queue depths
      const queueStats = this.getQueueStats();
      if (queueStats.mainQueueDepth > this.alertingThresholds.maxQueueDepth) {
        alerts.push({
          type: 'queue_depth_exceeded',
          severity: queueStats.mainQueueDepth > this.alertingThresholds.maxQueueDepth * 2 ? 'critical' : 'warning',
          message: `Main queue depth (${queueStats.mainQueueDepth}) exceeds threshold (${this.alertingThresholds.maxQueueDepth})`,
          currentValue: queueStats.mainQueueDepth,
          threshold: this.alertingThresholds.maxQueueDepth,
          source: 'main_queue',
        });
      }

      // Check processing time
      if (deliveryStats.averageProcessingTime > this.alertingThresholds.maxProcessingTime) {
        alerts.push({
          type: 'slow_processing',
          severity: deliveryStats.averageProcessingTime > this.alertingThresholds.maxProcessingTime * 2 ? 'critical' : 'warning',
          message: `Average processing time (${deliveryStats.averageProcessingTime}ms) exceeds threshold (${this.alertingThresholds.maxProcessingTime}ms)`,
          currentValue: deliveryStats.averageProcessingTime,
          threshold: this.alertingThresholds.maxProcessingTime,
          source: 'processing_system',
        });
      }

      // Check provider health
      for (const [provider, stats] of this.providerStats.entries()) {
        if (!stats.healthy || stats.responseTime > this.alertingThresholds.maxProviderResponseTime) {
          alerts.push({
            type: 'provider_unhealthy',
            severity: !stats.healthy ? 'critical' : 'warning',
            message: `Provider ${provider} is ${!stats.healthy ? 'unhealthy' : `slow (${stats.responseTime}ms > ${this.alertingThresholds.maxProviderResponseTime}ms)`}`,
            currentValue: stats.responseTime,
            threshold: this.alertingThresholds.maxProviderResponseTime,
            source: provider,
            metadata: { healthy: stats.healthy, successRate: stats.successRate },
          });
        }
      }

      // Record alert metrics
      for (const alert of alerts) {
        this.alertCounter?.add(1, {
          type: alert.type,
          severity: alert.severity,
          source: alert.source,
        });
      }

    } catch (error) {
      this.handleError('checkAlertingThresholds', error);
    }

    return alerts;
  }

  /**
   * Get delivery rate statistics
   */
  getDeliveryRateStats(timeWindowMinutes = 15): {
    totalSent: number;
    totalFailed: number;
    successRate: number;
    failureRate: number;
    averageProcessingTime: number;
  } {
    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    let totalSent = 0;
    let totalFailed = 0;
    let totalProcessingTime = 0;
    let totalMessages = 0;

    for (const [, stats] of this.deliveryStats.entries()) {
      if (stats.lastReset > cutoffTime) {
        totalSent += stats.sent;
        totalFailed += stats.failed;
        totalProcessingTime += stats.totalProcessingTime;
        totalMessages += stats.sent + stats.failed;
      }
    }

    const successRate = totalMessages > 0 ? totalSent / totalMessages : 1;
    const failureRate = totalMessages > 0 ? totalFailed / totalMessages : 0;
    const averageProcessingTime = totalMessages > 0 ? totalProcessingTime / totalMessages : 0;

    return {
      totalSent,
      totalFailed,
      successRate,
      failureRate,
      averageProcessingTime,
    };
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    mainQueueDepth: number;
    retryQueueDepth: number;
    deadLetterQueueDepth: number;
    totalProcessingRate: number;
    averageWaitTime: number;
  } {
    return {
      mainQueueDepth: this.queueStats.mainDepth,
      retryQueueDepth: this.queueStats.retryDepth,
      deadLetterQueueDepth: this.queueStats.deadLetterDepth,
      totalProcessingRate: this.queueStats.processingRate,
      averageWaitTime: this.queueStats.averageWaitTime,
    };
  }

  /**
   * Get provider statistics
   */
  getProviderStats(): Record<string, {
    responseTime: number;
    successRate: number;
    errorRate: number;
    throughput: number;
    healthy: boolean;
  }> {
    const result: Record<string, any> = {};
    
    for (const [provider, stats] of this.providerStats.entries()) {
      result[provider] = {
        responseTime: stats.responseTime,
        successRate: stats.successRate,
        errorRate: stats.errorRate,
        throughput: stats.throughput,
        healthy: stats.healthy,
      };
    }

    return result;
  }

  /**
   * Set alerting thresholds
   */
  setAlertingThresholds(thresholds: Partial<EmailAlertingThresholds>): void {
    this.alertingThresholds = { ...this.alertingThresholds, ...thresholds };
    this.logger.info('Updated email alerting thresholds', {
      operation: 'setAlertingThresholds',
      thresholds: this.alertingThresholds,
    });
  }

  /**
   * Get alerting thresholds
   */
  getAlertingThresholds(): EmailAlertingThresholds {
    return { ...this.alertingThresholds };
  }

  /**
   * Get collector health
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
   * Shutdown collector
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      this.logger.info('Shutting down email metrics collector');

      // Reset all instruments
      this.deliveryCounter = null;
      this.deliveryDuration = null;
      this.queueWaitTime = null;
      this.messageSize = null;
      this.recipientCount = null;

      this.queueDepthGauge = null;
      this.queueProcessingRate = null;
      this.queueWaitTimeAverage = null;

      this.providerResponseTime = null;
      this.providerSuccessRate = null;
      this.providerThroughput = null;
      this.providerHealthGauge = null;

      this.alertCounter = null;

      // Clear statistics
      this.deliveryStats.clear();
      this.providerStats.clear();

      // Reset state
      this.meter = null;
      this.initialized = false;

      this.logger.info('Email metrics collector shutdown completed');
    } catch (error) {
      this.handleError('shutdown', error);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Update internal delivery statistics
   */
  private updateDeliveryStats(context: EmailDeliveryMetricsContext): void {
    const key = `${context.provider}:${context.templateId || 'default'}`;
    const stats = this.deliveryStats.get(key) || {
      sent: 0,
      failed: 0,
      totalProcessingTime: 0,
      lastReset: new Date(),
    };

    if (context.status === 'sent') {
      stats.sent++;
    } else if (context.status === 'failed' || context.status === 'bounced') {
      stats.failed++;
    }

    stats.totalProcessingTime += context.processingTime;
    stats.lastReset = new Date();

    this.deliveryStats.set(key, stats);
  }

  /**
   * Update internal queue statistics
   */
  private updateQueueStats(context: EmailQueueDepthContext): void {
    switch (context.queueType) {
      case 'main':
        this.queueStats.mainDepth = context.depth;
        break;
      case 'retry':
        this.queueStats.retryDepth = context.depth;
        break;
      case 'dead_letter':
        this.queueStats.deadLetterDepth = context.depth;
        break;
    }

    if (context.processingRate !== undefined) {
      this.queueStats.processingRate = context.processingRate;
    }

    if (context.averageWaitTime !== undefined) {
      this.queueStats.averageWaitTime = context.averageWaitTime;
    }
  }

  /**
   * Update internal provider statistics
   */
  private updateProviderStats(context: EmailProviderPerformanceContext): void {
    this.providerStats.set(context.provider, {
      responseTime: context.responseTime,
      successRate: context.successRate,
      errorRate: context.errorRate,
      throughput: context.throughput,
      healthy: context.healthy,
      lastUpdate: new Date(),
    });
  }

  /**
   * Handle errors consistently
   */
  private handleError(operation: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.lastError = `${operation}: ${errorMessage}`;
    this.logger.error(`EmailMetricsCollector.${operation} failed`, error instanceof Error ? error : new Error(String(error)));
  }
}

// ============================================================================
// SINGLETON INSTANCE AND CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Global email metrics collector instance
 */
export const emailMetricsCollector = new EmailMetricsCollector();

/**
 * Initialize email metrics collector
 */
export async function initializeEmailMetricsCollector(serviceName: string, serviceVersion: string): Promise<void> {
  await emailMetricsCollector.initialize(serviceName, serviceVersion);
}

/**
 * Record email delivery metrics
 */
export function recordEmailDelivery(context: EmailDeliveryMetricsContext): void {
  emailMetricsCollector.recordDelivery(context);
}

/**
 * Record email queue depth metrics
 */
export function recordEmailQueueDepth(context: EmailQueueDepthContext): void {
  emailMetricsCollector.recordQueueDepth(context);
}

/**
 * Record email provider performance metrics
 */
export function recordEmailProviderPerformance(context: EmailProviderPerformanceContext): void {
  emailMetricsCollector.recordProviderPerformance(context);
}

/**
 * Check email alerting thresholds
 */
export function checkEmailAlertingThresholds(): EmailAlertContext[] {
  return emailMetricsCollector.checkAlertingThresholds();
}

/**
 * Get email delivery rate statistics
 */
export function getEmailDeliveryRateStats(timeWindowMinutes?: number): {
  totalSent: number;
  totalFailed: number;
  successRate: number;
  failureRate: number;
  averageProcessingTime: number;
} {
  return emailMetricsCollector.getDeliveryRateStats(timeWindowMinutes);
}

/**
 * Get email queue statistics
 */
export function getEmailQueueStats(): {
  mainQueueDepth: number;
  retryQueueDepth: number;
  deadLetterQueueDepth: number;
  totalProcessingRate: number;
  averageWaitTime: number;
} {
  return emailMetricsCollector.getQueueStats();
}

/**
 * Get email provider statistics
 */
export function getEmailProviderStats(): Record<string, {
  responseTime: number;
  successRate: number;
  errorRate: number;
  throughput: number;
  healthy: boolean;
}> {
  return emailMetricsCollector.getProviderStats();
}

/**
 * Set email alerting thresholds
 */
export function setEmailAlertingThresholds(thresholds: Partial<EmailAlertingThresholds>): void {
  emailMetricsCollector.setAlertingThresholds(thresholds);
}

/**
 * Get email alerting thresholds
 */
export function getEmailAlertingThresholds(): EmailAlertingThresholds {
  return emailMetricsCollector.getAlertingThresholds();
}

/**
 * Get email metrics collector health
 */
export function getEmailMetricsCollectorHealth(): { healthy: boolean; initialized: boolean; metricsRecorded: number; lastError?: string } {
  return emailMetricsCollector.getHealth();
}

/**
 * Shutdown email metrics collector
 */
export async function shutdownEmailMetricsCollector(): Promise<void> {
  await emailMetricsCollector.shutdown();
}