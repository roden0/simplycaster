/**
 * Redis Service Implementation
 * 
 * Concrete implementation of RedisService interface using the Redis client
 * with proper error handling, serialization, and connection management.
 */

import { RedisClientType } from 'redis';
import { RedisService } from '../../domain/services/redis-service.ts';
import { RedisConnectionManager } from './redis-connection-manager.ts';

export class RedisServiceImpl implements RedisService {
  private connectionManager: RedisConnectionManager;
  private keyPrefix: string;

  constructor(connectionManager: RedisConnectionManager, keyPrefix: string = '') {
    this.connectionManager = connectionManager;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Get Redis client with connection check
   */
  private getClient(): RedisClientType {
    return this.connectionManager.getClient();
  }

  /**
   * Add key prefix if configured
   */
  private prefixKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  /**
   * Serialize value for Redis storage
   */
  private serialize<T>(value: T): string {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  }

  /**
   * Deserialize value from Redis
   */
  private deserialize<T>(value: string | null): T | null {
    if (value === null) {
      return null;
    }
    
    try {
      return JSON.parse(value) as T;
    } catch {
      // If JSON parsing fails, return as string
      return value as unknown as T;
    }
  }

  // Basic cache operations
  async get<T>(key: string): Promise<T | null> {
    try {
      const client = this.getClient();
      const value = await client.get(this.prefixKey(key));
      return this.deserialize<T>(value || null);
    } catch (error) {
      console.error(`Redis GET error for key ${key}:`, error);
      throw error;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const client = this.getClient();
      const serializedValue = this.serialize(value);
      const prefixedKey = this.prefixKey(key);

      if (ttlSeconds) {
        await client.setEx(prefixedKey, ttlSeconds, serializedValue);
      } else {
        await client.set(prefixedKey, serializedValue);
      }
    } catch (error) {
      console.error(`Redis SET error for key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      const client = this.getClient();
      await client.del(this.prefixKey(key));
    } catch (error) {
      console.error(`Redis DEL error for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const result = await client.exists(this.prefixKey(key));
      return result === 1;
    } catch (error) {
      console.error(`Redis EXISTS error for key ${key}:`, error);
      throw error;
    }
  }

  // Hash operations
  async hget<T>(key: string, field: string): Promise<T | null> {
    try {
      const client = this.getClient();
      const value = await client.hGet(this.prefixKey(key), field);
      return this.deserialize<T>(value || null);
    } catch (error) {
      console.error(`Redis HGET error for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  async hset<T>(key: string, field: string, value: T): Promise<void> {
    try {
      const client = this.getClient();
      const serializedValue = this.serialize(value);
      await client.hSet(this.prefixKey(key), field, serializedValue);
    } catch (error) {
      console.error(`Redis HSET error for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  async hdel(key: string, field: string): Promise<void> {
    try {
      const client = this.getClient();
      await client.hDel(this.prefixKey(key), field);
    } catch (error) {
      console.error(`Redis HDEL error for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  async hgetall<T>(key: string): Promise<Record<string, T>> {
    try {
      const client = this.getClient();
      const hash = await client.hGetAll(this.prefixKey(key));
      const result: Record<string, T> = {};
      
      for (const [field, value] of Object.entries(hash)) {
        const deserializedValue = this.deserialize<T>(value);
        if (deserializedValue !== null) {
          result[field] = deserializedValue;
        }
      }
      
      return result;
    } catch (error) {
      console.error(`Redis HGETALL error for key ${key}:`, error);
      throw error;
    }
  }

  // List operations
  async lpush<T>(key: string, value: T): Promise<void> {
    try {
      const client = this.getClient();
      const serializedValue = this.serialize(value);
      await client.lPush(this.prefixKey(key), serializedValue);
    } catch (error) {
      console.error(`Redis LPUSH error for key ${key}:`, error);
      throw error;
    }
  }

  async rpop<T>(key: string): Promise<T | null> {
    try {
      const client = this.getClient();
      const value = await client.rPop(this.prefixKey(key));
      return this.deserialize<T>(value || null);
    } catch (error) {
      console.error(`Redis RPOP error for key ${key}:`, error);
      throw error;
    }
  }

  async llen(key: string): Promise<number> {
    try {
      const client = this.getClient();
      return await client.lLen(this.prefixKey(key));
    } catch (error) {
      console.error(`Redis LLEN error for key ${key}:`, error);
      throw error;
    }
  }

  // Set operations
  async sadd(key: string, member: string): Promise<void> {
    try {
      const client = this.getClient();
      await client.sAdd(this.prefixKey(key), member);
    } catch (error) {
      console.error(`Redis SADD error for key ${key}:`, error);
      throw error;
    }
  }

  async srem(key: string, member: string): Promise<void> {
    try {
      const client = this.getClient();
      await client.sRem(this.prefixKey(key), member);
    } catch (error) {
      console.error(`Redis SREM error for key ${key}:`, error);
      throw error;
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      const client = this.getClient();
      return await client.sMembers(this.prefixKey(key));
    } catch (error) {
      console.error(`Redis SMEMBERS error for key ${key}:`, error);
      throw error;
    }
  }

  async sismember(key: string, member: string): Promise<boolean> {
    try {
      const client = this.getClient();
      return await client.sIsMember(this.prefixKey(key), member);
    } catch (error) {
      console.error(`Redis SISMEMBER error for key ${key}:`, error);
      throw error;
    }
  }

  // Pub/Sub operations
  async publish(channel: string, message: string): Promise<void> {
    try {
      const client = this.getClient();
      await client.publish(this.prefixKey(channel), message);
    } catch (error) {
      console.error(`Redis PUBLISH error for channel ${channel}:`, error);
      throw error;
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    try {
      const client = this.getClient();
      await client.subscribe(this.prefixKey(channel), callback);
    } catch (error) {
      console.error(`Redis SUBSCRIBE error for channel ${channel}:`, error);
      throw error;
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    try {
      const client = this.getClient();
      await client.unsubscribe(this.prefixKey(channel));
    } catch (error) {
      console.error(`Redis UNSUBSCRIBE error for channel ${channel}:`, error);
      throw error;
    }
  }

  // Rate limiting with sliding window
  async incrementCounter(key: string, windowSeconds: number): Promise<number> {
    try {
      const client = this.getClient();
      const prefixedKey = this.prefixKey(key);
      const now = Date.now();
      const windowStart = now - (windowSeconds * 1000);

      // Use a sorted set for sliding window rate limiting
      const multi = client.multi();
      
      // Remove expired entries
      multi.zRemRangeByScore(prefixedKey, 0, windowStart);
      
      // Add current request
      multi.zAdd(prefixedKey, { score: now, value: `${now}` });
      
      // Count current requests in window
      multi.zCard(prefixedKey);
      
      // Set expiration for cleanup
      multi.expire(prefixedKey, windowSeconds + 1);
      
      const results = await multi.exec();
      
      // Return the count from zCard
      return results[2] as number;
    } catch (error) {
      console.error(`Redis rate limiting error for key ${key}:`, error);
      throw error;
    }
  }

  // Batch operations
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const client = this.getClient();
      const prefixedKeys = keys.map(key => this.prefixKey(key));
      const values = await client.mGet(prefixedKeys);
      return values.map(value => this.deserialize<T>(value || null));
    } catch (error) {
      console.error(`Redis MGET error for keys ${keys.join(', ')}:`, error);
      throw error;
    }
  }

  async mset<T>(keyValuePairs: Record<string, T>, ttlSeconds?: number): Promise<void> {
    try {
      const client = this.getClient();
      const multi = client.multi();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const prefixedKey = this.prefixKey(key);
        const serializedValue = this.serialize(value);
        
        if (ttlSeconds) {
          multi.setEx(prefixedKey, ttlSeconds, serializedValue);
        } else {
          multi.set(prefixedKey, serializedValue);
        }
      }
      
      await multi.exec();
    } catch (error) {
      console.error(`Redis MSET error:`, error);
      throw error;
    }
  }

  // Key management
  async expire(key: string, seconds: number): Promise<void> {
    try {
      const client = this.getClient();
      await client.expire(this.prefixKey(key), seconds);
    } catch (error) {
      console.error(`Redis EXPIRE error for key ${key}:`, error);
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const client = this.getClient();
      return await client.ttl(this.prefixKey(key));
    } catch (error) {
      console.error(`Redis TTL error for key ${key}:`, error);
      throw error;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      const client = this.getClient();
      const prefixedPattern = this.prefixKey(pattern);
      const keys = await client.keys(prefixedPattern);
      
      // Remove prefix from returned keys
      if (this.keyPrefix) {
        const prefixLength = this.keyPrefix.length + 1; // +1 for the colon
        return keys.map(key => key.substring(prefixLength));
      }
      
      return keys;
    } catch (error) {
      console.error(`Redis KEYS error for pattern ${pattern}:`, error);
      throw error;
    }
  }

  // Health and connection
  async ping(): Promise<boolean> {
    try {
      return await this.connectionManager.ping();
    } catch (error) {
      console.error('Redis ping error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.connectionManager.disconnect();
    } catch (error) {
      console.error('Redis disconnect error:', error);
      throw error;
    }
  }
}