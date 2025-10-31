/**
 * Metrics - Main export file for SimplyCaster metrics collection
 * 
 * This module exports all metrics collection functionality including:
 * - MetricsCollector for application-specific metrics
 * - InfrastructureMetrics for infrastructure and performance metrics
 * - Interfaces and types for metrics contexts
 * - Convenience functions for metrics recording
 */

// Export MetricsCollector interfaces and types
export type {
  RoomMetricsContext,
  WebRTCMetricsContext,
  RecordingMetricsContext,
  DatabaseMetricsContext,
  CacheMetricsContext,
  SystemMetricsContext,
  IMetricsCollector,
} from "./metrics-collector.ts";

// Export MetricsCollector implementation and utilities
export {
  MetricsCollector,
  metricsCollector,
  initializeMetricsCollector,
  recordRoomOperation,
  recordWebRTCOperation,
  recordRecordingOperation,
  recordDatabaseOperation,
  recordCacheOperation,
  recordSystemMetrics,
  getMetricsCollectorHealth,
  shutdownMetricsCollector,
} from "./metrics-collector.ts";

// Export InfrastructureMetrics interfaces and types
export type {
  DatabasePerformanceContext,
  RedisPerformanceContext,
  SystemResourceContext,
  PerformanceThresholds,
  PerformanceAlert,
  InfrastructureHealth,
  IInfrastructureMetrics,
} from "./infrastructure-metrics.ts";

// Export InfrastructureMetrics implementation and utilities
export {
  InfrastructureMetrics,
  infrastructureMetrics,
  initializeInfrastructureMetrics,
  recordDatabasePerformance,
  recordRedisPerformance,
  recordSystemResources,
  getInfrastructureHealth,
  getPerformanceAlerts,
  shutdownInfrastructureMetrics,
} from "./infrastructure-metrics.ts";

// ============================================================================
// UNIFIED METRICS SERVICE
// ============================================================================

import type { ObservabilityConfig } from "../config/observability-config.ts";
import { MetricsCollector } from "./metrics-collector.ts";
import { InfrastructureMetrics } from "./infrastructure-metrics.ts";
import type { PerformanceThresholds } from "./infrastructure-metrics.ts";

/**
 * Unified metrics service health
 */
export interface MetricsServiceHealth {
  healthy: boolean;
  initialized: boolean;
  components: {
    metricsCollector: boolean;
    infrastructureMetrics: boolean;
  };
  totalMetricsRecorded: number;
  activeAlerts: number;
  lastError?: string;
}

/**
 * Unified metrics service for SimplyCaster
 */
export class MetricsService {
  private metricsCollector: MetricsCollector;
  private infrastructureMetrics: InfrastructureMetrics;
  private initialized = false;
  private lastError: string | null = null;

  constructor(thresholds?: PerformanceThresholds) {
    this.metricsCollector = new MetricsCollector();
    this.infrastructureMetrics = new InfrastructureMetrics(thresholds);
  }

