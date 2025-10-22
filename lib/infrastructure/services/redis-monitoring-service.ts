/**
 * Redis Monitoring Service
 * 
 * Provides comprehensive monitoring, metrics collection, and health checks
 * for Redis operations with performance tracking and alerting capabilities.
 */

import { RedisConnectionManager, ConnectionHealth } from './redis-connection-manager.ts';
import { RedisService } from '../../domain/services/redis-service.ts';

export interface RedisMetrics {
  // Connection metrics
  connectionHealth: ConnectionHealth;
  uptime: number; // milliseconds since connection
  
  // Performance metrics
  operationCounts: {
    get: number;
    set: number;
    del: number;
    hget: number;
    hset: number;
    publish: number;
    subscribe: number;
    total: number;
  };
  
  // Response time metrics (in milliseconds)
  responseTime: {
    average: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  };
  
  // Cache performance
  cacheHitRate: number; // percentage
  cacheHits: number;
  cacheMisses: number;
  
  // Error tracking
  errorCount: number;
  lastError?: {
    message: string;
    timestamp: Date;
    operation: string;
  };
  
  // Memory and performance
  memoryUsage?: {
    used: number;
    peak: number;
    fragmentation: number;
  };
  
  // Rate limiting metrics
  rateLimitChecks: number;
  rateLimitBlocks: number;
  
  // Real-time metrics
  connectionsActive: number;
  commandsProcessed: number;
  
  // Collection timestamp
  timestamp: Date;
}

export interface PerformanceAlert {
  type: 'connection' | 'performance' | 'error' | 'memory';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  metrics?: Partial<RedisMetrics>;
}

export interface MonitoringConfig {
  metricsCollectionInterval: number; // milliseconds
  performanceAlertThresholds: {
    responseTimeMs: number;
    errorRatePercent: number;
    cacheHitRatePercent: number;
    memoryUsagePercent: number;
  };
  enableSlowQueryLogging: boolean;
  slowQueryThresholdMs: number;
  retainMetricsHours: number;
}

export class RedisMonitoringService {
  private connectionManager: RedisConnectionManager;
  private redisService: RedisService;
  private config: MonitoringConfig;
  
  // Metrics storage
  private metrics: RedisMetrics;
  private responseTimes: number[] = [];
  private metricsHistory: RedisMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  
  // Timers
  private metricsTimer?: number;
  private cleanupTimer?: number;
  
  // Performance tracking
  private operationStartTimes = new Map<string, number>();
  
  constructor(
    connectionManager: RedisConnectionManager,
    redisService: RedisService,
    config: Partial<MonitoringConfig> = {}
  ) {
    this.connectionManager = connectionManager;
    this.redisService = redisService;
    this.config = {
      metricsCollectionInterval: 30000, // 30 seconds
      performanceAlertThresholds: {
        responseTimeMs: 100,
        errorRatePercent: 5,
        cacheHitRatePercent: 80,
        memoryUsagePercent: 85,
      },
      enableSlowQueryLogging: true,
      slowQueryThresholdMs: 50,
      retainMetricsHours: 24,
      ...config,
    };
    
    this.initializeMetrics();
  }

  /**
   * Start monitoring Redis operations
   */
  startMonitoring(): void {
    console.log('Starting Redis monitoring service...');
    
    // Start metrics collection
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsCollectionInterval);
    
