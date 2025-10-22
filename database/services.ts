// ============================================================================
// SimplyCaster Database Services
// High-level database operations for the application
// ============================================================================

import { db, users, rooms, recordings, feedEpisodes, guests, auditLog } from "./connection.ts";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import type { User, Room, Recording, FeedEpisode, Guest, AuditLog } from "./schema.ts";

// ============================================================================
// USER SERVICES
// ============================================================================

export async function getUserById(id: string): Promise<User | null> {
  const result = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  
  return result[0] || null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)))
    .limit(1);
  
  return result[0] || null;
}

export async function getAllUsers(): Promise<User[]> {
  return await db
    .select()
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(users.createdAt);
}

// ============================================================================
// ROOM SERVICES
// ============================================================================

export async function getRoomById(id: string): Promise<Room | null> {
  const result = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, id), isNull(rooms.closedAt)))
    .limit(1);
  
  return result[0] || null;
}

export async function getActiveRooms(): Promise<Room[]> {
  return await db
    .select()
    .from(rooms)
    .where(isNull(rooms.closedAt))
    .orderBy(desc(rooms.createdAt));
}

export async function getRoomsByHostId(hostId: string): Promise<Room[]> {
  return await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.hostId, hostId), isNull(rooms.closedAt)))
    .orderBy(desc(rooms.createdAt));
}

// ============================================================================
// RECORDING SERVICES
// ============================================================================

export async function getRecordingById(id: string): Promise<Recording | null> {
  const result = await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.id, id), isNull(recordings.deletedAt)))
    .limit(1);
  
  return result[0] || null;
}

export async function getRecordingsByUserId(userId: string): Promise<Recording[]> {
  return await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.createdBy, userId), isNull(recordings.deletedAt)))
    .orderBy(desc(recordings.startedAt));
}

export async function getAllRecordings(): Promise<Recording[]> {
  return await db
    .select()
    .from(recordings)
    .where(isNull(recordings.deletedAt))
    .orderBy(desc(recordings.startedAt));
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