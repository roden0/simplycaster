/**
 * Redis Cache Operations Instrumentation
 * 
 * Provides OpenTelemetry instrumentation for Redis operations including:
 * - Cache operation tracing with hit/miss metrics
 * - Session storage operations
 * - Rate limiting operations
 */

import { SpanKind, SpanStatusCode } from "npm:@opentelemetry/api@1.7.0";
import type { Span } from "npm:@opentelemetry/api@1.7.0";
import { startActiveSpan, recordCounter, recordHistogram, recordGauge, addCommonAttributes } from "../observability-service.ts";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Redis operation context
 */
export interface RedisOperationContext {
  operation: 'get' | 'set' | 'del' | 'exists' | 'expire' | 'ttl' | 'incr' | 'decr' | 'hget' | 'hset' | 'hdel' | 'sadd' | 'srem' | 'smembers' | 'zadd' | 'zrem' | 'zrange' | 'publish' | 'subscribe';
  key: string;
  keyPattern?: string;
  database?: number;
  userId?: string;
  connectionId?: string;
  ttl?: number;
}

/**
 * Cache operation context
 */
export interface CacheOperationContext {
  operation: 'hit' | 'miss' | 'set' | 'delete' | 'clear';
  cacheType: 'user' | 'room' | 'recording' | 'session' | 'rate_limit' | 'general';
  key: string;
  userId?: string;
  roomId?: string;
  ttl?: number;
  size?: number;
}

/**
 * Session operation context
 */
export interface SessionOperationContext {
  operation: 'create' | 'read' | 'update' | 'delete' | 'cleanup';
  sessionId: string;
  userId?: string;
  ttl?: number;
  dataSize?: number;
}

/**
 * Rate limiting context
 */
export interface RateLimitContext {
  operation: 'check' | 'increment' | 'reset';
  limitType: 'api' | 'login' | 'upload' | 'websocket';
  identifier: string; // IP, user ID, etc.
  limit?: number;
  window?: number; // Time window in seconds
  currentCount?: number;
}

/**
 * Redis operation result
 */
export interface RedisOperationResult {
  success: boolean;
  hit?: boolean;
  value?: any;
  size?: number;
  ttl?: number;
  executionTime: number;
}

// ============================================================================
// REDIS INSTRUMENTATION CLASS
// ============================================================================

/**
 * Redis operations instrumentation service
 */
export class RedisInstrumentation {
  private static readonly COMPONENT_NAME = 'redis';

