/**
 * Email Observability Initialization
 * 
 * This module provides initialization functions for email observability
 * including instrumentation, metrics collection, and health monitoring.
 */

import { 
  initializeEmailInstrumentation,
  getEmailInstrumentationHealth,
  shutdownEmailInstrumentation,
} from "./instrumentation/email-instrumentation.ts";
import {
  initializeEmailMetricsCollector,
  getEmailMetricsCollectorHealth,
  shutdownEmailMetricsCollector,
  setEmailAlertingThresholds,
  EmailAlertingThresholds,
} from "./metrics/email-metrics.ts";
import { createComponentLogger } from "./logging/index.ts";

/**
 * Email observability configuration
 */
export interface EmailObservabilityConfig {
  /** Service name for instrumentation */
  serviceName: string;
  /** Service version for instrumentation */
  serviceVersion: string;
  /** Enable email instrumentation */
  enableInstrumentation: boolean;
  /** Enable email metrics collection */
  enableMetrics: boolean;
  /** Email alerting thresholds */
  alertingThresholds?: Partial<EmailAlertingThresholds>;
}

/**
 * Default email observability configuration
 */
const DEFAULT_EMAIL_OBSERVABILITY_CONFIG: EmailObservabilityConfig = {
  serviceName: 'simplycast-email',
  serviceVersion: '1.0.0',
  enableInstrumentation: true,
  enableMetrics: true,
  alertingThresholds: {
    maxFailureRate: 0.1, // 10%
    maxQueueDepth: 1000,
    maxProcessingTime: 30000, // 30 seconds
    maxProviderResponseTime: 10000, // 10 seconds
    minSuccessRate: 0.95, // 95%
    timeWindowMinutes: 15,
  },
};

/**
 * Email observability service
 */
export class EmailObservabilityService {
  private logger = createComponentLogger('EmailObservabilityService');
  private config: EmailObservabilityConfig;
  private initialized = false;
  private lastError: string | null = null;

  constructor(config: Partial<EmailObservabilityConfig> = {}) {
    this.config = { ...DEFAULT_EMAIL_OBSERVABILITY_CONFIG, ...config };
  }