    // Start cleanup timer (run every hour)
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000);
    
    // Initial metrics collection
    this.collectMetrics();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    console.log('Stopping Redis monitoring service...');
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): RedisMetrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(hours: number = 1): RedisMetrics[] {
    const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
    return this.metricsHistory.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    const oneHourAgo = new Date(Date.now() - 3600000);
    return this.alerts.filter(alert => alert.timestamp >= oneHourAgo);
  }

  /**
   * Track operation start time
   */
  trackOperationStart(operationId: string, operation: string): void {
    this.operationStartTimes.set(operationId, Date.now());
  }

  /**
   * Track operation completion
   */
  trackOperationEnd(operationId: string, operation: string, success: boolean, error?: Error): void {
    const startTime = this.operationStartTimes.get(operationId);
    if (!startTime) return;
    
    const duration = Date.now() - startTime;
    this.operationStartTimes.delete(operationId);
    
    // Update operation counts
    if (operation in this.metrics.operationCounts) {
      (this.metrics.operationCounts as any)[operation]++;
    }
    this.metrics.operationCounts.total++;
    
    // Track response times
    this.responseTimes.push(duration);
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000); // Keep last 1000
    }
    
    // Update response time metrics
    this.updateResponseTimeMetrics();
    
    // Track errors
    if (!success && error) {
      this.metrics.errorCount++;
      this.metrics.lastError = {
        message: error.message,
        timestamp: new Date(),
        operation,
      };
    }
    
    // Log slow queries
    if (this.config.enableSlowQueryLogging && duration > this.config.slowQueryThresholdMs) {
      console.warn(`Slow Redis operation detected: ${operation} took ${duration}ms`);
    }
    
    // Check for performance alerts
    this.checkPerformanceAlerts();
  }

  /**
   * Track cache hit/miss
   */
  trackCacheOperation(hit: boolean): void {
    if (hit) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }
    
    // Update hit rate
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    this.metrics.cacheHitRate = total > 0 ? (this.metrics.cacheHits / total) * 100 : 0;
  }

  /**
   * Track rate limiting operation
   */
  trackRateLimitOperation(blocked: boolean): void {
    this.metrics.rateLimitChecks++;
    if (blocked) {
      this.metrics.rateLimitBlocks++;
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    checks: Record<string, { status: 'pass' | 'fail'; message?: string; duration?: number }>;
  }> {
    const checks: Record<string, { status: 'pass' | 'fail'; message?: string; duration?: number }> = {};
    let healthy = true;

    // Connection health check
    try {
      const startTime = Date.now();
      const pingResult = await this.redisService.ping();
      const duration = Date.now() - startTime;
      
      checks.connection = {
        status: pingResult ? 'pass' : 'fail',
        message: pingResult ? 'Redis connection is healthy' : 'Redis ping failed',
        duration,
      };
      
      if (!pingResult) healthy = false;
    } catch (error) {
      checks.connection = {
        status: 'fail',
        message: `Connection check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      healthy = false;
    }

    // Memory usage check (if available)
    try {
      const memoryInfo = await this.getRedisMemoryInfo();
      if (memoryInfo) {
        const memoryUsagePercent = (memoryInfo.used / memoryInfo.peak) * 100;
        checks.memory = {
          status: memoryUsagePercent < this.config.performanceAlertThresholds.memoryUsagePercent ? 'pass' : 'fail',
          message: `Memory usage: ${memoryUsagePercent.toFixed(1)}%`,
        };
        
        if (memoryUsagePercent >= this.config.performanceAlertThresholds.memoryUsagePercent) {
          healthy = false;
        }
      }
    } catch (error) {
      checks.memory = {
        status: 'fail',
        message: `Memory check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Performance check
    const avgResponseTime = this.metrics.responseTime.average;
    checks.performance = {
      status: avgResponseTime < this.config.performanceAlertThresholds.responseTimeMs ? 'pass' : 'fail',
      message: `Average response time: ${avgResponseTime.toFixed(2)}ms`,
    };
    
    if (avgResponseTime >= this.config.performanceAlertThresholds.responseTimeMs) {
      healthy = false;
    }

    // Cache hit rate check
    checks.cacheHitRate = {
      status: this.metrics.cacheHitRate >= this.config.performanceAlertThresholds.cacheHitRatePercent ? 'pass' : 'fail',
      message: `Cache hit rate: ${this.metrics.cacheHitRate.toFixed(1)}%`,
    };
    
    if (this.metrics.cacheHitRate < this.config.performanceAlertThresholds.cacheHitRatePercent) {
      healthy = false;
    }

    return { healthy, checks };
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): void {
    this.metrics = {
      connectionHealth: this.connectionManager.getHealth(),
      uptime: 0,
      operationCounts: {
        get: 0,
        set: 0,
        del: 0,
        hget: 0,
        hset: 0,
        publish: 0,
        subscribe: 0,
        total: 0,
      },
      responseTime: {
        average: 0,
        min: 0,
        max: 0,
        p95: 0,
        p99: 0,
      },
      cacheHitRate: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errorCount: 0,
      rateLimitChecks: 0,
      rateLimitBlocks: 0,
      connectionsActive: 0,
      commandsProcessed: 0,
      timestamp: new Date(),
    };
  }

  /**
   * Collect current metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      // Update connection health
      this.metrics.connectionHealth = this.connectionManager.getHealth();
      
      // Update uptime
      if (this.metrics.connectionHealth.connectionTime) {
        this.metrics.uptime = Date.now() - this.metrics.connectionHealth.connectionTime.getTime();
      }
      
      // Update memory usage if available
      const memoryInfo = await this.getRedisMemoryInfo();
      if (memoryInfo) {
        this.metrics.memoryUsage = memoryInfo;
      }
      
      // Update timestamp
      this.metrics.timestamp = new Date();
      
      // Store in history
      this.metricsHistory.push({ ...this.metrics });
      
      // Check for alerts
      this.checkPerformanceAlerts();
      
    } catch (error) {
      console.error('Error collecting Redis metrics:', error);
    }
  }

  /**
   * Update response time metrics from collected data
   */
  private updateResponseTimeMetrics(): void {
    if (this.responseTimes.length === 0) {
      return;
    }
    
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    this.metrics.responseTime = {
      average: sum / sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Get Redis memory information
   */
  private async getRedisMemoryInfo(): Promise<{ used: number; peak: number; fragmentation: number } | null> {
    try {
      const client = this.connectionManager.getClient();
      const info = await client.info('memory');
      
      const lines = info.split('\r\n');
      const memoryData: Record<string, string> = {};
      
      for (const line of lines) {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          memoryData[key] = value;
        }
      }
      
      return {
        used: parseInt(memoryData.used_memory || '0'),
        peak: parseInt(memoryData.used_memory_peak || '0'),
        fragmentation: parseFloat(memoryData.mem_fragmentation_ratio || '1'),
      };
    } catch (error) {
      console.warn('Could not retrieve Redis memory info:', error);
      return null;
    }
  }

  /**
   * Check for performance alerts
   */
  private checkPerformanceAlerts(): void {
    const now = new Date();
    
    // Response time alert
    if (this.metrics.responseTime.average > this.config.performanceAlertThresholds.responseTimeMs) {
      this.addAlert({
        type: 'performance',
        severity: this.metrics.responseTime.average > this.config.performanceAlertThresholds.responseTimeMs * 2 ? 'high' : 'medium',
        message: `High average response time: ${this.metrics.responseTime.average.toFixed(2)}ms`,
        timestamp: now,
        metrics: { responseTime: this.metrics.responseTime },
      });
    }
    
    // Cache hit rate alert
    if (this.metrics.cacheHitRate < this.config.performanceAlertThresholds.cacheHitRatePercent) {
      this.addAlert({
        type: 'performance',
        severity: this.metrics.cacheHitRate < this.config.performanceAlertThresholds.cacheHitRatePercent * 0.5 ? 'high' : 'medium',
        message: `Low cache hit rate: ${this.metrics.cacheHitRate.toFixed(1)}%`,
        timestamp: now,
        metrics: { cacheHitRate: this.metrics.cacheHitRate },
      });
    }
    
    // Connection alert
    if (!this.metrics.connectionHealth.isConnected) {
      this.addAlert({
        type: 'connection',
        severity: 'critical',
        message: 'Redis connection is down',
        timestamp: now,
        metrics: { connectionHealth: this.metrics.connectionHealth },
      });
    }
    
    // Memory usage alert
    if (this.metrics.memoryUsage) {
      const memoryUsagePercent = (this.metrics.memoryUsage.used / this.metrics.memoryUsage.peak) * 100;
      if (memoryUsagePercent > this.config.performanceAlertThresholds.memoryUsagePercent) {
        this.addAlert({
          type: 'memory',
          severity: memoryUsagePercent > 95 ? 'critical' : 'high',
          message: `High memory usage: ${memoryUsagePercent.toFixed(1)}%`,
          timestamp: now,
          metrics: { memoryUsage: this.metrics.memoryUsage },
        });
      }
    }
  }

  /**
   * Add alert (avoiding duplicates)
   */
  private addAlert(alert: PerformanceAlert): void {
    // Check for recent similar alerts (within 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 300000);
    const recentSimilar = this.alerts.find(a => 
      a.type === alert.type && 
      a.message === alert.message && 
      a.timestamp >= fiveMinutesAgo
    );
    
    if (!recentSimilar) {
      this.alerts.push(alert);
      console.warn(`Redis Alert [${alert.severity.toUpperCase()}]: ${alert.message}`);
      
      // Keep only last 100 alerts
      if (this.alerts.length > 100) {
        this.alerts = this.alerts.slice(-100);
      }
    }
  }

  /**
   * Clean up old metrics data
   */
  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - (this.config.retainMetricsHours * 60 * 60 * 1000));
    
    // Clean metrics history
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp >= cutoff);
    
    // Clean old alerts
    this.alerts = this.alerts.filter(a => a.timestamp >= cutoff);
    
    console.log(`Cleaned up old Redis metrics. Retained ${this.metricsHistory.length} metric entries and ${this.alerts.length} alerts.`);
  }
}