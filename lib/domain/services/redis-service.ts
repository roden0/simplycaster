/**
 * Redis Service Interface
 * 
 * Defines the contract for Redis operations including basic cache operations,
 * hash operations, list operations, set operations, pub/sub, and rate limiting.
 */

export interface RedisService {
  // Basic cache operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  
  // Hash operations for complex data
  hget<T>(key: string, field: string): Promise<T | null>;
  hset<T>(key: string, field: string, value: T): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  
  // List operations for queues
  lpush<T>(key: string, value: T): Promise<void>;
  rpop<T>(key: string): Promise<T | null>;
  llen(key: string): Promise<number>;
  
  // Set operations for unique collections
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  sismember(key: string, member: string): Promise<boolean>;
  
  // Pub/Sub operations
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, callback: (message: string) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  
  // Rate limiting
  incrementCounter(key: string, windowSeconds: number): Promise<number>;
  
  // Batch operations
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  mset<T>(keyValuePairs: Record<string, T>, ttlSeconds?: number): Promise<void>;
  
  // Key management
  expire(key: string, seconds: number): Promise<void>;
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  
  // Health and connection
  ping(): Promise<boolean>;
  disconnect(): Promise<void>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  totalHits: number;
}