  /**
   * Initialize the unified metrics service
   */
  async initialize(config: ObservabilityConfig): Promise<void> {
    try {
      this.lastError = null;

      // Initialize metrics collector
      await this.metricsCollector.initialize(
        config.otel.serviceName,
        config.otel.serviceVersion
      );

      // Initialize infrastructure metrics with thresholds from config
      const thresholds: PerformanceThresholds = {
        slowQueryThreshold: config.simplycast.slowQueryThreshold,
        connectionPoolUtilizationThreshold: 0.8,
        connectionAcquisitionThreshold: 100,
        slowRedisOperationThreshold: 50,
        cacheHitRateThreshold: config.simplycast.cacheMissAlertThreshold,
        redisMemoryThreshold: 1024 * 1024 * 1024, // 1GB
        cpuUsageThreshold: 0.8,
        memoryUsageThreshold: 0.85,
        diskUsageThreshold: 0.9,
        diskIOThreshold: 100 * 1024 * 1024, // 100MB/s
        networkIOThreshold: 100 * 1024 * 1024, // 100MB/s
      };

      await this.infrastructureMetrics.initialize(
        config.otel.serviceName,
        config.otel.serviceVersion,
        thresholds
      );

      this.initialized = true;
      console.log(`MetricsService: Successfully initialized for service '${config.otel.serviceName}' v${config.otel.serviceVersion}`);

    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error('MetricsService: Failed to initialize:', this.lastError);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Get unified service health
   */
  getHealth(): MetricsServiceHealth {
    const metricsCollectorHealth = this.metricsCollector.getCollectorHealth();
    const infrastructureHealth = this.infrastructureMetrics.getInfrastructureHealth();

    return {
      healthy: this.initialized && metricsCollectorHealth.healthy && infrastructureHealth.healthy,
      initialized: this.initialized,
      components: {
        metricsCollector: metricsCollectorHealth.initialized,
        infrastructureMetrics: infrastructureHealth.initialized,
      },
      totalMetricsRecorded: metricsCollectorHealth.metricsRecorded + infrastructureHealth.metricsRecorded,
      activeAlerts: infrastructureHealth.activeAlerts,
      lastError: this.lastError || metricsCollectorHealth.lastError || infrastructureHealth.lastError,
    };
  }

  /**
   * Get metrics collector instance
   */
  getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }

  /**
   * Get infrastructure metrics instance
   */
  getInfrastructureMetrics(): InfrastructureMetrics {
    return this.infrastructureMetrics;
  }

  /**
   * Shutdown the unified metrics service
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      console.log('MetricsService: Starting graceful shutdown...');

      // Shutdown both components
      await Promise.all([
        this.metricsCollector.shutdown(),
        this.infrastructureMetrics.shutdown(),
      ]);

      this.initialized = false;
      console.log('MetricsService: Graceful shutdown completed');

    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error('MetricsService: Error during shutdown:', this.lastError);
      throw error;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global metrics service instance
 */
export const metricsService = new MetricsService();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Initialize the unified metrics service
 */
export async function initializeMetricsService(config: ObservabilityConfig): Promise<void> {
  await metricsService.initialize(config);
}

/**
 * Get unified metrics service health
 */
export function getMetricsServiceHealth(): MetricsServiceHealth {
  return metricsService.getHealth();
}

/**
 * Shutdown the unified metrics service
 */
export async function shutdownMetricsService(): Promise<void> {
  await metricsService.shutdown();
}

// ============================================================================
// DECORATORS AND UTILITIES
// ============================================================================

/**
 * Decorator for automatic metrics recording around methods
 * Note: This is a simplified version that logs metrics instead of recording them
 * to avoid circular dependencies and async issues in decorators
 */
export function metricsRecorded(metricName?: string, metricType: 'counter' | 'histogram' = 'counter') {
  return function <T extends (...args: unknown[]) => unknown>(
    target: Record<string, unknown>,
    propertyKey: string,
    descriptor?: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor?.value || target[propertyKey];
    if (!originalMethod || typeof originalMethod !== 'function') return descriptor;

    const wrappedMethod = function (this: unknown, ...args: unknown[]) {
      const name = metricName || `${(target.constructor as { name?: string })?.name || 'Unknown'}_${propertyKey}_${metricType}`;
      const startTime = Date.now();
      
      try {
        const result = (originalMethod as (...args: unknown[]) => unknown).apply(this, args);
        
        // Log metrics for now - in practice, you would integrate with the metrics collector
        const duration = Date.now() - startTime;
        console.debug(`Metric [${metricType}] ${name}: success, duration: ${duration}ms`);
        
        return result;
      } catch (error) {
        // Log error metrics
        const duration = Date.now() - startTime;
        const errorType = error instanceof Error ? error.constructor.name : 'unknown';
        console.debug(`Metric [${metricType}] ${name}: error (${errorType}), duration: ${duration}ms`);
        
        throw error;
      }
    } as T;

    if (descriptor) {
      descriptor.value = wrappedMethod;
      return descriptor;
    } else {
      target[propertyKey] = wrappedMethod;
    }
  };
}

/**
 * Utility to record room operation metrics with common attributes
 */
export function recordRoomMetrics(operation: string, roomId: string, hostId: string, success: boolean, duration?: number, errorType?: string): void {
  metricsService.getMetricsCollector().recordRoomOperation({
    roomId,
    hostId,
    participantCount: 0, // Would be filled by caller
    maxParticipants: 10, // Would be filled by caller
    allowVideo: true, // Would be filled by caller
    operation: operation as 'create' | 'join' | 'leave' | 'close' | 'kick',
    success,
    duration,
    errorType,
  });
}

/**
 * Utility to record WebRTC operation metrics with common attributes
 */
export function recordWebRTCMetrics(operation: string, roomId: string, participantId: string, success: boolean, duration?: number, errorType?: string): void {
  metricsService.getMetricsCollector().recordWebRTCOperation({
    roomId,
    participantId,
    participantType: 'guest', // Would be determined by caller
    connectionId: `${roomId}_${participantId}`,
    operation: operation as 'signaling' | 'ice_candidate' | 'connection_established' | 'media_stream' | 'quality_check',
    success,
    duration,
    errorType,
  });
}

/**
 * Utility to record database operation metrics with common attributes
 */
export function recordDatabaseMetrics(operation: string, table: string, success: boolean, duration: number, rowsAffected?: number, errorType?: string): void {
  metricsService.getMetricsCollector().recordDatabaseOperation({
    operation: operation as 'select' | 'insert' | 'update' | 'delete' | 'transaction',
    table,
    success,
    duration,
    rowsAffected,
    errorType,
  });
}

/**
 * Utility to record cache operation metrics with common attributes
 */
export function recordCacheMetrics(operation: string, hit: boolean, success: boolean, duration: number, keyPattern?: string, errorType?: string): void {
  metricsService.getMetricsCollector().recordCacheOperation({
    operation: operation as 'get' | 'set' | 'delete' | 'exists' | 'expire',
    keyPattern,
    hit,
    success,
    duration,
    errorType,
  });
}