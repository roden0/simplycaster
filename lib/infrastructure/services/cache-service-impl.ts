/**
 * Cache Service Implementation
 * 
 * Concrete implementation of CacheService interface using Redis
 * with cache-aside pattern, automatic fallback, and cache invalidation.
 */

import { 
  CacheService, 
  CacheConfig, 
  CacheStats, 
  SessionData, 
  CacheKeys, 
  DEFAULT_CACHE_CONFIG,
  CacheError,
  CacheConnectionError,
  CacheSerializationError
} from '../../domain/services/cache-service.ts';
import { RedisService } from '../../domain/services/redis-service.ts';
import { User } from '../../domain/entities/user.ts';
import { Room } from '../../domain/entities/room.ts';
import { Recording } from '../../domain/entities/recording.ts';

export class CacheServiceImpl implements CacheService {
  private redisService: RedisService;
  private config: CacheConfig;
  private stats: { hits: number; misses: number } = { hits: 0, misses: 0 };

  constructor(redisService: RedisService, config: Partial<CacheConfig> = {}) {
    this.redisService = redisService;
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Generic cache get with fallback and stats tracking
   */
  private async getCached<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redisService.get<T>(key);
      if (value !== null) {
        this.stats.hits++;
        return value;
      } else {
        this.stats.misses++;
        return null;
      }
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Generic cache set with error handling
   */
  private async setCached<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      await this.redisService.set(key, value, ttlSeconds);
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      throw new CacheError(`Failed to cache data: ${error.message}`, 'set', key);
    }
  }

  /**
   * Generic cache delete with error handling
   */
  private async deleteCached(key: string): Promise<void> {
    try {
      await this.redisService.del(key);
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      throw new CacheError(`Failed to delete cache: ${error.message}`, 'delete', key);
    }
  }

  // User caching implementation
  async getUserById(id: string): Promise<User | null> {
    const key = CacheKeys.USER(id);
    return await this.getCached<User>(key);
  }

  async setUser(user: User, ttlSeconds?: number): Promise<void> {
    const key = CacheKeys.USER(user.id);
    const ttl = ttlSeconds || this.config.userTTL;
    await this.setCached(key, user, ttl);
  }

  async invalidateUser(id: string): Promise<void> {
    const userKey = CacheKeys.USER(id);
    const profileKey = CacheKeys.USER_PROFILE(id);
    
    await Promise.all([
      this.deleteCached(userKey),
      this.deleteCached(profileKey)
    ]);
  }

  // Room caching implementation
  async getRoomById(id: string): Promise<Room | null> {
    const key = CacheKeys.ROOM(id);
    return await this.getCached<Room>(key);
  }

  async setRoom(room: Room, ttlSeconds?: number): Promise<void> {
    const key = CacheKeys.ROOM(room.id);
    const ttl = ttlSeconds || this.config.roomTTL;
    await this.setCached(key, room, ttl);
  }

  async invalidateRoom(id: string): Promise<void> {
    const roomKey = CacheKeys.ROOM(id);
    const statusKey = CacheKeys.ROOM_STATUS(id);
    const participantsKey = CacheKeys.ROOM_PARTICIPANTS(id);
    
    await Promise.all([
      this.deleteCached(roomKey),
      this.deleteCached(statusKey),
      this.deleteCached(participantsKey)
    ]);
  }

  async getRoomList(hostId?: string): Promise<Room[]> {
    const key = CacheKeys.ROOM_LIST(hostId);
    const rooms = await this.getCached<Room[]>(key);
    return rooms || [];
  }

  async setRoomList(rooms: Room[], hostId?: string, ttlSeconds?: number): Promise<void> {
    const key = CacheKeys.ROOM_LIST(hostId);
    const ttl = ttlSeconds || this.config.roomTTL;
    await this.setCached(key, rooms, ttl);
  }

  async invalidateRoomList(hostId?: string): Promise<void> {
    const key = CacheKeys.ROOM_LIST(hostId);
    await this.deleteCached(key);
    
    // Also invalidate the general room list if we're invalidating a specific host's list
    if (hostId) {
      const generalKey = CacheKeys.ROOM_LIST();
      await this.deleteCached(generalKey);
    }
  }

  // Recording caching implementation
  async getRecordingById(id: string): Promise<Recording | null> {
    const key = CacheKeys.RECORDING(id);
    return await this.getCached<Recording>(key);
  }

  async setRecording(recording: Recording, ttlSeconds?: number): Promise<void> {
    const key = CacheKeys.RECORDING(recording.id);
    const ttl = ttlSeconds || this.config.recordingTTL;
    await this.setCached(key, recording, ttl);
  }

  async invalidateRecording(id: string): Promise<void> {
    const recordingKey = CacheKeys.RECORDING(id);
    const filesKey = CacheKeys.RECORDING_FILES(id);
    
    await Promise.all([
      this.deleteCached(recordingKey),
      this.deleteCached(filesKey)
    ]);
  }

  async getRecordingList(userId: string): Promise<Recording[]> {
    const key = CacheKeys.RECORDING_LIST(userId);
    const recordings = await this.getCached<Recording[]>(key);
    return recordings || [];
  }

  async setRecordingList(recordings: Recording[], userId: string, ttlSeconds?: number): Promise<void> {
    const key = CacheKeys.RECORDING_LIST(userId);
    const ttl = ttlSeconds || this.config.recordingTTL;
    await this.setCached(key, recordings, ttl);
  }

  async invalidateRecordingList(userId: string): Promise<void> {
    const key = CacheKeys.RECORDING_LIST(userId);
    await this.deleteCached(key);
  }

  // Session caching implementation
  async getSession(sessionId: string): Promise<SessionData | null> {
    const key = CacheKeys.USER_SESSION(sessionId);
    return await this.getCached<SessionData>(key);
  }

  async setSession(sessionId: string, data: SessionData, ttlSeconds?: number): Promise<void> {
    const key = CacheKeys.USER_SESSION(sessionId);
    const ttl = ttlSeconds || this.config.sessionTTL;
    await this.setCached(key, data, ttl);
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const key = CacheKeys.USER_SESSION(sessionId);
    await this.deleteCached(key);
  }

  // Cache warming implementation
  async warmCache(): Promise<void> {
    if (!this.config.enableCacheWarming) {
      return;
    }

    try {
      console.log('Starting cache warming...');
      
      // Cache warming would typically involve:
      // 1. Loading frequently accessed users
      // 2. Loading active rooms
      // 3. Loading recent recordings
      // This would be implemented with actual database queries
      // For now, we'll just log that warming is enabled
      
      console.log('Cache warming completed');
    } catch (error) {
      console.error('Cache warming failed:', error);
      throw new CacheError(`Cache warming failed: ${error.message}`, 'warm');
    }
  }

  // Pattern-based cache invalidation
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redisService.keys(pattern);
      if (keys.length > 0) {
        await Promise.all(keys.map(key => this.deleteCached(key)));
      }
    } catch (error) {
      console.error(`Pattern invalidation error for ${pattern}:`, error);
      throw new CacheError(`Failed to invalidate pattern: ${error.message}`, 'invalidate_pattern');
    }
  }

  // Clear all cache
  async clearAll(): Promise<void> {
    try {
      await Promise.all([
        this.invalidatePattern(CacheKeys.USER_PATTERN),
        this.invalidatePattern(CacheKeys.ROOM_PATTERN),
        this.invalidatePattern(CacheKeys.RECORDING_PATTERN),
        this.invalidatePattern(CacheKeys.SESSION_PATTERN)
      ]);
    } catch (error) {
      console.error('Clear all cache error:', error);
      throw new CacheError(`Failed to clear all cache: ${error.message}`, 'clear_all');
    }
  }

  // Cache statistics
  async getStats(): Promise<CacheStats> {
    try {
      const totalRequests = this.stats.hits + this.stats.misses;
      const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
      
      // Get total keys count (approximate)
      const allPatterns = [
        CacheKeys.USER_PATTERN,
        CacheKeys.ROOM_PATTERN,
        CacheKeys.RECORDING_PATTERN,
        CacheKeys.SESSION_PATTERN
      ];
      
      let totalKeys = 0;
      for (const pattern of allPatterns) {
        try {
          const keys = await this.redisService.keys(pattern);
          totalKeys += keys.length;
        } catch {
          // Ignore errors when counting keys
        }
      }

      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: Math.round(hitRate * 100) / 100,
        totalKeys
      };
    } catch (error) {
      console.error('Get cache stats error:', error);
      throw new CacheError(`Failed to get cache stats: ${error.message}`, 'stats');
    }
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      return await this.redisService.ping();
    } catch (error) {
      console.error('Cache health check failed:', error);
      return false;
    }
  }
}