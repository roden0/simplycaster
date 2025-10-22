/**
 * Cache Warming Service
 * 
 * Handles cache warming during application startup and background cache refresh
 * for critical data to improve performance.
 */

import { CachedUserService } from './cached-user-service.ts';
import { CachedRoomService } from './cached-room-service.ts';
import { CachedRecordingService } from './cached-recording-service.ts';
import { RedisService } from '../../domain/services/redis-service.ts';
import { UserRepository } from '../../domain/repositories/user-repository.ts';
import { RoomRepository } from '../../domain/repositories/room-repository.ts';

export interface CacheWarmingConfig {
  enableStartupWarming: boolean;
  enableBackgroundRefresh: boolean;
  backgroundRefreshInterval: number; // in milliseconds
  maxUsersToWarm: number;
  maxRoomsToWarm: number;
  maxRecordingsToWarm: number;
  warmingBatchSize: number;
}

export class CacheWarmingService {
  private backgroundRefreshTimer?: number;
  private isWarming = false;

  constructor(
    private cachedUserService: CachedUserService,
    private cachedRoomService: CachedRoomService,
    private cachedRecordingService: CachedRecordingService,
    private redisService: RedisService,
    private userRepository: UserRepository,
    private roomRepository: RoomRepository,
    private config: CacheWarmingConfig
  ) {}

  /**
   * Start cache warming service
   */
  async start(): Promise<void> {
    console.log('Starting cache warming service...');

    if (this.config.enableStartupWarming) {
      await this.performStartupWarming();
    }

    if (this.config.enableBackgroundRefresh) {
      this.startBackgroundRefresh();
    }

    console.log('Cache warming service started successfully');
  }

  /**
   * Stop cache warming service
   */
  async stop(): Promise<void> {
    console.log('Stopping cache warming service...');

    if (this.backgroundRefreshTimer) {
      clearInterval(this.backgroundRefreshTimer);
      this.backgroundRefreshTimer = undefined;
    }

    console.log('Cache warming service stopped');
  }

