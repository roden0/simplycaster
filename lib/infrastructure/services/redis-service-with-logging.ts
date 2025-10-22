/**
 * Redis Service with Comprehensive Logging
 * 
 * Enhanced Redis service implementation that wraps the base Redis service
 * with comprehensive logging, performance tracking, and audit capabilities.
 */

import { RedisService } from '../../domain/services/redis-service.ts';
import { RedisServiceImpl } from './redis-service-impl.ts';
import { RedisLogger, RedisLogEntry } from './redis-logger.ts';
import { RedisMonitoringService } from './redis-monitoring-service.ts';

export class RedisServiceWithLogging implements RedisService {
  private baseService: RedisServiceImpl;
  private logger: RedisLogger;
  private monitoring?: RedisMonitoringService;
  private requestContext?: RedisLogEntry['context'];

  constructor(
    baseService: RedisServiceImpl,
    logger: RedisLogger,
    monitoring?: RedisMonitoringService
  ) {
    this.baseService = baseService;
    this.logger = logger;
    this.monitoring = monitoring;
  }

  /**
   * Set request context for logging
   */
  setRequestContext(context: RedisLogEntry['context']): void {
    this.requestContext = context;
  }

  /**
   * Clear request context
   */
  clearRequestContext(): void {
    this.requestContext = undefined;
  }

  /**
   * Execute operation with logging and monitoring
   */
  private async executeWithLogging<T>(
    operation: string,
    key: string | undefined,
    operationFn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const operationId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    // Track operation start for monitoring
    if (this.monitoring) {
      this.monitoring.trackOperationStart(operationId, operation);
    }

    try {
      const result = await operationFn();
      const duration = Date.now() - startTime;
      
      // Log successful operation
      this.logger.logOperation(
        operation,
        key,
        duration,
        true,
        undefined,
        metadata,
        this.requestContext
      );

      // Track operation completion for monitoring
      if (this.monitoring) {
        this.monitoring.trackOperationEnd(operationId, operation, true);
        
        // Track cache hit/miss for get operations
        if (operation === 'get' || operation === 'hget') {
          this.monitoring.trackCacheOperation(result !== null);
        }
      }

      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const redisError = error instanceof Error ? error : new Error(String(error));
      
      // Log failed operation
      this.logger.logOperation(
        operation,
        key,
        duration,
        false,
        redisError,
        metadata,
        this.requestContext
      );

      // Track operation failure for monitoring
      if (this.monitoring) {
        this.monitoring.trackOperationEnd(operationId, operation, false, redisError);
      }

      throw error;
    }
  }

  // Basic cache operations with logging
  async get<T>(key: string): Promise<T | null> {
    return this.executeWithLogging(
      'get',
      key,
      () => this.baseService.get<T>(key)
    );
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.executeWithLogging(
      'set',
      key,
      () => this.baseService.set(key, value, ttlSeconds),
      { ttl: ttlSeconds, valueType: typeof value }
    );
  }

  async del(key: string): Promise<void> {
    // Log as audit event since deletion is a critical operation
    this.logger.logAuditEvent(
      'delete_key',
      key,
      true,
      { operation: 'del' },
      this.requestContext
    );

    return this.executeWithLogging(
      'del',
      key,
      () => this.baseService.del(key)
    );
  }

  async exists(key: string): Promise<boolean> {
    return this.executeWithLogging(
      'exists',
      key,
      () => this.baseService.exists(key)
    );
  }

  // Hash operations with logging
  async hget<T>(key: string, field: string): Promise<T | null> {
    return this.executeWithLogging(
      'hget',
      key,
      () => this.baseService.hget<T>(key, field),
      { field }
    );
  }

  async hset<T>(key: string, field: string, value: T): Promise<void> {
    return this.executeWithLogging(
      'hset',
      key,
      () => this.baseService.hset(key, field, value),
      { field, valueType: typeof value }
    );
  }

  async hdel(key: string, field: string): Promise<void> {
    // Log as audit event
    this.logger.logAuditEvent(
      'delete_hash_field',
      key,
      true,
      { field, operation: 'hdel' },
      this.requestContext
    );

    return this.executeWithLogging(
      'hdel',
      key,
      () => this.baseService.hdel(key, field),
      { field }
    );
  }

  async hgetall<T>(key: string): Promise<Record<string, T>> {
    return this.executeWithLogging(
      'hgetall',
      key,
      () => this.baseService.hgetall<T>(key)
    );
  }

  // List operations with logging
  async lpush<T>(key: string, value: T): Promise<void> {
    return this.executeWithLogging(
      'lpush',
      key,
      () => this.baseService.lpush(key, value),
      { valueType: typeof value }
    );
  }

  async rpop<T>(key: string): Promise<T | null> {
    return this.executeWithLogging(
      'rpop',
      key,
      () => this.baseService.rpop<T>(key)
    );
  }

  async llen(key: string): Promise<number> {
    return this.executeWithLogging(
      'llen',
      key,
      () => this.baseService.llen(key)
    );
  }

  // Set operations with logging
  async sadd(key: string, member: string): Promise<void> {
    return this.executeWithLogging(
      'sadd',
      key,
      () => this.baseService.sadd(key, member),
      { member }
    );
  }

