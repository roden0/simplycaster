/**
 * Global Redis Service Access
 * 
 * Provides global access to Redis services with proper initialization
 * and fallback handling for the application.
 */

import { container } from './container.ts';
import { ServiceKeys } from './registry.ts';
import { RedisService } from '../domain/services/redis-service.ts';
import { RedisInitializer } from '../infrastructure/services/redis-initializer.ts';

let redisInitialized = false;
let redisInitializer: RedisInitializer | null = null;

/**
 * Initialize Redis services globally
 */
export async function initializeRedis(): Promise<void> {
  if (redisInitialized) {
    return;
  }

  try {
    redisInitializer = container.get<RedisInitializer>(ServiceKeys.REDIS_INITIALIZER);
    await redisInitializer.initialize();
    redisInitialized = true;
  } catch (error) {
    console.error('Failed to initialize Redis globally:', error);
    throw error;
  }
}

/**
 * Get Redis service instance with fallback handling
 */
export function getRedisService(): RedisService | null {
  if (!redisInitialized || !redisInitializer) {
    console.warn('Redis not initialized, returning null');
    return null;
  }

  try {
    return container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
  } catch (error) {
    console.error('Failed to get Redis service:', error);
    return null;
  }
}

/**
 * Check if Redis is available and healthy
 */
export async function isRedisHealthy(): Promise<boolean> {
  if (!redisInitializer) {
    return false;
  }

  return await redisInitializer.healthCheck();
}

/**
 * Get Redis health status
 */
export function getRedisHealth() {
  if (!redisInitializer) {
    return { status: 'not_initialized' };
  }

  return redisInitializer.getHealthStatus();
}

/**
 * Shutdown Redis services
 */
export async function shutdownRedis(): Promise<void> {
  if (redisInitializer) {
    await redisInitializer.shutdown();
    redisInitialized = false;
    redisInitializer = null;
  }
}

/**
 * Execute function with Redis fallback
 * If Redis is not available, execute the fallback function
 */
export async function withRedisOrFallback<T>(
  redisOperation: (redis: RedisService) => Promise<T>,
  fallbackOperation: () => Promise<T>
): Promise<T> {
  const redis = getRedisService();
  
  if (!redis) {
    console.warn('Redis not available, using fallback');
    return await fallbackOperation();
  }

  try {
    return await redisOperation(redis);
  } catch (error) {
    console.error('Redis operation failed, using fallback:', error);
    return await fallbackOperation();
  }
}