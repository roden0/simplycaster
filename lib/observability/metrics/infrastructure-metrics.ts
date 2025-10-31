/**
 * InfrastructureMetrics - Infrastructure and performance metrics collection
 * 
 * This module provides:
 * - Database connection pool and query performance metrics
 * - Redis cache hit rates and operation latency
 * - System resource usage metrics
 * - Performance monitoring and alerting thresholds
 */

import { metrics } from "npm:@opentelemetry/api@1.7.0";
import type { Meter, Counter, Histogram, UpDownCounter } from "npm:@opentelemetry/api@1.7.0";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Database performance metrics context
 */
export interface DatabasePerformanceContext {
  // Connection pool metrics
  poolSize: number;
  activeConnections: number;
  idleConnections: number;
  waitingConnections: number;
  connectionAcquisitionTime?: number; // milliseconds
  
  // Query performance metrics
  queryType: 'select' | 'insert' | 'update' | 'delete' | 'transaction' | 'migration';
  queryDuration: number; // milliseconds
  queryComplexity?: 'simple' | 'medium' | 'complex';
  rowsReturned?: number;
  rowsAffected?: number;
  
  // Performance indicators
  slowQuery: boolean;
  queryPlan?: string;
  indexUsage?: boolean;
  
  // Error tracking
  success: boolean;
  errorType?: string;
  retryCount?: number;
}

/**
 * Redis performance metrics context
 */
export interface RedisPerformanceContext {
  // Operation metrics
  operation: 'get' | 'set' | 'del' | 'exists' | 'expire' | 'scan' | 'pipeline' | 'transaction';
  operationDuration: number; // milliseconds
  keyPattern?: string;
  
  // Cache performance
  hit: boolean;
  keySize?: number; // bytes
  valueSize?: number; // bytes
  ttl?: number; // seconds
  
  // Connection metrics
  connectionPoolSize: number;
  activeConnections: number;
  connectionLatency?: number; // milliseconds
  
  // Performance indicators
  slowOperation: boolean;
  memoryUsage?: number; // bytes
  evictions?: number;
  
  // Error tracking
  success: boolean;
  errorType?: string;
  retryCount?: number;
}

/**
 * System resource metrics context
 */
export interface SystemResourceContext {
  // CPU metrics
  cpuUsagePercent: number; // 0-100
  cpuLoadAverage1m?: number;
  cpuLoadAverage5m?: number;
  cpuLoadAverage15m?: number;
  
  // Memory metrics
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  memoryAvailableBytes: number;
  memoryBuffersBytes?: number;
  memoryCachedBytes?: number;
  swapUsedBytes?: number;
  swapTotalBytes?: number;
  
  // Disk metrics
  diskUsedBytes: number;
  diskTotalBytes: number;
  diskAvailableBytes: number;
  diskReadBytesPerSec?: number;
  diskWriteBytesPerSec?: number;
  diskReadOpsPerSec?: number;
  diskWriteOpsPerSec?: number;
  
  // Network metrics
  networkRxBytesPerSec?: number;
  networkTxBytesPerSec?: number;
  networkRxPacketsPerSec?: number;
  networkTxPacketsPerSec?: number;
  networkErrorsPerSec?: number;
  
  // Process metrics
  processCount?: number;
  threadCount?: number;
  fileDescriptorCount?: number;
  fileDescriptorLimit?: number;
}

/**
 * Performance threshold configuration
 */
export interface PerformanceThresholds {
  // Database thresholds
  slowQueryThreshold: number; // milliseconds
  connectionPoolUtilizationThreshold: number; // 0-1
  connectionAcquisitionThreshold: number; // milliseconds
  
  // Redis thresholds
  slowRedisOperationThreshold: number; // milliseconds
  cacheHitRateThreshold: number; // 0-1
  redisMemoryThreshold: number; // bytes
  
  // System thresholds
  cpuUsageThreshold: number; // 0-1
  memoryUsageThreshold: number; // 0-1
  diskUsageThreshold: number; // 0-1
  diskIOThreshold: number; // bytes/sec
  networkIOThreshold: number; // bytes/sec
}

/**
 * Infrastructure metrics collector interface
 */
export interface IInfrastructureMetrics {
  // Database metrics
  recordDatabasePerformance(context: DatabasePerformanceContext): void;
  recordConnectionPoolStats(poolSize: number, active: number, idle: number, waiting: number): void;
  recordSlowQuery(duration: number, query: string, table?: string): void;
  
