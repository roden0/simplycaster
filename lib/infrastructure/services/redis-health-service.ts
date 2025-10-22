/**
 * Redis Health Service
 * 
 * Provides comprehensive health checks and diagnostics for Redis
 * with detailed status reporting and automatic recovery suggestions.
 */

import { RedisConnectionManager, ConnectionHealth } from './redis-connection-manager.ts';
import { RedisService } from '../../domain/services/redis-service.ts';

export interface RedisHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    connection: HealthCheck;
    performance: HealthCheck;
    memory: HealthCheck;
    persistence: HealthCheck;
    replication?: HealthCheck;
  };
  recommendations: string[];
  lastChecked: Date;
}

export interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: Record<string, any>;
  duration?: number;
  threshold?: number;
  actual?: number;
}

export interface RedisInfo {
  server: {
    version: string;
    mode: string;
    uptime: number;
  };
  memory: {
    used: number;
    peak: number;
    fragmentation: number;
    evictedKeys: number;
  };
  persistence: {
    loading: boolean;
    lastSave: number;
    changes: number;
  };
  stats: {
    connections: number;
    commands: number;
    keyspaceHits: number;
    keyspaceMisses: number;
  };
  replication?: {
    role: string;
    slaves: number;
  };
}

export interface HealthCheckConfig {
  thresholds: {
    responseTimeMs: number;
    memoryUsagePercent: number;
    fragmentationRatio: number;
    cacheHitRatePercent: number;
    connectionTimeoutMs: number;
  };
  enableDetailedChecks: boolean;
  checkTimeout: number;
}

export class RedisHealthService {
  private connectionManager: RedisConnectionManager;
  private redisService: RedisService;
  private config: HealthCheckConfig;

  constructor(
    connectionManager: RedisConnectionManager,
    redisService: RedisService,
    config: Partial<HealthCheckConfig> = {}
  ) {
    this.connectionManager = connectionManager;
    this.redisService = redisService;
    this.config = {
      thresholds: {
        responseTimeMs: 100,
        memoryUsagePercent: 85,
        fragmentationRatio: 1.5,
        cacheHitRatePercent: 80,
        connectionTimeoutMs: 5000,
      },
      enableDetailedChecks: true,
      checkTimeout: 10000,
      ...config,
    };
  }

  /**
   * Perform comprehensive health check
   */
  async checkHealth(): Promise<RedisHealthStatus> {
    const startTime = Date.now();
    const checks: RedisHealthStatus['checks'] = {
      connection: await this.checkConnection(),
      performance: await this.checkPerformance(),
      memory: await this.checkMemory(),
      persistence: await this.checkPersistence(),
    };

    // Add replication check if enabled
    if (this.config.enableDetailedChecks) {
      checks.replication = await this.checkReplication();
    }

    // Determine overall health
    const overall = this.determineOverallHealth(checks);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(checks);

    return {
      overall,
      checks,
      recommendations,
      lastChecked: new Date(),
    };
  }

  /**
   * Get detailed Redis information
   */
  async getRedisInfo(): Promise<RedisInfo | null> {
    try {
      const client = this.connectionManager.getClient();
      const info = await client.info();
      
      return this.parseRedisInfo(info);
    } catch (error) {
      console.error('Failed to get Redis info:', error);
      return null;
    }
  }

