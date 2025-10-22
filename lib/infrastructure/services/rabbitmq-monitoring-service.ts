/**
 * RabbitMQ Monitoring Service
 * 
 * Provides comprehensive monitoring, metrics collection, and health checks
 * for RabbitMQ event publishing operations.
 */

import { DomainEvent } from '../../domain/types/events.ts';
import { RabbitMQConnectionManager } from './rabbitmq-connection-manager.ts';
import { RabbitMQCircuitBreaker, CircuitBreakerState } from './rabbitmq-circuit-breaker.ts';
import { RabbitMQRetryService } from './rabbitmq-retry-service.ts';
import { RabbitMQDeadLetterService } from './rabbitmq-dead-letter-service.ts';

/**
 * Event publishing metrics
 */
export interface EventPublishingMetrics {
  /** Total events published successfully */
  totalPublished: number;
  
  /** Total events that failed */
  totalFailed: number;
  
  /** Events published by type */
  publishedByType: Record<string, number>;
  
  /** Events failed by type */
  failedByType: Record<string, number>;
  
  /** Events failed by error type */
  failedByError: Record<string, number>;
  
  /** Publishing duration statistics */
  durationStats: {
    min: number;
    max: number;
    average: number;
    p50: number;
    p95: number;
    p99: number;
  };
  
  /** Success rate percentage */
  successRate: number;
  
  /** Events per second (current rate) */
  eventsPerSecond: number;
  
  /** Timestamp of metrics collection */
  timestamp: Date;
}

/**
 * Connection health metrics
 */
export interface ConnectionHealthMetrics {
  /** Is connection healthy */
  isHealthy: boolean;
  
  /** Connection state */
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'error';
  
  /** Number of active channels */
  activeChannels: number;
  
  /** Connection uptime in milliseconds */
  uptimeMs: number;
  
  /** Last connection error */
  lastError?: string;
  
  /** Connection statistics */
  connectionStats: {
    totalConnections: number;
    failedConnections: number;
    reconnections: number;
    lastReconnectTime?: Date;
  };
}

/**
 * Queue depth metrics
 */
export interface QueueDepthMetrics {
  /** Queue name to message count mapping */
  queueDepths: Record<string, number>;
  
  /** Total messages across all queues */
  totalMessages: number;
  
  /** Dead letter queue depth */
  deadLetterQueueDepth: number;
  
  /** Timestamp of measurement */
  timestamp: Date;
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  /** Current state */
  state: CircuitBreakerState;
  
  /** Failure count in current window */
  failureCount: number;
  
  /** Success count in current window */
  successCount: number;
  
  /** Current failure rate */
  failureRate: number;
  
  /** Time until next attempt (if open) */
  nextAttemptTime?: Date;
  
  /** Last state change time */
  lastStateChange?: Date;
}

/**
 * Overall health status
 */
export interface HealthStatus {
  /** Overall health */
  healthy: boolean;
  
  /** Individual component health */
  components: {
    connection: boolean;
    circuitBreaker: boolean;
    deadLetterQueue: boolean;
    retryService: boolean;
  };
  
  /** Health check timestamp */
  timestamp: Date;
  
  /** Any error messages */
  errors: string[];
}

/**
 * Duration measurement for performance tracking
 */
class DurationTracker {
  private durations: number[] = [];
  private maxSamples = 1000;

  addDuration(durationMs: number): void {
    this.durations.push(durationMs);
    
    // Keep only recent samples
    if (this.durations.length > this.maxSamples) {
      this.durations.shift();
    }
  }

  getStats() {
    if (this.durations.length === 0) {
      return {
        min: 0,
        max: 0,
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...this.durations].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      average: sum / sorted.length,
      p50: this.getPercentile(sorted, 0.5),
      p95: this.getPercentile(sorted, 0.95),
      p99: this.getPercentile(sorted, 0.99),
    };
  }

  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  clear(): void {
    this.durations = [];
  }
}

/**
 * Rate calculator for events per second
 */
class RateCalculator {
  private events: Date[] = [];
  private windowMs = 60000; // 1 minute window

  recordEvent(): void {
    const now = new Date();
    this.events.push(now);
    
    // Remove events outside the window
    const cutoff = new Date(now.getTime() - this.windowMs);
    this.events = this.events.filter(event => event > cutoff);
  }

  getRate(): number {
    return this.events.length / (this.windowMs / 1000);
  }

  clear(): void {
    this.events = [];
  }
}

/**
 * RabbitMQ Monitoring Service
 */
export class RabbitMQMonitoringService {
  private metrics: EventPublishingMetrics;
  private durationTracker = new DurationTracker();
  private rateCalculator = new RateCalculator();
  private startTime = new Date();