  // Redis metrics
  recordRedisPerformance(context: RedisPerformanceContext): void;
  recordCacheHitRate(hitRate: number, keyPattern?: string): void;
  recordRedisMemoryUsage(usedBytes: number, maxBytes: number): void;
  
  // System metrics
  recordSystemResources(context: SystemResourceContext): void;
  recordResourceAlert(resource: string, value: number, threshold: number): void;
  
  // Performance monitoring
  checkPerformanceThresholds(context: SystemResourceContext & DatabasePerformanceContext & RedisPerformanceContext): void;
  getPerformanceAlerts(): PerformanceAlert[];
  
  // Health and lifecycle
  getInfrastructureHealth(): InfrastructureHealth;
  initialize(serviceName: string, serviceVersion: string, thresholds?: PerformanceThresholds): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Performance alert
 */
export interface PerformanceAlert {
  id: string;
  type: 'database' | 'redis' | 'system';
  severity: 'warning' | 'critical';
  resource: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
}

/**
 * Infrastructure health status
 */
export interface InfrastructureHealth {
  healthy: boolean;
  initialized: boolean;
  metricsRecorded: number;
  activeAlerts: number;
  lastError?: string;
  components: {
    database: boolean;
    redis: boolean;
    system: boolean;
  };
}

// ============================================================================
// INFRASTRUCTURE METRICS IMPLEMENTATION
// ============================================================================

/**
 * InfrastructureMetrics implementation
 */
export class InfrastructureMetrics implements IInfrastructureMetrics {
  private meter: Meter | null = null;
  private initialized = false;
  private metricsRecorded = 0;
  private lastError: string | null = null;
  private thresholds: PerformanceThresholds;
  private alerts: Map<string, PerformanceAlert> = new Map();
  
  // Database metrics
  private dbConnectionPoolGauge: UpDownCounter | null = null;
  private dbQueryDurationHistogram: Histogram | null = null;
  private dbQueryCounter: Counter | null = null;
  private dbSlowQueryCounter: Counter | null = null;
  private dbConnectionAcquisitionHistogram: Histogram | null = null;
  
  // Redis metrics
  private redisOperationDurationHistogram: Histogram | null = null;
  private redisOperationCounter: Counter | null = null;
  private redisCacheHitRateGauge: Histogram | null = null;
  private redisMemoryUsageGauge: UpDownCounter | null = null;
  private redisConnectionPoolGauge: UpDownCounter | null = null;
  
  // System metrics
  private systemCpuUsageGauge: Histogram | null = null;
  private systemMemoryUsageGauge: UpDownCounter | null = null;
  private systemDiskUsageGauge: UpDownCounter | null = null;
  private systemNetworkBytesCounter: Counter | null = null;
  private systemDiskIOCounter: Counter | null = null;
  private systemProcessCountGauge: UpDownCounter | null = null;
  
  // Performance alert metrics
  private performanceAlertCounter: Counter | null = null;
  private thresholdViolationCounter: Counter | null = null;

  constructor(thresholds?: PerformanceThresholds) {
    this.thresholds = thresholds || {
      slowQueryThreshold: 1000,
      connectionPoolUtilizationThreshold: 0.8,
      connectionAcquisitionThreshold: 100,
      slowRedisOperationThreshold: 50,
      cacheHitRateThreshold: 0.8,
      redisMemoryThreshold: 1024 * 1024 * 1024, // 1GB
      cpuUsageThreshold: 0.8,
      memoryUsageThreshold: 0.85,
      diskUsageThreshold: 0.9,
      diskIOThreshold: 100 * 1024 * 1024, // 100MB/s
      networkIOThreshold: 100 * 1024 * 1024, // 100MB/s
    };
  }

  /**
   * Initialize infrastructure metrics
   */
  async initialize(serviceName: string, serviceVersion: string, thresholds?: PerformanceThresholds): Promise<void> {
    try {
      this.lastError = null;
      
      if (thresholds) {
        this.thresholds = thresholds;
      }
      
      // Get meter from OpenTelemetry
      this.meter = metrics.getMeter(serviceName, serviceVersion);
      
      // Initialize database metrics
      await this.initializeDatabaseMetrics();
      
      // Initialize Redis metrics
      await this.initializeRedisMetrics();
      
      // Initialize system metrics
      await this.initializeSystemMetrics();
      
      // Initialize performance alert metrics
      await this.initializeAlertMetrics();
      
      this.initialized = true;
      console.log(`InfrastructureMetrics: Successfully initialized for service '${serviceName}' v${serviceVersion}`);
      
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error('InfrastructureMetrics: Failed to initialize:', this.lastError);
      this.initialized = false;
    }
  }