  /**
   * Check connection health
   */
  private async checkConnection(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Test basic connectivity
      const pingResult = await Promise.race([
        this.redisService.ping(),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), this.config.thresholds.connectionTimeoutMs)
        ),
      ]);
      
      const duration = Date.now() - startTime;
      const connectionHealth = this.connectionManager.getHealth();
      
      if (!pingResult) {
        return {
          status: 'fail',
          message: 'Redis ping failed',
          details: connectionHealth,
          duration,
        };
      }
      
      // Check for recent connection issues
      if (connectionHealth.reconnectAttempts > 0) {
        return {
          status: 'warn',
          message: `Connection recovered after ${connectionHealth.reconnectAttempts} reconnect attempts`,
          details: connectionHealth,
          duration,
        };
      }
      
      return {
        status: 'pass',
        message: 'Redis connection is healthy',
        details: connectionHealth,
        duration,
      };
      
    } catch (error) {
      return {
        status: 'fail',
        message: `Connection check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check performance metrics
   */
  private async checkPerformance(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Test response time with a simple operation
      const testKey = `health_check_${Date.now()}`;
      const testValue = 'test';
      
      const operationStart = Date.now();
      await this.redisService.set(testKey, testValue, 60); // 60 second TTL
      await this.redisService.get(testKey);
      await this.redisService.del(testKey);
      const operationTime = Date.now() - operationStart;
      
      const duration = Date.now() - startTime;
      
      if (operationTime > this.config.thresholds.responseTimeMs * 2) {
        return {
          status: 'fail',
          message: 'Redis operations are very slow',
          details: { operationTime },
          duration,
          threshold: this.config.thresholds.responseTimeMs,
          actual: operationTime,
        };
      }
      
      if (operationTime > this.config.thresholds.responseTimeMs) {
        return {
          status: 'warn',
          message: 'Redis operations are slower than expected',
          details: { operationTime },
          duration,
          threshold: this.config.thresholds.responseTimeMs,
          actual: operationTime,
        };
      }
      
      return {
        status: 'pass',
        message: 'Redis performance is good',
        details: { operationTime },
        duration,
        threshold: this.config.thresholds.responseTimeMs,
        actual: operationTime,
      };
      
    } catch (error) {
      return {
        status: 'fail',
        message: `Performance check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const client = this.connectionManager.getClient();
      const memoryInfo = await client.info('memory');
      const memoryData = this.parseInfoSection(memoryInfo);
      
      const usedMemory = parseInt(memoryData.used_memory || '0');
      const maxMemory = parseInt(memoryData.maxmemory || '0');
      const fragmentationRatio = parseFloat(memoryData.mem_fragmentation_ratio || '1');
      const evictedKeys = parseInt(memoryData.evicted_keys || '0');
      
      const duration = Date.now() - startTime;
      const details = {
        usedMemory,
        maxMemory,
        fragmentationRatio,
        evictedKeys,
        usedMemoryHuman: memoryData.used_memory_human,
        maxMemoryHuman: memoryData.maxmemory_human,
      };
      
      // Check memory usage percentage
      let memoryUsagePercent = 0;
      if (maxMemory > 0) {
        memoryUsagePercent = (usedMemory / maxMemory) * 100;
      }
      
      // Check fragmentation
      if (fragmentationRatio > this.config.thresholds.fragmentationRatio) {
        return {
          status: 'warn',
          message: `High memory fragmentation: ${fragmentationRatio.toFixed(2)}`,
          details,
          duration,
          threshold: this.config.thresholds.fragmentationRatio,
          actual: fragmentationRatio,
        };
      }
      
      // Check memory usage
      if (memoryUsagePercent > this.config.thresholds.memoryUsagePercent) {
        return {
          status: memoryUsagePercent > 95 ? 'fail' : 'warn',
          message: `High memory usage: ${memoryUsagePercent.toFixed(1)}%`,
          details,
          duration,
          threshold: this.config.thresholds.memoryUsagePercent,
          actual: memoryUsagePercent,
        };
      }
      
      // Check for key evictions
      if (evictedKeys > 0) {
        return {
          status: 'warn',
          message: `Keys are being evicted due to memory pressure: ${evictedKeys} evicted`,
          details,
          duration,
        };
      }
      
      return {
        status: 'pass',
        message: 'Memory usage is healthy',
        details,
        duration,
      };
      
    } catch (error) {
      return {
        status: 'fail',
        message: `Memory check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check persistence configuration
   */
  private async checkPersistence(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const client = this.connectionManager.getClient();
      const persistenceInfo = await client.info('persistence');
      const persistenceData = this.parseInfoSection(persistenceInfo);
      
      const loading = persistenceData.loading === '1';
      const lastSave = parseInt(persistenceData.rdb_last_save_time || '0');
      const changes = parseInt(persistenceData.rdb_changes_since_last_save || '0');
      const aofEnabled = persistenceData.aof_enabled === '1';
      
      const duration = Date.now() - startTime;
      const details = {
        loading,
        lastSave: new Date(lastSave * 1000),
        changes,
        aofEnabled,
        rdbLastBgsaveStatus: persistenceData.rdb_last_bgsave_status,
        aofLastRewriteStatus: persistenceData.aof_last_rewrite_status,
      };
      
      if (loading) {
        return {
          status: 'warn',
          message: 'Redis is loading data from disk',
          details,
          duration,
        };
      }
      
      // Check for persistence errors
      if (persistenceData.rdb_last_bgsave_status === 'err') {
        return {
          status: 'fail',
          message: 'Last RDB background save failed',
          details,
          duration,
        };
      }
      
      if (aofEnabled && persistenceData.aof_last_rewrite_status === 'err') {
        return {
          status: 'fail',
          message: 'Last AOF rewrite failed',
          details,
          duration,
        };
      }
      
      // Check for stale data (no save in last 24 hours with changes)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      if (lastSave * 1000 < oneDayAgo && changes > 1000) {
        return {
          status: 'warn',
          message: `Data hasn't been persisted in 24+ hours with ${changes} changes`,
          details,
          duration,
        };
      }
      
      return {
        status: 'pass',
        message: 'Persistence is configured and working',
        details,
        duration,
      };
      
    } catch (error) {
      return {
        status: 'fail',
        message: `Persistence check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check replication status
   */
  private async checkReplication(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const client = this.connectionManager.getClient();
      const replicationInfo = await client.info('replication');
      const replicationData = this.parseInfoSection(replicationInfo);
      
      const role = replicationData.role || 'unknown';
      const connectedSlaves = parseInt(replicationData.connected_slaves || '0');
      
      const duration = Date.now() - startTime;
      const details = {
        role,
        connectedSlaves,
        masterHost: replicationData.master_host,
        masterPort: replicationData.master_port,
        masterLinkStatus: replicationData.master_link_status,
      };
      
      if (role === 'slave' && replicationData.master_link_status === 'down') {
        return {
          status: 'fail',
          message: 'Slave has lost connection to master',
          details,
          duration,
        };
      }
      
      if (role === 'master' && connectedSlaves === 0) {
        return {
          status: 'warn',
          message: 'Master has no connected slaves',
          details,
          duration,
        };
      }
      
      return {
        status: 'pass',
        message: `Replication is healthy (role: ${role})`,
        details,
        duration,
      };
      
    } catch (error) {
      return {
        status: 'warn',
        message: `Replication check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Determine overall health from individual checks
   */
  private determineOverallHealth(checks: RedisHealthStatus['checks']): 'healthy' | 'degraded' | 'unhealthy' {
    const checkValues = Object.values(checks).filter(check => check !== undefined);
    
    const failCount = checkValues.filter(check => check.status === 'fail').length;
    const warnCount = checkValues.filter(check => check.status === 'warn').length;
    
    if (failCount > 0) {
      return 'unhealthy';
    }
    
    if (warnCount > 0) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Generate recommendations based on health checks
   */
  private generateRecommendations(checks: RedisHealthStatus['checks']): string[] {
    const recommendations: string[] = [];
    
    // Connection recommendations
    if (checks.connection.status === 'fail') {
      recommendations.push('Check Redis server status and network connectivity');
      recommendations.push('Verify Redis configuration and authentication');
    } else if (checks.connection.status === 'warn') {
      recommendations.push('Monitor connection stability and consider connection pooling optimization');
    }
    
    // Performance recommendations
    if (checks.performance.status === 'fail') {
      recommendations.push('Investigate Redis server load and optimize slow operations');
      recommendations.push('Consider scaling Redis or optimizing data structures');
    } else if (checks.performance.status === 'warn') {
      recommendations.push('Monitor Redis performance metrics and consider optimization');
    }
    
    // Memory recommendations
    if (checks.memory.status === 'fail') {
      recommendations.push('Increase Redis memory limit or implement data eviction policies');
      recommendations.push('Review data retention policies and clean up unused keys');
    } else if (checks.memory.status === 'warn') {
      if (checks.memory.details?.fragmentationRatio > this.config.thresholds.fragmentationRatio) {
        recommendations.push('Consider running MEMORY DOCTOR or restarting Redis to reduce fragmentation');
      }
      if (checks.memory.details?.evictedKeys > 0) {
        recommendations.push('Review memory usage patterns and consider increasing memory limit');
      }
    }
    
    // Persistence recommendations
    if (checks.persistence.status === 'fail') {
      recommendations.push('Check disk space and permissions for Redis persistence');
      recommendations.push('Review Redis persistence configuration (RDB/AOF)');
    } else if (checks.persistence.status === 'warn') {
      recommendations.push('Monitor persistence operations and ensure regular backups');
    }
    
    // Replication recommendations
    if (checks.replication && checks.replication.status === 'fail') {
      recommendations.push('Check master-slave connectivity and replication configuration');
    } else if (checks.replication && checks.replication.status === 'warn') {
      recommendations.push('Consider setting up Redis replication for high availability');
    }
    
    return recommendations;
  }

  /**
   * Parse Redis info output
   */
  private parseRedisInfo(info: string): RedisInfo {
    const sections = this.parseInfoSections(info);
    
    return {
      server: {
        version: sections.server?.redis_version || 'unknown',
        mode: sections.server?.redis_mode || 'standalone',
        uptime: parseInt(sections.server?.uptime_in_seconds || '0'),
      },
      memory: {
        used: parseInt(sections.memory?.used_memory || '0'),
        peak: parseInt(sections.memory?.used_memory_peak || '0'),
        fragmentation: parseFloat(sections.memory?.mem_fragmentation_ratio || '1'),
        evictedKeys: parseInt(sections.memory?.evicted_keys || '0'),
      },
      persistence: {
        loading: sections.persistence?.loading === '1',
        lastSave: parseInt(sections.persistence?.rdb_last_save_time || '0'),
        changes: parseInt(sections.persistence?.rdb_changes_since_last_save || '0'),
      },
      stats: {
        connections: parseInt(sections.stats?.total_connections_received || '0'),
        commands: parseInt(sections.stats?.total_commands_processed || '0'),
        keyspaceHits: parseInt(sections.stats?.keyspace_hits || '0'),
        keyspaceMisses: parseInt(sections.stats?.keyspace_misses || '0'),
      },
      replication: sections.replication ? {
        role: sections.replication.role || 'unknown',
        slaves: parseInt(sections.replication.connected_slaves || '0'),
      } : undefined,
    };
  }

  /**
   * Parse Redis info into sections
   */
  private parseInfoSections(info: string): Record<string, Record<string, string>> {
    const sections: Record<string, Record<string, string>> = {};
    let currentSection = '';
    
    for (const line of info.split('\r\n')) {
      if (line.startsWith('# ')) {
        currentSection = line.substring(2).toLowerCase();
        sections[currentSection] = {};
      } else if (line.includes(':') && currentSection) {
        const [key, value] = line.split(':');
        sections[currentSection][key] = value;
      }
    }
    
    return sections;
  }

  /**
   * Parse a single info section
   */
  private parseInfoSection(info: string): Record<string, string> {
    const data: Record<string, string> = {};
    
    for (const line of info.split('\r\n')) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        data[key] = value;
      }
    }
    
    return data;
  }
}