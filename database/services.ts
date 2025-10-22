// ============================================================================
// SimplyCaster Database Services
// High-level database operations for the application with Redis caching
// ============================================================================

import { db, users, rooms, recordings, feedEpisodes, guests, auditLog } from "./connection.ts";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import type { User, Room, Recording, FeedEpisode, Guest, AuditLog } from "./schema.ts";
import { getService } from "../lib/container/global.ts";
import { ServiceKeys } from "../lib/container/registry.ts";
import { CachedUserService } from "../lib/infrastructure/services/cached-user-service.ts";
import { CachedRoomService } from "../lib/infrastructure/services/cached-room-service.ts";
import { CachedRecordingService } from "../lib/infrastructure/services/cached-recording-service.ts";
import { CacheWarmingService } from "../lib/infrastructure/services/cache-warming-service.ts";

// ============================================================================
// USER SERVICES (with caching)
// ============================================================================

export async function getUserById(id: string): Promise<User | null> {
  try {
    const cachedUserService = getService<CachedUserService>(ServiceKeys.CACHED_USER_SERVICE);
    return await cachedUserService.getUserById(id);
  } catch (error) {
    console.error("Error getting user from cached service, falling back to direct DB:", error);
    // Fallback to direct database query
    const result = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    
    return result[0] || null;
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const cachedUserService = getService<CachedUserService>(ServiceKeys.CACHED_USER_SERVICE);
    return await cachedUserService.getUserByEmail(email);
  } catch (error) {
    console.error("Error getting user by email from cached service, falling back to direct DB:", error);
    // Fallback to direct database query
    const result = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)))
      .limit(1);
    
    return result[0] || null;
  }
}

export async function getAllUsers(): Promise<User[]> {
  try {
    const cachedUserService = getService<CachedUserService>(ServiceKeys.CACHED_USER_SERVICE);
    return await cachedUserService.getAllUsers();
  } catch (error) {
    console.error("Error getting all users from cached service, falling back to direct DB:", error);
    // Fallback to direct database query
    return await db
      .select()
      .from(users)
      .where(isNull(users.deletedAt))
      .orderBy(users.createdAt);
  }
}

// ============================================================================
// ROOM SERVICES (with caching)
// ============================================================================

export async function getRoomById(id: string): Promise<Room | null> {
  try {
    const cachedRoomService = getService<CachedRoomService>(ServiceKeys.CACHED_ROOM_SERVICE);
    return await cachedRoomService.getRoomById(id);
  } catch (error) {
    console.error("Error getting room from cached service, falling back to direct DB:", error);
    // Fallback to direct database query
    const result = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), isNull(rooms.closedAt)))
      .limit(1);
    
    return result[0] || null;
  }
}

export async function getActiveRooms(): Promise<Room[]> {
  try {
    const cachedRoomService = getService<CachedRoomService>(ServiceKeys.CACHED_ROOM_SERVICE);
    return await cachedRoomService.getActiveRooms();
  } catch (error) {
    console.error("Error getting active rooms from cached service, falling back to direct DB:", error);
    // Fallback to direct database query
    return await db
      .select()
      .from(rooms)
      .where(isNull(rooms.closedAt))
      .orderBy(desc(rooms.createdAt));
  }
}

export async function getRoomsByHostId(hostId: string): Promise<Room[]> {
  try {
    const cachedRoomService = getService<CachedRoomService>(ServiceKeys.CACHED_ROOM_SERVICE);
    return await cachedRoomService.getRoomsByHostId(hostId);
  } catch (error) {
    console.error("Error getting rooms by host from cached service, falling back to direct DB:", error);
    // Fallback to direct database query
    return await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.hostId, hostId), isNull(rooms.closedAt)))
      .orderBy(desc(rooms.createdAt));
  }
}

// ============================================================================
// RECORDING SERVICES (with caching)
// ============================================================================