  /**
   * Initialize email observability
   */
  async initialize(): Promise<void> {
    try {
      this.lastError = null;

      this.logger.info('Initializing email observability', {
        operation: 'initialize',
        config: this.config,
      });

      // Initialize instrumentation if enabled
      if (this.config.enableInstrumentation) {
        await initializeEmailInstrumentation(
          this.config.serviceName,
          this.config.serviceVersion
        );
        this.logger.info('Email instrumentation initialized');
      }

      // Initialize metrics collection if enabled
      if (this.config.enableMetrics) {
        await initializeEmailMetricsCollector(
          this.config.serviceName,
          this.config.serviceVersion
        );
        this.logger.info('Email metrics collector initialized');

        // Set alerting thresholds if provided
        if (this.config.alertingThresholds) {
          setEmailAlertingThresholds(this.config.alertingThresholds);
          this.logger.info('Email alerting thresholds configured', {
            thresholds: this.config.alertingThresholds,
          });
        }
      }

      this.initialized = true;
      this.logger.info('Email observability initialization completed successfully');

    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to initialize email observability', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get email observability health status
   */
  getHealth(): {
    healthy: boolean;
    initialized: boolean;
    instrumentation: {
      enabled: boolean;
      healthy: boolean;
      initialized: boolean;
      metricsRecorded: number;
      lastError?: string;
    };
    metrics: {
      enabled: boolean;
      healthy: boolean;
      initialized: boolean;
      metricsRecorded: number;
      lastError?: string;
    };
    lastError?: string;
  } {
    const instrumentationHealth = this.config.enableInstrumentation 
      ? getEmailInstrumentationHealth()
      : { healthy: true, initialized: true, metricsRecorded: 0 };

    const metricsHealth = this.config.enableMetrics
      ? getEmailMetricsCollectorHealth()
      : { healthy: true, initialized: true, metricsRecorded: 0 };

    const overallHealthy = this.initialized && 
      instrumentationHealth.healthy && 
      metricsHealth.healthy &&
      this.lastError === null;

    return {
      healthy: overallHealthy,
      initialized: this.initialized,
      instrumentation: {
        enabled: this.config.enableInstrumentation,
        healthy: instrumentationHealth.healthy,
        initialized: instrumentationHealth.initialized,
        metricsRecorded: instrumentationHealth.metricsRecorded,
        lastError: instrumentationHealth.lastError,
      },
      metrics: {
        enabled: this.config.enableMetrics,
        healthy: metricsHealth.healthy,
        initialized: metricsHealth.initialized,
        metricsRecorded: metricsHealth.metricsRecorded,
        lastError: metricsHealth.lastError,
      },
      lastError: this.lastError,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EmailObservabilityConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update alerting thresholds if metrics are enabled and thresholds are provided
    if (this.config.enableMetrics && config.alertingThresholds) {
      setEmailAlertingThresholds(config.alertingThresholds);
    }

    this.logger.info('Email observability configuration updated', {
      operation: 'updateConfig',
      config: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): EmailObservabilityConfig {
    return { ...this.config };
  }

  /**
   * Check if observability is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Shutdown email observability
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      this.logger.info('Shutting down email observability');

      const shutdownPromises: Promise<void>[] = [];

      // Shutdown instrumentation if enabled
      if (this.config.enableInstrumentation) {
        shutdownPromises.push(shutdownEmailInstrumentation());
      }

      // Shutdown metrics collection if enabled
      if (this.config.enableMetrics) {
        shutdownPromises.push(shutdownEmailMetricsCollector());
      }

      await Promise.all(shutdownPromises);

      this.initialized = false;
      this.logger.info('Email observability shutdown completed');

    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error('Error during email observability shutdown', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE AND CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Global email observability service instance
 */
export const emailObservabilityService = new EmailObservabilityService();

/**
 * Initialize email observability with configuration
 */
export async function initializeEmailObservability(config: Partial<EmailObservabilityConfig> = {}): Promise<void> {
  if (Object.keys(config).length > 0) {
    emailObservabilityService.updateConfig(config);
  }
  await emailObservabilityService.initialize();
}

/**
 * Get email observability health status
 */
export function getEmailObservabilityHealth(): ReturnType<EmailObservabilityService['getHealth']> {
  return emailObservabilityService.getHealth();
}

/**
 * Update email observability configuration
 */
export function updateEmailObservabilityConfig(config: Partial<EmailObservabilityConfig>): void {
  emailObservabilityService.updateConfig(config);
}

/**
 * Get email observability configuration
 */
export function getEmailObservabilityConfig(): EmailObservabilityConfig {
  return emailObservabilityService.getConfig();
}

/**
 * Check if email observability is initialized
 */
export function isEmailObservabilityInitialized(): boolean {
  return emailObservabilityService.isInitialized();
}

/**
 * Shutdown email observability
 */
export async function shutdownEmailObservability(): Promise<void> {
  await emailObservabilityService.shutdown();
}

/**
 * Create email observability configuration from environment variables
 */
export function createEmailObservabilityConfigFromEnv(): Partial<EmailObservabilityConfig> {
  return {
    serviceName: Deno.env.get('OTEL_SERVICE_NAME') || 'simplycast-email',
    serviceVersion: Deno.env.get('OTEL_SERVICE_VERSION') || '1.0.0',
    enableInstrumentation: Deno.env.get('EMAIL_OBSERVABILITY_INSTRUMENTATION') !== 'false',
    enableMetrics: Deno.env.get('EMAIL_OBSERVABILITY_METRICS') !== 'false',
    alertingThresholds: {
      maxFailureRate: parseFloat(Deno.env.get('EMAIL_ALERT_MAX_FAILURE_RATE') || '0.1'),
      maxQueueDepth: parseInt(Deno.env.get('EMAIL_ALERT_MAX_QUEUE_DEPTH') || '1000'),
      maxProcessingTime: parseInt(Deno.env.get('EMAIL_ALERT_MAX_PROCESSING_TIME') || '30000'),
      maxProviderResponseTime: parseInt(Deno.env.get('EMAIL_ALERT_MAX_PROVIDER_RESPONSE_TIME') || '10000'),
      minSuccessRate: parseFloat(Deno.env.get('EMAIL_ALERT_MIN_SUCCESS_RATE') || '0.95'),
      timeWindowMinutes: parseInt(Deno.env.get('EMAIL_ALERT_TIME_WINDOW_MINUTES') || '15'),
    },
  };
}