  /**
   * Initialize database metrics
   */
  private async initializeDatabaseMetrics(): Promise<void> {
    if (!this.meter) return;

    this.dbConnectionPoolGauge = this.meter.createUpDownCounter('simplycast_db_connection_pool', {
      description: 'Database connection pool statistics',
      unit: '1',
    });

    this.dbQueryDurationHistogram = this.meter.createHistogram('simplycast_db_query_duration_ms', {
      description: 'Database query execution duration in milliseconds',
      unit: 'ms',
    });

    this.dbQueryCounter = this.meter.createCounter('simplycast_db_queries_total', {
      description: 'Total number of database queries',
      unit: '1',
    });

    this.dbSlowQueryCounter = this.meter.createCounter('simplycast_db_slow_queries_total', {
      description: 'Total number of slow database queries',
      unit: '1',
    });

    this.dbConnectionAcquisitionHistogram = this.meter.createHistogram('simplycast_db_connection_acquisition_duration_ms', {
      description: 'Time to acquire database connection in milliseconds',
      unit: 'ms',
    });
  }

  /**
   * Initialize Redis metrics
   */
  private async initializeRedisMetrics(): Promise<void> {
    if (!this.meter) return;

    this.redisOperationDurationHistogram = this.meter.createHistogram('simplycast_redis_operation_duration_ms', {
      description: 'Redis operation duration in milliseconds',
      unit: 'ms',
    });

    this.redisOperationCounter = this.meter.createCounter('simplycast_redis_operations_total', {
      description: 'Total number of Redis operations',
      unit: '1',
    });

    this.redisCacheHitRateGauge = this.meter.createHistogram('simplycast_redis_cache_hit_rate', {
      description: 'Redis cache hit rate (0-1)',
      unit: '1',
    });

    this.redisMemoryUsageGauge = this.meter.createUpDownCounter('simplycast_redis_memory_usage_bytes', {
      description: 'Redis memory usage in bytes',
      unit: 'By',
    });

    this.redisConnectionPoolGauge = this.meter.createUpDownCounter('simplycast_redis_connection_pool', {
      description: 'Redis connection pool statistics',
      unit: '1',
    });
  }

  /**
   * Initialize system metrics
   */
  private async initializeSystemMetrics(): Promise<void> {
    if (!this.meter) return;

    this.systemCpuUsageGauge = this.meter.createHistogram('simplycast_system_cpu_usage_percent', {
      description: 'System CPU usage percentage',
      unit: '%',
    });

    this.systemMemoryUsageGauge = this.meter.createUpDownCounter('simplycast_system_memory_bytes', {
      description: 'System memory usage in bytes',
      unit: 'By',
    });

    this.systemDiskUsageGauge = this.meter.createUpDownCounter('simplycast_system_disk_bytes', {
      description: 'System disk usage in bytes',
      unit: 'By',
    });

    this.systemNetworkBytesCounter = this.meter.createCounter('simplycast_system_network_bytes_total', {
      description: 'Total system network bytes transferred',
      unit: 'By',
    });

    this.systemDiskIOCounter = this.meter.createCounter('simplycast_system_disk_io_bytes_total', {
      description: 'Total system disk I/O bytes',
      unit: 'By',
    });

    this.systemProcessCountGauge = this.meter.createUpDownCounter('simplycast_system_processes', {
      description: 'Number of system processes',
      unit: '1',
    });
  }

  /**
   * Initialize performance alert metrics
   */
  private async initializeAlertMetrics(): Promise<void> {
    if (!this.meter) return;

    this.performanceAlertCounter = this.meter.createCounter('simplycast_performance_alerts_total', {
      description: 'Total number of performance alerts generated',
      unit: '1',
    });

    this.thresholdViolationCounter = this.meter.createCounter('simplycast_threshold_violations_total', {
      description: 'Total number of performance threshold violations',
      unit: '1',
    });
  }

  // ============================================================================
  // DATABASE METRICS
  // ============================================================================

  /**
   * Record database performance metrics
   */
  recordDatabasePerformance(context: DatabasePerformanceContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        query_type: context.queryType,
        success: context.success.toString(),
        slow_query: context.slowQuery.toString(),
        ...(context.queryComplexity && { complexity: context.queryComplexity }),
        ...(context.errorType && { error_type: context.errorType }),
        ...(context.indexUsage !== undefined && { index_usage: context.indexUsage.toString() }),
      };