  /**
   * Perform initial cache warming during application startup
   */
  async performStartupWarming(): Promise<void> {
    if (this.isWarming) {
      console.log('Cache warming already in progress, skipping...');
      return;
    }

    this.isWarming = true;
    const startTime = Date.now();

    try {
      console.log('Starting cache warming...');

      // Check Redis connectivity first
      const isRedisHealthy = await this.redisService.ping();
      if (!isRedisHealthy) {
        console.warn('Redis is not available, skipping cache warming');
        return;
      }

      // Warm critical data in parallel
      await Promise.all([
        this.warmActiveUsers(),
        this.warmActiveRooms(),
        this.warmRecentRecordings(),
        this.warmRoomLists(),
        this.warmRecordingStats()
      ]);

      const duration = Date.now() - startTime;
      console.log(`Cache warming completed in ${duration}ms`);

    } catch (error) {
      console.error('Error during cache warming:', error);
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Warm cache with active users
   */
  private async warmActiveUsers(): Promise<void> {
    try {
      console.log('Warming active users cache...');

      // Get most recently active users
      const result = await this.userRepository.findActiveUsers({
        page: 1,
        limit: this.config.maxUsersToWarm
      });

      if (!result.success || result.data.items.length === 0) {
        console.log('No active users found to warm');
        return;
      }

      const userIds = result.data.items.map(user => user.id);
      
      // Warm user cache in batches
      for (let i = 0; i < userIds.length; i += this.config.warmingBatchSize) {
        const batch = userIds.slice(i, i + this.config.warmingBatchSize);
        await this.cachedUserService.warmUserCache(batch);
        
        // Small delay between batches to avoid overwhelming Redis
        if (i + this.config.warmingBatchSize < userIds.length) {
          await this.delay(100);
        }
      }

      console.log(`Warmed cache for ${userIds.length} active users`);

    } catch (error) {
      console.error('Error warming active users cache:', error);
    }
  }

  /**
   * Warm cache with active rooms
   */
  private async warmActiveRooms(): Promise<void> {
    try {
      console.log('Warming active rooms cache...');

      // Get most recently active rooms
      const result = await this.roomRepository.findActiveRooms({
        page: 1,
        limit: this.config.maxRoomsToWarm
      });

      if (!result.success || result.data.items.length === 0) {
        console.log('No active rooms found to warm');
        return;
      }

      const roomIds = result.data.items.map(room => room.id);
      
      // Warm room cache in batches
      for (let i = 0; i < roomIds.length; i += this.config.warmingBatchSize) {
        const batch = roomIds.slice(i, i + this.config.warmingBatchSize);
        await this.cachedRoomService.warmRoomCache(batch);
        
        // Small delay between batches
        if (i + this.config.warmingBatchSize < roomIds.length) {
          await this.delay(100);
        }
      }

      console.log(`Warmed cache for ${roomIds.length} active rooms`);

    } catch (error) {
      console.error('Error warming active rooms cache:', error);
    }
  }

  /**
   * Warm cache with recent recordings
   */
  private async warmRecentRecordings(): Promise<void> {
    try {
      console.log('Warming recent recordings cache...');

      // Get active users first
      const userResult = await this.userRepository.findActiveUsers({
        page: 1,
        limit: Math.min(this.config.maxUsersToWarm, 20) // Limit for recording warming
      });

      if (!userResult.success || userResult.data.items.length === 0) {
        console.log('No active users found for recording warming');
        return;
      }

      const userIds = userResult.data.items.map(user => user.id);
      
      // Warm recording lists for active users
      await this.cachedRecordingService.warmRecordingListCache(userIds);

      console.log(`Warmed recording cache for ${userIds.length} users`);

    } catch (error) {
      console.error('Error warming recent recordings cache:', error);
    }
  }

  /**
   * Warm room lists cache
   */
  private async warmRoomLists(): Promise<void> {
    try {
      console.log('Warming room lists cache...');

      // Warm general active rooms list
      await this.cachedRoomService.warmRoomListCache();

      console.log('Room lists cache warmed successfully');

    } catch (error) {
      console.error('Error warming room lists cache:', error);
    }
  }

  /**
   * Warm recording statistics cache
   */
  private async warmRecordingStats(): Promise<void> {
    try {
      console.log('Warming recording statistics cache...');

      // Get active users
      const userResult = await this.userRepository.findActiveUsers({
        page: 1,
        limit: Math.min(this.config.maxUsersToWarm, 10) // Limit for stats warming
      });

      if (!userResult.success || userResult.data.items.length === 0) {
        console.log('No active users found for stats warming');
        return;
      }

      // Warm stats for active users
      const promises = userResult.data.items.map(user => 
        this.cachedRecordingService.getRecordingStats(user.id)
      );

      await Promise.all(promises);

      console.log(`Warmed recording stats for ${userResult.data.items.length} users`);

    } catch (error) {
      console.error('Error warming recording statistics cache:', error);
    }
  }

  /**
   * Start background cache refresh
   */
  private startBackgroundRefresh(): void {
    console.log(`Starting background cache refresh with interval: ${this.config.backgroundRefreshInterval}ms`);

    this.backgroundRefreshTimer = setInterval(async () => {
      try {
        await this.performBackgroundRefresh();
      } catch (error) {
        console.error('Error during background cache refresh:', error);
      }
    }, this.config.backgroundRefreshInterval);
  }

  /**
   * Perform background cache refresh
   */
  private async performBackgroundRefresh(): Promise<void> {
    if (this.isWarming) {
      console.log('Cache warming already in progress, skipping background refresh');
      return;
    }

    console.log('Performing background cache refresh...');

    try {
      // Check Redis health before refreshing
      const isRedisHealthy = await this.redisService.ping();
      if (!isRedisHealthy) {
        console.warn('Redis is not available, skipping background refresh');
        return;
      }

      // Refresh critical data with smaller batches
      const smallConfig = {
        ...this.config,
        maxUsersToWarm: Math.min(this.config.maxUsersToWarm, 10),
        maxRoomsToWarm: Math.min(this.config.maxRoomsToWarm, 10),
        warmingBatchSize: Math.min(this.config.warmingBatchSize, 5)
      };

      // Use smaller config for background refresh
      const originalConfig = this.config;
      this.config = smallConfig;

      await Promise.all([
        this.warmActiveUsers(),
        this.warmActiveRooms(),
        this.warmRoomLists()
      ]);

      // Restore original config
      this.config = originalConfig;

      console.log('Background cache refresh completed');

    } catch (error) {
      console.error('Error during background cache refresh:', error);
    }
  }

  /**
   * Manually trigger cache warming
   */
  async triggerManualWarming(): Promise<void> {
    console.log('Manual cache warming triggered');
    await this.performStartupWarming();
  }

  /**
   * Get cache warming status
   */
  getStatus(): {
    isWarming: boolean;
    backgroundRefreshEnabled: boolean;
    config: CacheWarmingConfig;
  } {
    return {
      isWarming: this.isWarming,
      backgroundRefreshEnabled: !!this.backgroundRefreshTimer,
      config: this.config
    };
  }

  /**
   * Utility method to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Default cache warming configuration
 */
export const defaultCacheWarmingConfig: CacheWarmingConfig = {
  enableStartupWarming: true,
  enableBackgroundRefresh: true,
  backgroundRefreshInterval: 15 * 60 * 1000, // 15 minutes
  maxUsersToWarm: 50,
  maxRoomsToWarm: 30,
  maxRecordingsToWarm: 100,
  warmingBatchSize: 10
};

/**
 * Parse cache warming configuration from environment variables
 */
export function parseCacheWarmingConfig(): CacheWarmingConfig {
  return {
    enableStartupWarming: Deno.env.get('CACHE_WARMING_STARTUP') !== 'false',
    enableBackgroundRefresh: Deno.env.get('CACHE_WARMING_BACKGROUND') !== 'false',
    backgroundRefreshInterval: parseInt(
      Deno.env.get('CACHE_WARMING_INTERVAL') || '900000' // 15 minutes
    ),
    maxUsersToWarm: parseInt(Deno.env.get('CACHE_WARMING_MAX_USERS') || '50'),
    maxRoomsToWarm: parseInt(Deno.env.get('CACHE_WARMING_MAX_ROOMS') || '30'),
    maxRecordingsToWarm: parseInt(Deno.env.get('CACHE_WARMING_MAX_RECORDINGS') || '100'),
    warmingBatchSize: parseInt(Deno.env.get('CACHE_WARMING_BATCH_SIZE') || '10')
  };
}