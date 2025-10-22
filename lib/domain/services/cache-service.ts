/**
 * Cache Service Interface
 * 
 * Defines the contract for caching operations with cache-aside pattern,
 * automatic fallback to database queries, and cache invalidation strategies.
 */

import { User } from '../entities/user.ts';
import { Room } from '../entities/room.ts';
import { Recording } from '../entities/recording.ts';

/**
 * Session data for caching user sessions
 */
export interface SessionData {
  userId: string;
  email: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  loginTime: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Cache configuration for different entity types
 */
export interface CacheConfig {
  defaultTTL: number;
  userTTL: number;
  roomTTL: number;
  recordingTTL: number;
  sessionTTL: number;
  enableCacheWarming: boolean;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage?: number;
}

/**
 * Cache service interface with cache-aside pattern implementation
 */
export interface CacheService {
  // User caching
  getUserById(id: string): Promise<User | null>;
  setUser(user: User, ttlSeconds?: number): Promise<void>;
  invalidateUser(id: string): Promise<void>;
  
  // Room caching
  getRoomById(id: string): Promise<Room | null>;
  setRoom(room: Room, ttlSeconds?: number): Promise<void>;
  invalidateRoom(id: string): Promise<void>;
  getRoomList(hostId?: string): Promise<Room[]>;
  setRoomList(rooms: Room[], hostId?: string, ttlSeconds?: number): Promise<void>;
  invalidateRoomList(hostId?: string): Promise<void>;
  
  // Recording caching
  getRecordingById(id: string): Promise<Recording | null>;
  setRecording(recording: Recording, ttlSeconds?: number): Promise<void>;
  invalidateRecording(id: string): Promise<void>;
  getRecordingList(userId: string): Promise<Recording[]>;
  setRecordingList(recordings: Recording[], userId: string, ttlSeconds?: number): Promise<void>;
  invalidateRecordingList(userId: string): Promise<void>;
  
  // Session caching
  getSession(sessionId: string): Promise<SessionData | null>;
  setSession(sessionId: string, data: SessionData, ttlSeconds?: number): Promise<void>;
  invalidateSession(sessionId: string): Promise<void>;
  
  // Cache warming and management
  warmCache(): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
  clearAll(): Promise<void>;
  
  // Cache statistics and monitoring
  getStats(): Promise<CacheStats>;
  
  // Health check
  isHealthy(): Promise<boolean>;
}

/**
 * Cache key patterns for consistent key generation
 */
export const CacheKeys = {
  // User data
  USER: (id: string) => `user:${id}`,
  USER_PROFILE: (id: string) => `user:profile:${id}`,
  USER_SESSION: (sessionId: string) => `session:${sessionId}`,
  
  // Room data
  ROOM: (id: string) => `room:${id}`,
  ROOM_LIST: (hostId?: string) => hostId ? `rooms:host:${hostId}` : 'rooms:all',
  ROOM_PARTICIPANTS: (roomId: string) => `room:participants:${roomId}`,
  ROOM_STATUS: (roomId: string) => `room:status:${roomId}`,
  
  // Recording data
  RECORDING: (id: string) => `recording:${id}`,
  RECORDING_LIST: (userId: string) => `recordings:user:${userId}`,
  RECORDING_FILES: (recordingId: string) => `recording:files:${recordingId}`,
  
  // Cache metadata
  CACHE_STATS: 'cache:stats',
  CACHE_HEALTH: 'cache:health',
  
  // Patterns for bulk operations
  USER_PATTERN: 'user:*',
  ROOM_PATTERN: 'room:*',
  RECORDING_PATTERN: 'recording:*',
  SESSION_PATTERN: 'session:*',
} as const;

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  defaultTTL: 3600, // 1 hour
  userTTL: 1800, // 30 minutes
  roomTTL: 3600, // 1 hour
  recordingTTL: 7200, // 2 hours
  sessionTTL: 86400, // 24 hours
  enableCacheWarming: true,
};

/**
 * Cache error types
 */
export class CacheError extends Error {
  constructor(message: string, public readonly operation: string, public readonly key?: string) {
    super(message);
    this.name = 'CacheError';
  }
}

export class CacheConnectionError extends CacheError {
  constructor(message: string) {
    super(message, 'connection');
    this.name = 'CacheConnectionError';
  }
}

export class CacheSerializationError extends CacheError {
  constructor(message: string, key: string) {
    super(message, 'serialization', key);
    this.name = 'CacheSerializationError';
  }
}