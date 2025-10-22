/**
 * Drizzle Room Repository Implementation
 * 
 * Implements RoomRepository interface using Drizzle ORM
 * for PostgreSQL database operations.
 */

import { eq, and, isNull, count, desc, asc, gte, lt } from 'drizzle-orm';
import { Database, rooms } from '../../../database/connection.ts';
import { RoomRepository } from '../../domain/repositories/room-repository.ts';
import { Room, CreateRoomData, UpdateRoomData } from '../../domain/entities/room.ts';
import { RoomStatus, Result, PaginatedResult, PaginationParams, Ok, Err } from '../../domain/types/common.ts';
import { ValidationError, EntityNotFoundError, ConflictError } from '../../domain/errors/index.ts';

/**
 * Drizzle implementation of RoomRepository
 */
export class DrizzleRoomRepository implements RoomRepository {
  constructor(private db: Database) {}

  /**
   * Find room by ID
   */
  async findById(id: string): Promise<Result<Room | null>> {
    try {
      const result = await this.db
        .select()
        .from(rooms)
        .where(eq(rooms.id, id))
        .limit(1);

      const room = result[0] ? this.mapToEntity(result[0]) : null;
      return Ok(room);
    } catch (error) {
      return Err(new Error(`Failed to find room by ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find room by slug
   */
  async findBySlug(slug: string): Promise<Result<Room | null>> {
    try {
      const result = await this.db
        .select()
        .from(rooms)
        .where(and(eq(rooms.slug, slug), isNull(rooms.closedAt)))
        .limit(1);

      const room = result[0] ? this.mapToEntity(result[0]) : null;
      return Ok(room);
    } catch (error) {
      return Err(new Error(`Failed to find room by slug: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find rooms by host ID with pagination
   */
  async findByHostId(hostId: string, params?: PaginationParams): Promise<Result<PaginatedResult<Room>>> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = params || {};
      const offset = (page - 1) * limit;

      // Build sort condition
      const sortColumn = rooms[sortBy as keyof typeof rooms] || rooms.createdAt;
      const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

      // Get total count
      const totalResult = await this.db
        .select({ count: count() })
        .from(rooms)
        .where(eq(rooms.hostId, hostId));

      const total = totalResult[0]?.count || 0;

      // Get paginated results
      const result = await this.db
        .select()
        .from(rooms)
        .where(eq(rooms.hostId, hostId))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      const items = result.map(row => this.mapToEntity(row));
      const totalPages = Math.ceil(total / limit);

      return Ok({
        items,
        total,
        page,
        limit,
        totalPages
      });
    } catch (error) {
      return Err(new Error(`Failed to find rooms by host ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find rooms by status with pagination
   */
  async findByStatus(status: RoomStatus, params?: PaginationParams): Promise<Result<PaginatedResult<Room>>> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = params || {};
      const offset = (page - 1) * limit;

      // Build sort condition
      const sortColumn = rooms[sortBy as keyof typeof rooms] || rooms.createdAt;
      const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

      // Get total count
      const totalResult = await this.db
        .select({ count: count() })
        .from(rooms)
        .where(eq(rooms.status, status));

      const total = totalResult[0]?.count || 0;

      // Get paginated results
      const result = await this.db
        .select()
        .from(rooms)
        .where(eq(rooms.status, status))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      const items = result.map(row => this.mapToEntity(row));
      const totalPages = Math.ceil(total / limit);

      return Ok({
        items,
        total,
        page,
        limit,
        totalPages
      });
    } catch (error) {
      return Err(new Error(`Failed to find rooms by status: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find all active rooms (not closed)
   */
  async findActiveRooms(params?: PaginationParams): Promise<Result<PaginatedResult<Room>>> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = params || {};
      const offset = (page - 1) * limit;

      // Build sort condition
      const sortColumn = rooms[sortBy as keyof typeof rooms] || rooms.createdAt;
      const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

      // Get total count
      const totalResult = await this.db
        .select({ count: count() })
        .from(rooms)
        .where(isNull(rooms.closedAt));

      const total = totalResult[0]?.count || 0;

      // Get paginated results
      const result = await this.db
        .select()
        .from(rooms)
        .where(isNull(rooms.closedAt))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      const items = result.map(row => this.mapToEntity(row));
      const totalPages = Math.ceil(total / limit);

      return Ok({
        items,
        total,
        page,
        limit,
        totalPages
      });
    } catch (error) {
      return Err(new Error(`Failed to find active rooms: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find rooms currently recording
   */
  async findRecordingRooms(): Promise<Result<Room[]>> {
    try {
      const result = await this.db
        .select()
        .from(rooms)
        .where(and(
          eq(rooms.status, 'recording'),
          isNull(rooms.closedAt)
        ))
        .orderBy(desc(rooms.recordingStartedAt));

      const roomList = result.map(row => this.mapToEntity(row));
      return Ok(roomList);
    } catch (error) {
      return Err(new Error(`Failed to find recording rooms: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Create a new room
   */
  async create(data: CreateRoomData): Promise<Result<Room>> {
    try {
      // Check if slug already exists (if provided)
      if (data.slug) {
        const slugExistsResult = await this.slugExists(data.slug);
        if (!slugExistsResult.success) {
          return Err(slugExistsResult.error);
        }
        if (slugExistsResult.data) {
          return Err(new ConflictError('Slug already exists', 'slug'));
        }
      }

      const now = new Date();
      const result = await this.db
        .insert(rooms)
        .values({
          name: data.name,
          slug: data.slug,
          hostId: data.hostId,
          maxParticipants: data.maxParticipants ?? 10,
          allowVideo: data.allowVideo ?? true,
          status: 'waiting',
          createdAt: now,
          updatedAt: now
        })
        .returning();

      if (!result[0]) {
        return Err(new Error('Failed to create room'));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to create room: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Update an existing room
   */
  async update(id: string, data: UpdateRoomData): Promise<Result<Room>> {
    try {
      // Check if room exists
      const existingResult = await this.findById(id);
      if (!existingResult.success) {
        return Err(existingResult.error);
      }
      if (!existingResult.data) {
        return Err(new NotFoundError('Room not found'));
      }

      // Check slug uniqueness if slug is being updated
      if (data.slug && data.slug !== existingResult.data.slug) {
        const slugExistsResult = await this.slugExists(data.slug, id);
        if (!slugExistsResult.success) {
          return Err(slugExistsResult.error);
        }
        if (slugExistsResult.data) {
          return Err(new ConflictError('Slug already exists', 'slug'));
        }
      }

      const updateData: any = {
        updatedAt: new Date()
      };

      // Only include fields that are provided
      if (data.name !== undefined) updateData.name = data.name;
      if (data.slug !== undefined) updateData.slug = data.slug;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.maxParticipants !== undefined) updateData.maxParticipants = data.maxParticipants;
      if (data.allowVideo !== undefined) updateData.allowVideo = data.allowVideo;
      if (data.recordingStartedAt !== undefined) updateData.recordingStartedAt = data.recordingStartedAt;
      if (data.recordingStoppedAt !== undefined) updateData.recordingStoppedAt = data.recordingStoppedAt;
      if (data.closedAt !== undefined) updateData.closedAt = data.closedAt;

      const result = await this.db
        .update(rooms)
        .set(updateData)
        .where(eq(rooms.id, id))
        .returning();

      if (!result[0]) {
        return Err(new NotFoundError('Room not found'));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to update room: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Close a room (soft close by setting status and closedAt)
   */
  async closeRoom(id: string): Promise<Result<void>> {
    try {
      const result = await this.db
        .update(rooms)
        .set({
          status: 'closed',
          closedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(eq(rooms.id, id), isNull(rooms.closedAt)))
        .returning({ id: rooms.id });

      if (!result[0]) {
        return Err(new NotFoundError('Room not found or already closed'));
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to close room: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Check if slug exists (for uniqueness validation)
   */
  async slugExists(slug: string, excludeId?: string): Promise<Result<boolean>> {
    try {
      const conditions = [
        eq(rooms.slug, slug),
        isNull(rooms.closedAt)
      ];

      let query = this.db
        .select({ id: rooms.id })
        .from(rooms)
        .where(and(...conditions));

      if (excludeId) {
        query = query.where(and(...conditions, eq(rooms.id, excludeId)));
      }

      const result = await query.limit(1);
      return Ok(result.length > 0);
    } catch (error) {
      return Err(new Error(`Failed to check slug existence: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Count rooms by host
   */
  async countByHost(hostId: string): Promise<Result<number>> {
    try {
      const result = await this.db
        .select({ count: count() })
        .from(rooms)
        .where(eq(rooms.hostId, hostId));

      return Ok(result[0]?.count || 0);
    } catch (error) {
      return Err(new Error(`Failed to count rooms by host: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Count rooms by status
   */
  async countByStatus(status: RoomStatus): Promise<Result<number>> {
    try {
      const result = await this.db
        .select({ count: count() })
        .from(rooms)
        .where(eq(rooms.status, status));

      return Ok(result[0]?.count || 0);
    } catch (error) {
      return Err(new Error(`Failed to count rooms by status: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find rooms that need cleanup (closed for more than X days)
   */
  async findForCleanup(daysOld: number): Promise<Result<Room[]>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.db
        .select()
        .from(rooms)
        .where(and(
          eq(rooms.status, 'closed'),
          lt(rooms.closedAt, cutoffDate)
        ))
        .orderBy(asc(rooms.closedAt));

      const roomList = result.map(row => this.mapToEntity(row));
      return Ok(roomList);
    } catch (error) {
      return Err(new Error(`Failed to find rooms for cleanup: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Map database row to domain entity
   */
  private mapToEntity(row: any): Room {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status as RoomStatus,
      hostId: row.hostId,
      maxParticipants: row.maxParticipants,
      allowVideo: row.allowVideo,
      recordingStartedAt: row.recordingStartedAt,
      recordingStoppedAt: row.recordingStoppedAt,
      closedAt: row.closedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}