  constructor(
    private connectionManager: RabbitMQConnectionManager,
    private circuitBreaker?: RabbitMQCircuitBreaker,
    private retryService?: RabbitMQRetryService,
    private deadLetterService?: RabbitMQDeadLetterService
  ) {
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize metrics with default values
   */
  private initializeMetrics(): EventPublishingMetrics {
    return {
      totalPublished: 0,
      totalFailed: 0,
      publishedByType: {},
      failedByType: {},
      failedByError: {},
      durationStats: {
        min: 0,
        max: 0,
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      },
      successRate: 0,
      eventsPerSecond: 0,
      timestamp: new Date(),
    };
  }

  /**
   * Record successful event publication
   */
  recordPublishSuccess(event: DomainEvent, durationMs: number): void {
    this.metrics.totalPublished++;
    this.metrics.publishedByType[event.type] = (this.metrics.publishedByType[event.type] || 0) + 1;
    
    this.durationTracker.addDuration(durationMs);
    this.rateCalculator.recordEvent();
    
    this.updateDerivedMetrics();
    
    console.log(`📊 Event published: ${event.type} (${event.id}) in ${durationMs}ms`);
  }

  /**
   * Record failed event publication
   */
  recordPublishFailure(event: DomainEvent, error: Error, durationMs: number): void {
    this.metrics.totalFailed++;
    this.metrics.failedByType[event.type] = (this.metrics.failedByType[event.type] || 0) + 1;
    
    const errorType = this.classifyError(error);
    this.metrics.failedByError[errorType] = (this.metrics.failedByError[errorType] || 0) + 1;
    
    this.durationTracker.addDuration(durationMs);
    this.rateCalculator.recordEvent();
    
    this.updateDerivedMetrics();
    
    console.error(`📊 Event failed: ${event.type} (${event.id}) after ${durationMs}ms - ${error.message}`);
  }

  /**
   * Classify error for metrics
   */
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('validation')) return 'validation_error';
    if (message.includes('serialization')) return 'serialization_error';
    if (message.includes('connection')) return 'connection_error';
    if (message.includes('timeout')) return 'timeout_error';
    if (message.includes('circuit breaker')) return 'circuit_breaker_error';
    if (message.includes('authentication')) return 'auth_error';
    if (message.includes('authorization')) return 'auth_error';
    if (message.includes('not found')) return 'not_found_error';
    