      // Record query metrics
      this.dbQueryCounter?.add(1, attributes);
      this.dbQueryDurationHistogram?.record(context.queryDuration, attributes);

      if (context.slowQuery) {
        this.dbSlowQueryCounter?.add(1, attributes);
      }

      if (context.rowsReturned !== undefined) {
        // Could add a histogram for rows returned if needed
      }

      if (context.connectionAcquisitionTime !== undefined) {
        this.dbConnectionAcquisitionHistogram?.record(context.connectionAcquisitionTime, attributes);
      }

      // Check thresholds
      if (context.queryDuration > this.thresholds.slowQueryThreshold) {
        this.recordThresholdViolation('database', 'slow_query', context.queryDuration, this.thresholds.slowQueryThreshold);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordDatabasePerformance', error);
    }
  }

  /**
   * Record connection pool statistics
   */
  recordConnectionPoolStats(poolSize: number, active: number, idle: number, waiting: number): void {
    if (!this.initialized) return;

    try {
      this.dbConnectionPoolGauge?.add(poolSize, { type: 'total' });
      this.dbConnectionPoolGauge?.add(active, { type: 'active' });
      this.dbConnectionPoolGauge?.add(idle, { type: 'idle' });
      this.dbConnectionPoolGauge?.add(waiting, { type: 'waiting' });

      // Check pool utilization threshold
      const utilization = poolSize > 0 ? active / poolSize : 0;
      if (utilization > this.thresholds.connectionPoolUtilizationThreshold) {
        this.recordThresholdViolation('database', 'pool_utilization', utilization, this.thresholds.connectionPoolUtilizationThreshold);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordConnectionPoolStats', error);
    }
  }

  /**
   * Record slow query
   */
  recordSlowQuery(duration: number, query: string, table?: string): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        duration_ms: duration.toString(),
        ...(table && { table }),
      };

      this.dbSlowQueryCounter?.add(1, attributes);