  /**
   * Instrument Redis operation
   */
  static async instrumentRedisOperation<T>(
    context: RedisOperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      `redis.${context.operation}`,
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'redis.operation': context.operation,
            'redis.key': this.sanitizeKey(context.key),
            'db.system': 'redis',
            'component.name': this.COMPONENT_NAME,
          });

          if (context.keyPattern) {
            span.setAttribute('redis.key.pattern', context.keyPattern);
          }

          if (context.database !== undefined) {
            span.setAttribute('redis.database', context.database);
          }

          if (context.connectionId) {
            span.setAttribute('redis.connection.id', context.connectionId);
          }

          if (context.ttl) {
            span.setAttribute('redis.ttl', context.ttl);
          }

          // Add common attributes
          addCommonAttributes(span, {
            userId: context.userId,
            operation: `redis.${context.operation}`,
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Determine if this was a cache hit/miss for read operations
          let isHit = false;
          if (['get', 'hget', 'exists'].includes(context.operation)) {
            isHit = result !== null && result !== undefined;
          }

          // Record success metrics
          recordCounter('redis_operations_total', 1, {
            attributes: {
              operation: context.operation,
              status: 'success',
              hit: isHit.toString(),
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('redis_operation_duration_ms', duration, {
            attributes: {
              operation: context.operation,
              component: this.COMPONENT_NAME,
            },
          });

          // Record cache hit/miss metrics for read operations
          if (['get', 'hget', 'exists'].includes(context.operation)) {
            recordCounter('redis_cache_requests_total', 1, {
              attributes: {
                operation: context.operation,
                result: isHit ? 'hit' : 'miss',
                component: this.COMPONENT_NAME,
              },
            });
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttributes({
            'redis.operation.duration_ms': duration,
            'redis.cache.hit': isHit,
          });

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('redis_operations_total', 1, {
            attributes: {
              operation: context.operation,
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Instrument cache operation
   */
  static async instrumentCacheOperation<T>(
    context: CacheOperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      `cache.${context.operation}`,
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'cache.operation': context.operation,
            'cache.type': context.cacheType,
            'cache.key': this.sanitizeKey(context.key),
            'component.name': this.COMPONENT_NAME,
          });

          if (context.ttl) {
            span.setAttribute('cache.ttl', context.ttl);
          }

          if (context.size) {
            span.setAttribute('cache.size_bytes', context.size);
          }

          // Add common attributes
          addCommonAttributes(span, {
            userId: context.userId,
            roomId: context.roomId,
            operation: `cache.${context.operation}`,
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('cache_operations_total', 1, {
            attributes: {
              operation: context.operation,
              cache_type: context.cacheType,
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('cache_operation_duration_ms', duration, {
            attributes: {
              operation: context.operation,
              cache_type: context.cacheType,
              component: this.COMPONENT_NAME,
            },
          });

          // Record cache hit/miss metrics
          if (context.operation === 'hit' || context.operation === 'miss') {
            recordCounter('cache_requests_total', 1, {
              attributes: {
                cache_type: context.cacheType,
                result: context.operation,
                component: this.COMPONENT_NAME,
              },
            });
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('cache.operation.duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('cache_operations_total', 1, {
            attributes: {
              operation: context.operation,
              cache_type: context.cacheType,
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Instrument session operation
   */
  static async instrumentSessionOperation<T>(
    context: SessionOperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      `session.${context.operation}`,
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'session.operation': context.operation,
            'session.id': context.sessionId,
            'component.name': this.COMPONENT_NAME,
          });

          if (context.ttl) {
            span.setAttribute('session.ttl', context.ttl);
          }

          if (context.dataSize) {
            span.setAttribute('session.data_size_bytes', context.dataSize);
          }

          // Add common attributes
          addCommonAttributes(span, {
            userId: context.userId,
            operation: `session.${context.operation}`,
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('session_operations_total', 1, {
            attributes: {
              operation: context.operation,
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('session_operation_duration_ms', duration, {
            attributes: {
              operation: context.operation,
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('session.operation.duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('session_operations_total', 1, {
            attributes: {
              operation: context.operation,
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Instrument rate limiting operation
   */
  static async instrumentRateLimit<T>(
    context: RateLimitContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      `rate_limit.${context.operation}`,
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'rate_limit.operation': context.operation,
            'rate_limit.type': context.limitType,
            'rate_limit.identifier': this.sanitizeIdentifier(context.identifier),
            'component.name': this.COMPONENT_NAME,
          });

          if (context.limit) {
            span.setAttribute('rate_limit.limit', context.limit);
          }

          if (context.window) {
            span.setAttribute('rate_limit.window_seconds', context.window);
          }

          if (context.currentCount) {
            span.setAttribute('rate_limit.current_count', context.currentCount);
          }

          // Add common attributes
          addCommonAttributes(span, {
            operation: `rate_limit.${context.operation}`,
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Determine if rate limit was exceeded
          let exceeded = false;
          if (context.operation === 'check' && context.limit && context.currentCount) {
            exceeded = context.currentCount >= context.limit;
          }

          // Record success metrics
          recordCounter('rate_limit_operations_total', 1, {
            attributes: {
              operation: context.operation,
              limit_type: context.limitType,
              status: 'success',
              exceeded: exceeded.toString(),
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('rate_limit_operation_duration_ms', duration, {
            attributes: {
              operation: context.operation,
              limit_type: context.limitType,
              component: this.COMPONENT_NAME,
            },
          });

          // Record rate limit violations
          if (exceeded) {
            recordCounter('rate_limit_violations_total', 1, {
              attributes: {
                limit_type: context.limitType,
                component: this.COMPONENT_NAME,
              },
            });
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttributes({
            'rate_limit.operation.duration_ms': duration,
            'rate_limit.exceeded': exceeded,
          });

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('rate_limit_operations_total', 1, {
            attributes: {
              operation: context.operation,
              limit_type: context.limitType,
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Record Redis connection pool statistics
   */
  static recordConnectionPoolStats(poolName: string, stats: {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    waitingRequests: number;
    maxConnections: number;
  }): void {
    const baseAttributes = {
      pool_name: poolName,
      component: this.COMPONENT_NAME,
    };

    recordGauge('redis_pool_connections_total', stats.totalConnections, {
      attributes: baseAttributes,
    });

    recordGauge('redis_pool_connections_active', stats.activeConnections, {
      attributes: baseAttributes,
    });

    recordGauge('redis_pool_connections_idle', stats.idleConnections, {
      attributes: baseAttributes,
    });

    recordGauge('redis_pool_requests_waiting', stats.waitingRequests, {
      attributes: baseAttributes,
    });

    // Calculate utilization percentage
    const utilization = stats.maxConnections > 0 ? (stats.totalConnections / stats.maxConnections) * 100 : 0;
    recordGauge('redis_pool_utilization_percent', utilization, {
      attributes: baseAttributes,
    });
  }

  /**
   * Record cache statistics by type
   */
  static recordCacheStats(cacheType: CacheOperationContext['cacheType'], stats: {
    hitCount: number;
    missCount: number;
    setCount: number;
    deleteCount: number;
    totalSize: number;
    averageTtl: number;
  }): void {
    const baseAttributes = {
      cache_type: cacheType,
      component: this.COMPONENT_NAME,
    };

    // Record hit/miss counts
    recordGauge('cache_hits_total', stats.hitCount, {
      attributes: baseAttributes,
    });

    recordGauge('cache_misses_total', stats.missCount, {
      attributes: baseAttributes,
    });

    recordGauge('cache_sets_total', stats.setCount, {
      attributes: baseAttributes,
    });

    recordGauge('cache_deletes_total', stats.deleteCount, {
      attributes: baseAttributes,
    });

    // Calculate hit rate
    const totalRequests = stats.hitCount + stats.missCount;
    const hitRate = totalRequests > 0 ? (stats.hitCount / totalRequests) * 100 : 0;
    recordGauge('cache_hit_rate_percent', hitRate, {
      attributes: baseAttributes,
    });

    // Record cache size and TTL
    recordGauge('cache_total_size_bytes', stats.totalSize, {
      attributes: baseAttributes,
    });

    recordGauge('cache_average_ttl_seconds', stats.averageTtl, {
      attributes: baseAttributes,
    });
  }

  /**
   * Record session statistics
   */
  static recordSessionStats(stats: {
    activeSessions: number;
    totalSessions: number;
    averageSessionDuration: number;
    expiredSessions: number;
    averageDataSize: number;
  }): void {
    const baseAttributes = {
      component: this.COMPONENT_NAME,
    };

    recordGauge('sessions_active_total', stats.activeSessions, {
      attributes: baseAttributes,
    });

    recordGauge('sessions_total', stats.totalSessions, {
      attributes: baseAttributes,
    });

    recordGauge('session_duration_avg_seconds', stats.averageSessionDuration, {
      attributes: baseAttributes,
    });

    recordGauge('sessions_expired_total', stats.expiredSessions, {
      attributes: baseAttributes,
    });

    recordGauge('session_data_size_avg_bytes', stats.averageDataSize, {
      attributes: baseAttributes,
    });
  }

  /**
   * Record rate limiting statistics
   */
  static recordRateLimitStats(limitType: RateLimitContext['limitType'], stats: {
    totalRequests: number;
    blockedRequests: number;
    averageUsage: number;
    peakUsage: number;
  }): void {
    const baseAttributes = {
      limit_type: limitType,
      component: this.COMPONENT_NAME,
    };

    recordGauge('rate_limit_requests_total', stats.totalRequests, {
      attributes: baseAttributes,
    });

    recordGauge('rate_limit_blocked_total', stats.blockedRequests, {
      attributes: baseAttributes,
    });

    recordGauge('rate_limit_usage_avg_percent', stats.averageUsage, {
      attributes: baseAttributes,
    });

    recordGauge('rate_limit_usage_peak_percent', stats.peakUsage, {
      attributes: baseAttributes,
    });

    // Calculate block rate
    const blockRate = stats.totalRequests > 0 ? (stats.blockedRequests / stats.totalRequests) * 100 : 0;
    recordGauge('rate_limit_block_rate_percent', blockRate, {
      attributes: baseAttributes,
    });
  }

  /**
   * Sanitize Redis key for logging (remove sensitive data)
   */
  private static sanitizeKey(key: string): string {
    // Replace potential sensitive data in keys
    return key
      .replace(/session:[a-f0-9-]+/gi, 'session:***')
      .replace(/token:[a-f0-9-]+/gi, 'token:***')
      .replace(/user:[a-f0-9-]+/gi, 'user:***')
      .replace(/password:[a-f0-9-]+/gi, 'password:***');
  }

  /**
   * Sanitize identifier for logging (remove sensitive data)
   */
  private static sanitizeIdentifier(identifier: string): string {
    // Hash or mask IP addresses and user IDs for privacy
    if (identifier.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      // IPv4 address - mask last octet
      return identifier.replace(/\.\d+$/, '.***');
    }
    if (identifier.match(/^[a-f0-9-]{36}$/i)) {
      // UUID - mask middle part
      return identifier.replace(/^(.{8}).*(.{8})$/, '$1-***-$2');
    }
    return identifier;
  }
}



// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Instrument Redis operation
 */
export async function instrumentRedisOperation<T>(
  context: RedisOperationContext,
  operation: () => Promise<T>
): Promise<T> {
  return RedisInstrumentation.instrumentRedisOperation(context, operation);
}

/**
 * Instrument cache operation
 */
export async function instrumentCacheOperation<T>(
  context: CacheOperationContext,
  operation: () => Promise<T>
): Promise<T> {
  return RedisInstrumentation.instrumentCacheOperation(context, operation);
}

/**
 * Instrument session operation
 */
export async function instrumentSessionOperation<T>(
  context: SessionOperationContext,
  operation: () => Promise<T>
): Promise<T> {
  return RedisInstrumentation.instrumentSessionOperation(context, operation);
}

/**
 * Instrument rate limiting operation
 */
export async function instrumentRateLimit<T>(
  context: RateLimitContext,
  operation: () => Promise<T>
): Promise<T> {
  return RedisInstrumentation.instrumentRateLimit(context, operation);
}

/**
 * Record Redis connection pool statistics
 */
export function recordRedisConnectionPoolStats(poolName: string, stats: {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  maxConnections: number;
}): void {
  RedisInstrumentation.recordConnectionPoolStats(poolName, stats);
}

/**
 * Record cache statistics
 */
export function recordCacheStats(cacheType: CacheOperationContext['cacheType'], stats: {
  hitCount: number;
  missCount: number;
  setCount: number;
  deleteCount: number;
  totalSize: number;
  averageTtl: number;
}): void {
  RedisInstrumentation.recordCacheStats(cacheType, stats);
}

/**
 * Record session statistics
 */
export function recordSessionStats(stats: {
  activeSessions: number;
  totalSessions: number;
  averageSessionDuration: number;
  expiredSessions: number;
  averageDataSize: number;
}): void {
  RedisInstrumentation.recordSessionStats(stats);
}

/**
 * Record rate limiting statistics
 */
export function recordRateLimitStats(limitType: RateLimitContext['limitType'], stats: {
  totalRequests: number;
  blockedRequests: number;
  averageUsage: number;
  peakUsage: number;
}): void {
  RedisInstrumentation.recordRateLimitStats(limitType, stats);
}