export async function getRecordingById(id: string): Promise<Recording | null> {
  try {
    const cachedRecordingService = getService<CachedRecordingService>(ServiceKeys.CACHED_RECORDING_SERVICE);
    return await cachedRecordingService.getRecordingById(id);
  } catch (error) {
    console.error("Error getting recording from cached service, falling back to direct DB:", error);
    // Fallback to direct database query
    const result = await db
      .select()
      .from(recordings)
      .where(and(eq(recordings.id, id), isNull(recordings.deletedAt)))
      .limit(1);
    
    return result[0] || null;
  }
}

export async function getRecordingsByUserId(userId: string): Promise<Recording[]> {
  try {
    const cachedRecordingService = getService<CachedRecordingService>(ServiceKeys.CACHED_RECORDING_SERVICE);
    return await cachedRecordingService.getRecordingsByCreator(userId);
  } catch (error) {
    console.error("Error getting recordings by user from cached service, falling back to direct DB:", error);
    // Fallback to direct database query
    return await db
      .select()
      .from(recordings)
      .where(and(eq(recordings.createdBy, userId), isNull(recordings.deletedAt)))
      .orderBy(desc(recordings.startedAt));
  }
}

export async function getAllRecordings(): Promise<Recording[]> {
  try {
    // For admin operations, we don't cache all recordings due to potential size
    // Fall back to direct database query
    return await db
      .select()
      .from(recordings)
      .where(isNull(recordings.deletedAt))
      .orderBy(desc(recordings.startedAt));
  } catch (error) {
    console.error("Error getting all recordings:", error);
    throw error;
  }
}

/**
 * Get recording statistics for a user (cached)
 */
export async function getRecordingStats(userId: string): Promise<{
  totalRecordings: number;
  totalDuration: number;
  totalSize: number;
}> {
  try {
    const cachedRecordingService = getService<CachedRecordingService>(ServiceKeys.CACHED_RECORDING_SERVICE);
    return await cachedRecordingService.getRecordingStats(userId);
  } catch (error) {
    console.error("Error getting recording stats from cached service, falling back to calculation:", error);
    // Fallback to direct calculation
    const recordings = await db
      .select()
      .from(recordings)
      .where(and(eq(recordings.createdBy, userId), isNull(recordings.deletedAt)));
    
    return {
      totalRecordings: recordings.length,
      totalDuration: recordings.reduce((sum, r) => sum + (r.durationSeconds || 0), 0),
      totalSize: recordings.reduce((sum, r) => sum + (r.totalSizeBytes || 0), 0)
    };
  }
}

// ============================================================================
// FEED SERVICES
// ============================================================================

export async function getFeedEpisodeById(id: string): Promise<FeedEpisode | null> {
  const result = await db
    .select()
    .from(feedEpisodes)
    .where(and(eq(feedEpisodes.id, id), isNull(feedEpisodes.deletedAt)))
    .limit(1);
  
  return result[0] || null;
}

export async function getPublishedFeedEpisodes(): Promise<FeedEpisode[]> {
  return await db
    .select()
    .from(feedEpisodes)
    .where(and(
      eq(feedEpisodes.isPublished, true),
      isNull(feedEpisodes.deletedAt)
    ))
    .orderBy(desc(feedEpisodes.publishedAt));
}

export async function getAllFeedEpisodes(): Promise<FeedEpisode[]> {
  return await db
    .select()
    .from(feedEpisodes)
    .where(isNull(feedEpisodes.deletedAt))
    .orderBy(desc(feedEpisodes.createdAt));
}

// ============================================================================
// GUEST SERVICES
// ============================================================================

export async function getGuestById(id: string): Promise<Guest | null> {
  const result = await db
    .select()
    .from(guests)
    .where(eq(guests.id, id))
    .limit(1);
  
  return result[0] || null;
}

export async function getActiveGuestsByRoomId(roomId: string): Promise<Guest[]> {
  return await db
    .select()
    .from(guests)
    .where(and(
      eq(guests.roomId, roomId),
      isNull(guests.leftAt),
      isNull(guests.kickedAt)
    ))
    .orderBy(guests.joinedAt);
}