    return 'unknown_error';
  }

  /**
   * Update derived metrics
   */
  private updateDerivedMetrics(): void {
    const total = this.metrics.totalPublished + this.metrics.totalFailed;
    this.metrics.successRate = total > 0 ? (this.metrics.totalPublished / total) * 100 : 0;
    this.metrics.eventsPerSecond = this.rateCalculator.getRate();
    this.metrics.durationStats = this.durationTracker.getStats();
    this.metrics.timestamp = new Date();
  }

  /**
   * Get current event publishing metrics
   */
  getEventMetrics(): EventPublishingMetrics {
    this.updateDerivedMetrics();
    return { ...this.metrics };
  }

  /**
   * Get connection health metrics
   */
  async getConnectionMetrics(): Promise<ConnectionHealthMetrics> {
    const connectionStats = this.connectionManager.getStats();
    const health = await this.connectionManager.getHealth();
    
    return {
      isHealthy: health.healthy,
      connectionState: health.connected ? 'connected' : 'disconnected',
      activeChannels: connectionStats.activeChannels,
      uptimeMs: Date.now() - this.startTime.getTime(),
      lastError: health.error,
      connectionStats: {
        totalConnections: connectionStats.totalConnections,
        failedConnections: connectionStats.failedConnections,
        reconnections: connectionStats.reconnections,
        lastReconnectTime: connectionStats.lastReconnectTime,
      },
    };
  }

  /**
   * Get queue depth metrics
   */
  async getQueueMetrics(): Promise<QueueDepthMetrics> {
    const queueDepths: Record<string, number> = {};
    let totalMessages = 0;
    let deadLetterQueueDepth = 0;

    try {
      const channel = this.connectionManager.getPublishChannel();
      
      // Check main queues
      const queueNames = [
        'rooms_queue',
        'recordings_queue',
        'users_queue',
        'feed_queue',
      ];

      for (const queueName of queueNames) {
        try {
          const queueInfo = await channel.checkQueue(queueName);
          queueDepths[queueName] = queueInfo.messageCount;
          totalMessages += queueInfo.messageCount;
        } catch (error) {
          // Queue might not exist yet
          queueDepths[queueName] = 0;
        }
      }

      // Check dead letter queue
      if (this.deadLetterService) {
        const dlqHealth = await this.deadLetterService.getHealth();
        deadLetterQueueDepth = dlqHealth.queueDepth || 0;
        totalMessages += deadLetterQueueDepth;
      }
    } catch (error) {
      console.warn('⚠️ Failed to get queue metrics:', error);
    }

    return {
      queueDepths,
      totalMessages,
      deadLetterQueueDepth,
      timestamp: new Date(),
    };
  }

  /**
   * Get circuit breaker metrics
   */
  getCircuitBreakerMetrics(): CircuitBreakerMetrics | null {
    if (!this.circuitBreaker) {
      return null;
    }

    const stats = this.circuitBreaker.getStats();
    
    return {
      state: stats.state,
      failureCount: stats.failureCount,
      successCount: stats.successCount,
      failureRate: stats.failureRate,
      nextAttemptTime: stats.nextAttemptTime,
      lastStateChange: stats.lastFailureTime || stats.lastSuccessTime,
    };
  }

  /**
   * Get overall health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const errors: string[] = [];
    const components = {
      connection: false,
      circuitBreaker: false,
      deadLetterQueue: false,
      retryService: false,
    };

    // Check connection health
    try {
      const connectionHealth = await this.connectionManager.getHealth();
      components.connection = connectionHealth.healthy;
      if (!connectionHealth.healthy && connectionHealth.error) {
        errors.push(`Connection: ${connectionHealth.error}`);
      }
    } catch (error) {
      errors.push(`Connection check failed: ${error}`);
    }

    // Check circuit breaker health
    if (this.circuitBreaker) {
      components.circuitBreaker = this.circuitBreaker.isHealthy();
      if (!components.circuitBreaker) {
        const state = this.circuitBreaker.getState();
        errors.push(`Circuit breaker is ${state}`);
      }
    } else {
      components.circuitBreaker = true; // No circuit breaker is considered healthy
    }

    // Check dead letter queue health
    if (this.deadLetterService) {
      try {
        const dlqHealth = await this.deadLetterService.getHealth();
        components.deadLetterQueue = dlqHealth.healthy;
        if (!dlqHealth.healthy && dlqHealth.error) {
          errors.push(`Dead letter queue: ${dlqHealth.error}`);
        }
      } catch (error) {
        errors.push(`Dead letter queue check failed: ${error}`);
      }
    } else {
      components.deadLetterQueue = true; // No DLQ service is considered healthy
    }

    // Check retry service health
    if (this.retryService) {
      components.retryService = this.retryService.isHealthy();
      if (!components.retryService) {
        errors.push('Retry service has too many stuck events');
      }
    } else {
      components.retryService = true; // No retry service is considered healthy
    }

    const healthy = Object.values(components).every(Boolean);

    return {
      healthy,
      components,
      timestamp: new Date(),
      errors,
    };
  }

  /**
   * Get comprehensive monitoring report
   */
  async getMonitoringReport(): Promise<{
    eventMetrics: EventPublishingMetrics;
    connectionMetrics: ConnectionHealthMetrics;
    queueMetrics: QueueDepthMetrics;
    circuitBreakerMetrics: CircuitBreakerMetrics | null;
    healthStatus: HealthStatus;
    retryStats?: any;
    deadLetterStats?: any;
  }> {
    const [
      eventMetrics,
      connectionMetrics,
      queueMetrics,
      healthStatus,
    ] = await Promise.all([
      Promise.resolve(this.getEventMetrics()),
      this.getConnectionMetrics(),
      this.getQueueMetrics(),
      this.getHealthStatus(),
    ]);

    const circuitBreakerMetrics = this.getCircuitBreakerMetrics();
    const retryStats = this.retryService?.getRetryStats();
    const deadLetterStats = this.deadLetterService?.getStats();

    return {
      eventMetrics,
      connectionMetrics,
      queueMetrics,
      circuitBreakerMetrics,
      healthStatus,
      retryStats,
      deadLetterStats,
    };
  }

  /**
   * Reset metrics (for testing or periodic reset)
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
    this.durationTracker.clear();
    this.rateCalculator.clear();
    this.startTime = new Date();
    
    console.log('📊 Monitoring metrics reset');
  }

  /**
   * Log structured monitoring data
   */
  async logMonitoringData(): Promise<void> {
    const report = await this.getMonitoringReport();
    
    console.log('📊 RabbitMQ Monitoring Report:', JSON.stringify({
      timestamp: new Date().toISOString(),
      ...report,
    }, null, 2));
  }

  /**
   * Start periodic monitoring (logs metrics every interval)
   */
  startPeriodicMonitoring(intervalMs = 60000): NodeJS.Timeout {
    console.log(`📊 Starting periodic monitoring every ${intervalMs}ms`);
    
    return setInterval(async () => {
      try {
        await this.logMonitoringData();
      } catch (error) {
        console.error('❌ Failed to log monitoring data:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic monitoring
   */
  stopPeriodicMonitoring(intervalId: NodeJS.Timeout): void {
    clearInterval(intervalId);
    console.log('📊 Stopped periodic monitoring');
  }
}

/**
 * Factory function to create monitoring service
 */
export function createMonitoringService(
  connectionManager: RabbitMQConnectionManager,
  circuitBreaker?: RabbitMQCircuitBreaker,
  retryService?: RabbitMQRetryService,
  deadLetterService?: RabbitMQDeadLetterService
): RabbitMQMonitoringService {
  return new RabbitMQMonitoringService(
    connectionManager,
    circuitBreaker,
    retryService,
    deadLetterService
  );
}