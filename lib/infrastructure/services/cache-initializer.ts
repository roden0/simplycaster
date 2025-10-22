/**
 * Cache Initializer
 * 
 * Handles cache initialization during application startup including
 * cache warming and background refresh setup.
 */

import { Container } from '../../container/container.ts';
import { ServiceKeys } from '../../container/registry.ts';
import { CacheWarmingService } from './cache-warming-service.ts';
import { RedisService } from '../../domain/services/redis-service.ts';

export class CacheInitializer {
  private cacheWarmingService?: CacheWarmingService;
  private isInitialized = false;

  constructor(private container: Container) {}

  /**
   * Initialize cache system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Cache system already initialized');
      return;
    }

    try {
      console.log('Initializing cache system...');

      // Check Redis connectivity first
      const redisService = this.container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
      const isRedisHealthy = await redisService.ping();
      
      if (!isRedisHealthy) {
        console.warn('Redis is not available, cache system will not be initialized');
        return;
      }

      // Get cache warming service
      this.cacheWarmingService = this.container.get<CacheWarmingService>(ServiceKeys.CACHE_WARMING_SERVICE);

      // Start cache warming service
      await this.cacheWarmingService.start();

      this.isInitialized = true;
      console.log('Cache system initialized successfully');

    } catch (error) {
      console.error('Failed to initialize cache system:', error);
      throw error;
    }
  }

  /**
   * Shutdown cache system
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      console.log('Cache system not initialized, nothing to shutdown');
      return;
    }

    try {
      console.log('Shutting down cache system...');

      if (this.cacheWarmingService) {
        await this.cacheWarmingService.stop();
      }

      this.isInitialized = false;
      console.log('Cache system shutdown completed');

    } catch (error) {
      console.error('Error during cache system shutdown:', error);
    }
  }

  /**
   * Get cache system status
   */
  getStatus(): {
    isInitialized: boolean;
    cacheWarmingStatus?: any;
  } {
    return {
      isInitialized: this.isInitialized,
      cacheWarmingStatus: this.cacheWarmingService?.getStatus()
    };
  }

  /**
   * Manually trigger cache warming
   */
  async triggerCacheWarming(): Promise<void> {
    if (!this.isInitialized || !this.cacheWarmingService) {
      throw new Error('Cache system not initialized');
    }

    await this.cacheWarmingService.triggerManualWarming();
  }
}

/**
 * Global cache initializer instance
 */
let globalCacheInitializer: CacheInitializer | null = null;

/**
 * Get or create global cache initializer
 */
export function getCacheInitializer(container: Container): CacheInitializer {
  if (!globalCacheInitializer) {
    globalCacheInitializer = new CacheInitializer(container);
  }
  return globalCacheInitializer;
}

/**
 * Initialize cache system globally
 */
export async function initializeCacheSystem(container: Container): Promise<void> {
  const initializer = getCacheInitializer(container);
  await initializer.initialize();
}

/**
 * Shutdown cache system globally
 */
export async function shutdownCacheSystem(): Promise<void> {
  if (globalCacheInitializer) {
    await globalCacheInitializer.shutdown();
    globalCacheInitializer = null;
  }
}