      // Generate alert for slow query
      this.generateAlert('database', 'critical', 'slow_query', `Slow query detected: ${duration}ms`, duration, this.thresholds.slowQueryThreshold);

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordSlowQuery', error);
    }
  }

  // ============================================================================
  // REDIS METRICS
  // ============================================================================

  /**
   * Record Redis performance metrics
   */
  recordRedisPerformance(context: RedisPerformanceContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        operation: context.operation,
        hit: context.hit.toString(),
        success: context.success.toString(),
        slow_operation: context.slowOperation.toString(),
        ...(context.keyPattern && { key_pattern: context.keyPattern }),
        ...(context.errorType && { error_type: context.errorType }),
      };

      this.redisOperationCounter?.add(1, attributes);
      this.redisOperationDurationHistogram?.record(context.operationDuration, attributes);

      if (context.connectionPoolSize > 0) {
        this.redisConnectionPoolGauge?.add(context.connectionPoolSize, { type: 'total' });
        this.redisConnectionPoolGauge?.add(context.activeConnections, { type: 'active' });
      }

      if (context.memoryUsage !== undefined) {
        this.redisMemoryUsageGauge?.add(context.memoryUsage);
      }

      // Check thresholds
      if (context.operationDuration > this.thresholds.slowRedisOperationThreshold) {
        this.recordThresholdViolation('redis', 'slow_operation', context.operationDuration, this.thresholds.slowRedisOperationThreshold);
      }

      if (context.memoryUsage !== undefined && context.memoryUsage > this.thresholds.redisMemoryThreshold) {
        this.recordThresholdViolation('redis', 'memory_usage', context.memoryUsage, this.thresholds.redisMemoryThreshold);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordRedisPerformance', error);
    }
  }

  /**
   * Record cache hit rate
   */
  recordCacheHitRate(hitRate: number, keyPattern?: string): void {
    if (!this.initialized) return;

    try {
      const attributes = keyPattern ? { key_pattern: keyPattern } : {};
      this.redisCacheHitRateGauge?.record(hitRate, attributes);

      // Check hit rate threshold
      if (hitRate < this.thresholds.cacheHitRateThreshold) {
        this.recordThresholdViolation('redis', 'cache_hit_rate', hitRate, this.thresholds.cacheHitRateThreshold);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordCacheHitRate', error);
    }
  }

  /**
   * Record Redis memory usage
   */
  recordRedisMemoryUsage(usedBytes: number, maxBytes: number): void {
    if (!this.initialized) return;

    try {
      this.redisMemoryUsageGauge?.add(usedBytes, { type: 'used' });
      this.redisMemoryUsageGauge?.add(maxBytes, { type: 'max' });

      const utilization = maxBytes > 0 ? usedBytes / maxBytes : 0;
      if (utilization > 0.9) { // 90% memory utilization
        this.generateAlert('redis', 'warning', 'memory_usage', `Redis memory usage high: ${(utilization * 100).toFixed(1)}%`, usedBytes, maxBytes);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordRedisMemoryUsage', error);
    }
  }

  // ============================================================================
  // SYSTEM METRICS
  // ============================================================================

  /**
   * Record system resource metrics
   */
  recordSystemResources(context: SystemResourceContext): void {
    if (!this.initialized) return;

    try {
      // CPU metrics
      this.systemCpuUsageGauge?.record(context.cpuUsagePercent);

      // Memory metrics
      this.systemMemoryUsageGauge?.add(context.memoryUsedBytes, { type: 'used' });
      this.systemMemoryUsageGauge?.add(context.memoryTotalBytes, { type: 'total' });
      this.systemMemoryUsageGauge?.add(context.memoryAvailableBytes, { type: 'available' });

      // Disk metrics
      this.systemDiskUsageGauge?.add(context.diskUsedBytes, { type: 'used' });
      this.systemDiskUsageGauge?.add(context.diskTotalBytes, { type: 'total' });
      this.systemDiskUsageGauge?.add(context.diskAvailableBytes, { type: 'available' });

      // Network metrics
      if (context.networkRxBytesPerSec !== undefined) {
        this.systemNetworkBytesCounter?.add(context.networkRxBytesPerSec, { direction: 'rx' });
      }
      if (context.networkTxBytesPerSec !== undefined) {
        this.systemNetworkBytesCounter?.add(context.networkTxBytesPerSec, { direction: 'tx' });
      }

      // Disk I/O metrics
      if (context.diskReadBytesPerSec !== undefined) {
        this.systemDiskIOCounter?.add(context.diskReadBytesPerSec, { operation: 'read' });
      }
      if (context.diskWriteBytesPerSec !== undefined) {
        this.systemDiskIOCounter?.add(context.diskWriteBytesPerSec, { operation: 'write' });
      }

      // Process metrics
      if (context.processCount !== undefined) {
        this.systemProcessCountGauge?.add(context.processCount, { type: 'total' });
      }
      if (context.threadCount !== undefined) {
        this.systemProcessCountGauge?.add(context.threadCount, { type: 'threads' });
      }

      // Check system thresholds
      const cpuUsage = context.cpuUsagePercent / 100;
      if (cpuUsage > this.thresholds.cpuUsageThreshold) {
        this.recordThresholdViolation('system', 'cpu_usage', cpuUsage, this.thresholds.cpuUsageThreshold);
      }

      const memoryUsage = context.memoryTotalBytes > 0 ? context.memoryUsedBytes / context.memoryTotalBytes : 0;
      if (memoryUsage > this.thresholds.memoryUsageThreshold) {
        this.recordThresholdViolation('system', 'memory_usage', memoryUsage, this.thresholds.memoryUsageThreshold);
      }

      const diskUsage = context.diskTotalBytes > 0 ? context.diskUsedBytes / context.diskTotalBytes : 0;
      if (diskUsage > this.thresholds.diskUsageThreshold) {
        this.recordThresholdViolation('system', 'disk_usage', diskUsage, this.thresholds.diskUsageThreshold);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordSystemResources', error);
    }
  }

  /**
   * Record resource alert
   */
  recordResourceAlert(resource: string, value: number, threshold: number): void {
    if (!this.initialized) return;

    try {
      this.performanceAlertCounter?.add(1, {
        resource,
        severity: value > threshold * 1.2 ? 'critical' : 'warning',
      });

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordResourceAlert', error);
    }
  }

  // ============================================================================
  // PERFORMANCE MONITORING
  // ============================================================================

  /**
   * Check performance thresholds
   */
  checkPerformanceThresholds(context: SystemResourceContext & DatabasePerformanceContext & RedisPerformanceContext): void {
    // This method would be called periodically to check all thresholds
    // Implementation would depend on how the contexts are structured in practice
    // For now, individual metric recording methods handle threshold checking
  }

  /**
   * Get performance alerts
   */
  getPerformanceAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Record threshold violation
   */
  private recordThresholdViolation(type: string, metric: string, value: number, threshold: number): void {
    this.thresholdViolationCounter?.add(1, {
      type,
      metric,
      severity: value > threshold * 1.2 ? 'critical' : 'warning',
    });
  }

  /**
   * Generate performance alert
   */
  private generateAlert(type: 'database' | 'redis' | 'system', severity: 'warning' | 'critical', resource: string, message: string, value: number, threshold: number): void {
    const alertId = `${type}_${resource}_${Date.now()}`;
    const alert: PerformanceAlert = {
      id: alertId,
      type,
      severity,
      resource,
      message,
      value,
      threshold,
      timestamp: new Date(),
      resolved: false,
    };

    this.alerts.set(alertId, alert);

    // Record alert metric
    this.performanceAlertCounter?.add(1, {
      type,
      severity,
      resource,
    });

    console.warn(`Performance Alert [${severity.toUpperCase()}]: ${message}`);
  }

  // ============================================================================
  // HEALTH AND LIFECYCLE
  // ============================================================================

  /**
   * Get infrastructure health
   */
  getInfrastructureHealth(): InfrastructureHealth {
    const activeAlerts = this.getPerformanceAlerts().length;
    
    return {
      healthy: this.initialized && this.lastError === null && activeAlerts === 0,
      initialized: this.initialized,
      metricsRecorded: this.metricsRecorded,
      activeAlerts,
      lastError: this.lastError || undefined,
      components: {
        database: this.dbQueryCounter !== null,
        redis: this.redisOperationCounter !== null,
        system: this.systemCpuUsageGauge !== null,
      },
    };
  }

  /**
   * Shutdown infrastructure metrics
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      console.log('InfrastructureMetrics: Starting graceful shutdown...');

      // Clear all alerts
      this.alerts.clear();

      // Reset all metric instruments
      this.dbConnectionPoolGauge = null;
      this.dbQueryDurationHistogram = null;
      this.dbQueryCounter = null;
      this.dbSlowQueryCounter = null;
      this.dbConnectionAcquisitionHistogram = null;
      
      this.redisOperationDurationHistogram = null;
      this.redisOperationCounter = null;
      this.redisCacheHitRateGauge = null;
      this.redisMemoryUsageGauge = null;
      this.redisConnectionPoolGauge = null;
      
      this.systemCpuUsageGauge = null;
      this.systemMemoryUsageGauge = null;
      this.systemDiskUsageGauge = null;
      this.systemNetworkBytesCounter = null;
      this.systemDiskIOCounter = null;
      this.systemProcessCountGauge = null;
      
      this.performanceAlertCounter = null;
      this.thresholdViolationCounter = null;

      // Reset state
      this.meter = null;
      this.initialized = false;

      console.log('InfrastructureMetrics: Graceful shutdown completed');
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
    console.error(`InfrastructureMetrics.${operation}:`, errorMessage);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global infrastructure metrics instance
 */
export const infrastructureMetrics = new InfrastructureMetrics();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Initialize infrastructure metrics
 */
export async function initializeInfrastructureMetrics(serviceName: string, serviceVersion: string, thresholds?: PerformanceThresholds): Promise<void> {
  await infrastructureMetrics.initialize(serviceName, serviceVersion, thresholds);
}

/**
 * Record database performance with global collector
 */
export function recordDatabasePerformance(context: DatabasePerformanceContext): void {
  infrastructureMetrics.recordDatabasePerformance(context);
}

/**
 * Record Redis performance with global collector
 */
export function recordRedisPerformance(context: RedisPerformanceContext): void {
  infrastructureMetrics.recordRedisPerformance(context);
}

/**
 * Record system resources with global collector
 */
export function recordSystemResources(context: SystemResourceContext): void {
  infrastructureMetrics.recordSystemResources(context);
}

/**
 * Get infrastructure health
 */
export function getInfrastructureHealth(): InfrastructureHealth {
  return infrastructureMetrics.getInfrastructureHealth();
}

/**
 * Get performance alerts
 */
export function getPerformanceAlerts(): PerformanceAlert[] {
  return infrastructureMetrics.getPerformanceAlerts();
}

/**
 * Shutdown infrastructure metrics
 */
export async function shutdownInfrastructureMetrics(): Promise<void> {
  await infrastructureMetrics.shutdown();
}