  async srem(key: string, member: string): Promise<void> {
    return this.executeWithLogging(
      'srem',
      key,
      () => this.baseService.srem(key, member),
      { member }
    );
  }

  async smembers(key: string): Promise<string[]> {
    return this.executeWithLogging(
      'smembers',
      key,
      () => this.baseService.smembers(key)
    );
  }

  async sismember(key: string, member: string): Promise<boolean> {
    return this.executeWithLogging(
      'sismember',
      key,
      () => this.baseService.sismember(key, member),
      { member }
    );
  }

  // Pub/Sub operations with logging
  async publish(channel: string, message: string): Promise<void> {
    return this.executeWithLogging(
      'publish',
      channel,
      () => this.baseService.publish(channel, message),
      { messageLength: message.length }
    );
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    // Log subscription as audit event
    this.logger.logAuditEvent(
      'subscribe_channel',
      channel,
      true,
      { operation: 'subscribe' },
      this.requestContext
    );

    return this.executeWithLogging(
      'subscribe',
      channel,
      () => this.baseService.subscribe(channel, callback)
    );
  }

  async unsubscribe(channel: string): Promise<void> {
    // Log unsubscription as audit event
    this.logger.logAuditEvent(
      'unsubscribe_channel',
      channel,
      true,
      { operation: 'unsubscribe' },
      this.requestContext
    );

    return this.executeWithLogging(
      'unsubscribe',
      channel,
      () => this.baseService.unsubscribe(channel)
    );
  }

  // Rate limiting with logging
  async incrementCounter(key: string, windowSeconds: number): Promise<number> {
    const result = await this.executeWithLogging(
      'increment_counter',
      key,
      () => this.baseService.incrementCounter(key, windowSeconds),
      { windowSeconds }
    );

    // Track rate limiting operation for monitoring
    if (this.monitoring) {
      // Assume blocked if result is above some threshold (this would be configured)
      const blocked = result > 100; // This should come from rate limit config
      this.monitoring.trackRateLimitOperation(blocked);
    }

    return result;
  }

  // Batch operations with logging
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return this.executeWithLogging(
      'mget',
      undefined,
      () => this.baseService.mget<T>(keys),
      { keyCount: keys.length, keys: keys.slice(0, 10) } // Log first 10 keys
    );
  }

  async mset<T>(keyValuePairs: Record<string, T>, ttlSeconds?: number): Promise<void> {
    const keys = Object.keys(keyValuePairs);
    
    return this.executeWithLogging(
      'mset',
      undefined,
      () => this.baseService.mset(keyValuePairs, ttlSeconds),
      { 
        keyCount: keys.length, 
        keys: keys.slice(0, 10), // Log first 10 keys
        ttl: ttlSeconds 
      }
    );
  }

  // Key management with logging
  async expire(key: string, seconds: number): Promise<void> {
    return this.executeWithLogging(
      'expire',
      key,
      () => this.baseService.expire(key, seconds),
      { ttl: seconds }
    );
  }

  async ttl(key: string): Promise<number> {
    return this.executeWithLogging(
      'ttl',
      key,
      () => this.baseService.ttl(key)
    );
  }

  async keys(pattern: string): Promise<string[]> {
    // Log keys operation as it can be expensive
    const result = await this.executeWithLogging(
      'keys',
      undefined,
      () => this.baseService.keys(pattern),
      { pattern }
    );

    // Warn if too many keys returned
    if (result.length > 1000) {
      this.logger.logPerformanceAlert(
        'large_keys_result',
        'medium',
        `KEYS operation returned ${result.length} keys, consider using SCAN instead`,
        { pattern, resultCount: result.length }
      );
    }

    return result;
  }

  // Health and connection with logging
  async ping(): Promise<boolean> {
    return this.executeWithLogging(
      'ping',
      undefined,
      () => this.baseService.ping()
    );
  }

  async disconnect(): Promise<void> {
    // Log disconnection as audit event
    this.logger.logAuditEvent(
      'disconnect',
      undefined,
      true,
      { operation: 'disconnect' },
      this.requestContext
    );

    return this.executeWithLogging(
      'disconnect',
      undefined,
      () => this.baseService.disconnect()
    );
  }

  /**
   * Log cache invalidation event
   */
  logCacheInvalidation(
    key: string,
    reason: string,
    metadata?: Record<string, any>
  ): void {
    this.logger.logCacheOperation(
      'invalidation',
      key,
      undefined,
      { reason, ...metadata },
      this.requestContext
    );

    this.logger.logAuditEvent(
      'cache_invalidation',
      key,
      true,
      { reason, ...metadata },
      this.requestContext
    );
  }

  /**
   * Get logger instance for direct access
   */
  getLogger(): RedisLogger {
    return this.logger;
  }

  /**
   * Get performance summary from logger
   */
  getPerformanceSummary(): Record<string, any> {
    return this.logger.getPerformanceSummary();
  }

  /**
   * Get error summary from logger
   */
  getErrorSummary(hours: number = 1): any {
    return this.logger.getErrorSummary(hours);
  }
}