export async function getGuestByToken(tokenHash: string): Promise<Guest | null> {
  const result = await db
    .select()
    .from(guests)
    .where(and(
      eq(guests.accessTokenHash, tokenHash),
      isNull(guests.leftAt),
      isNull(guests.kickedAt),
      sql`${guests.tokenExpiresAt} > NOW()`
    ))
    .limit(1);
  
  return result[0] || null;
}

// ============================================================================
// AUDIT SERVICES
// ============================================================================

export async function createAuditLog(
  userId: string | null,
  userEmail: string,
  userRole: "admin" | "host" | "guest",
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<AuditLog> {
  const [auditEntry] = await db
    .insert(auditLog)
    .values({
      userId,
      userEmail,
      userRole,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress,
      userAgent,
    })
    .returning();
  
  return auditEntry;
}

export async function getAuditLogsByUserId(userId: string, limit = 50): Promise<AuditLog[]> {
  return await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.userId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function getRecentAuditLogs(limit = 100): Promise<AuditLog[]> {
  return await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

// ============================================================================
// CACHE MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Invalidate user cache after data modifications
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  try {
    const cachedUserService = getService<CachedUserService>(ServiceKeys.CACHED_USER_SERVICE);
    await cachedUserService.invalidateAllUserCache();
  } catch (error) {
    console.error("Error invalidating user cache:", error);
  }
}

/**
 * Invalidate room cache after data modifications
 */
export async function invalidateRoomCache(roomId: string, hostId?: string): Promise<void> {
  try {
    const cachedRoomService = getService<CachedRoomService>(ServiceKeys.CACHED_ROOM_SERVICE);
    await cachedRoomService.invalidateAllRoomCache();
  } catch (error) {
    console.error("Error invalidating room cache:", error);
  }
}

/**
 * Invalidate recording cache after data modifications
 */
export async function invalidateRecordingCache(recordingId: string, createdBy?: string): Promise<void> {
  try {
    const cachedRecordingService = getService<CachedRecordingService>(ServiceKeys.CACHED_RECORDING_SERVICE);
    await cachedRecordingService.invalidateAllRecordingCache();
    
    if (createdBy) {
      await cachedRecordingService.invalidateRecordingStats(createdBy);
    }
  } catch (error) {
    console.error("Error invalidating recording cache:", error);
  }
}

/**
 * Warm cache with frequently accessed data using the cache warming service
 */
export async function warmCache(): Promise<void> {
  try {
    console.log("Starting cache warming...");
    
    // Get cache warming service
    const cacheWarmingService = getService<CacheWarmingService>(ServiceKeys.CACHE_WARMING_SERVICE);
    
    // Trigger manual cache warming
    await cacheWarmingService.triggerManualWarming();
    
    console.log("Cache warming completed successfully");
  } catch (error) {
    console.error("Error during cache warming:", error);
    
    // Fallback to basic cache warming if service fails
    try {
      console.log("Attempting fallback cache warming...");
      
      const cachedUserService = getService<CachedUserService>(ServiceKeys.CACHED_USER_SERVICE);
      const cachedRoomService = getService<CachedRoomService>(ServiceKeys.CACHED_ROOM_SERVICE);
      const cachedRecordingService = getService<CachedRecordingService>(ServiceKeys.CACHED_RECORDING_SERVICE);
      
      // Basic cache warming
      await cachedRoomService.warmRoomListCache();
      
      // Get active users and warm their caches
      const activeUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.isActive, true), isNull(users.deletedAt)))
        .limit(20); // Smaller limit for fallback
      
      const userIds = activeUsers.map(u => u.id);
      
      if (userIds.length > 0) {
        await cachedUserService.warmUserCache(userIds);
        await cachedRecordingService.warmRecordingListCache(userIds);
      }
      
      console.log("Fallback cache warming completed");
    } catch (fallbackError) {
      console.error("Fallback cache warming also failed:", fallbackError);
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export async function healthCheck(): Promise<{ status: string; timestamp: string }> {
  try {
    await db.select().from(users).limit(1);
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Database health check failed:", error);
    throw new Error("Database connection failed");
  }
}