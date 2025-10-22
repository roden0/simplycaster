/**
 * Drizzle Guest Repository Implementation
 * 
 * Implements GuestRepository interface using Drizzle ORM
 * for PostgreSQL database operations.
 */

import { eq, and, isNull, count, desc, asc, lt, or } from 'drizzle-orm';
import { Database, guests, rooms } from '../../../database/connection.ts';
import { GuestRepository } from '../../domain/repositories/guest-repository.ts';
import { Guest, CreateGuestData, UpdateGuestData } from '../../domain/entities/guest.ts';
import { Result, PaginatedResult, PaginationParams, Ok, Err } from '../../domain/types/common.ts';
import { ValidationError, EntityNotFoundError, ConflictError } from '../../domain/errors/index.ts';

/**
 * Drizzle implementation of GuestRepository
 */
export class DrizzleGuestRepository implements GuestRepository {
  constructor(private db: Database) {}

  /**
   * Find guest by ID
   */
  async findById(id: string): Promise<Result<Guest | null>> {
    try {
      const result = await this.db
        .select()
        .from(guests)
        .where(eq(guests.id, id))
        .limit(1);

      const guest = result[0] ? this.mapToEntity(result[0]) : null;
      return Ok(guest);
    } catch (error) {
      return Err(new Error(`Failed to find guest by ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find guest by access token hash
   */
  async findByTokenHash(tokenHash: string): Promise<Result<Guest | null>> {
    try {
      const result = await this.db
        .select()
        .from(guests)
        .where(eq(guests.accessTokenHash, tokenHash))
        .limit(1);

      const guest = result[0] ? this.mapToEntity(result[0]) : null;
      return Ok(guest);
    } catch (error) {
      return Err(new Error(`Failed to find guest by token hash: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find guests by room ID
   */
  async findByRoomId(roomId: string): Promise<Result<Guest[]>> {
    try {
      const result = await this.db
        .select()
        .from(guests)
        .where(eq(guests.roomId, roomId))
        .orderBy(desc(guests.joinedAt));

      const guestList = result.map(row => this.mapToEntity(row));
      return Ok(guestList);
    } catch (error) {
      return Err(new Error(`Failed to find guests by room ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find active guests by room ID (not left, not kicked, token not expired)
   */
  async findActiveByRoomId(roomId: string): Promise<Result<Guest[]>> {
    try {
      const now = new Date();
      const result = await this.db
        .select()
        .from(guests)
        .where(and(
          eq(guests.roomId, roomId),
          isNull(guests.leftAt),
          isNull(guests.kickedAt),
          gte(guests.tokenExpiresAt, now)
        ))
        .orderBy(desc(guests.joinedAt));

      const guestList = result.map(row => this.mapToEntity(row));
      return Ok(guestList);
    } catch (error) {
      return Err(new Error(`Failed to find active guests by room ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find guests by inviter with pagination
   */
  async findByInviter(invitedBy: string, params?: PaginationParams): Promise<Result<PaginatedResult<Guest>>> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = params || {};
      const offset = (page - 1) * limit;

      // Build sort condition
      const sortColumn = guests[sortBy as keyof typeof guests] || guests.createdAt;
      const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

      // Get total count
      const totalResult = await this.db
        .select({ count: count() })
        .from(guests)
        .where(eq(guests.invitedBy, invitedBy));

      const total = totalResult[0]?.count || 0;

      // Get paginated results
      const result = await this.db
        .select()
        .from(guests)
        .where(eq(guests.invitedBy, invitedBy))
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
      return Err(new Error(`Failed to find guests by inviter: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Create a new guest
   */
  async create(data: CreateGuestData): Promise<Result<Guest>> {
    try {
      // Check if token hash already exists
      const tokenExistsResult = await this.tokenHashExists(data.accessTokenHash);
      if (!tokenExistsResult.success) {
        return Err(tokenExistsResult.error);
      }
      if (tokenExistsResult.data) {
        return Err(new ConflictError('Token hash already exists', 'accessTokenHash'));
      }

      const now = new Date();
      const result = await this.db
        .insert(guests)
        .values({
          roomId: data.roomId,
          displayName: data.displayName,
          email: data.email,
          accessTokenHash: data.accessTokenHash,
          tokenExpiresAt: data.tokenExpiresAt,
          invitedBy: data.invitedBy,
          joinedAt: now,
          lastSeenAt: now,
          createdAt: now
        })
        .returning();

      if (!result[0]) {
        return Err(new Error('Failed to create guest'));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to create guest: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Update an existing guest
   */
  async update(id: string, data: UpdateGuestData): Promise<Result<Guest>> {
    try {
      // Check if guest exists
      const existingResult = await this.findById(id);
      if (!existingResult.success) {
        return Err(existingResult.error);
      }
      if (!existingResult.data) {
        return Err(new NotFoundError('Guest not found'));
      }

      const updateData: any = {};

      // Only include fields that are provided
      if (data.displayName !== undefined) updateData.displayName = data.displayName;
      if (data.lastSeenAt !== undefined) updateData.lastSeenAt = data.lastSeenAt;
      if (data.leftAt !== undefined) updateData.leftAt = data.leftAt;
      if (data.kickedAt !== undefined) updateData.kickedAt = data.kickedAt;
      if (data.kickedBy !== undefined) updateData.kickedBy = data.kickedBy;

      const result = await this.db
        .update(guests)
        .set(updateData)
        .where(eq(guests.id, id))
        .returning();

      if (!result[0]) {
        return Err(new NotFoundError('Guest not found'));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to update guest: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Delete a guest (hard delete since guests are temporary)
   */
  async delete(id: string): Promise<Result<void>> {
    try {
      const result = await this.db
        .delete(guests)
        .where(eq(guests.id, id))
        .returning({ id: guests.id });

      if (!result[0]) {
        return Err(new NotFoundError('Guest not found'));
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to delete guest: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Check if token hash exists (for uniqueness validation)
   */
  async tokenHashExists(tokenHash: string, excludeId?: string): Promise<Result<boolean>> {
    try {
      let query = this.db
        .select({ id: guests.id })
        .from(guests)
        .where(eq(guests.accessTokenHash, tokenHash));

      if (excludeId) {
        query = query.where(and(eq(guests.accessTokenHash, tokenHash), eq(guests.id, excludeId)));
      }

      const result = await query.limit(1);
      return Ok(result.length > 0);
    } catch (error) {
      return Err(new Error(`Failed to check token hash existence: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Count active guests in room
   */
  async countActiveInRoom(roomId: string): Promise<Result<number>> {
    try {
      const now = new Date();
      const result = await this.db
        .select({ count: count() })
        .from(guests)
        .where(and(
          eq(guests.roomId, roomId),
          isNull(guests.leftAt),
          isNull(guests.kickedAt),
          gte(guests.tokenExpiresAt, now)
        ));

      return Ok(result[0]?.count || 0);
    } catch (error) {
      return Err(new Error(`Failed to count active guests in room: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find expired guests for cleanup
   */
  async findExpired(): Promise<Result<Guest[]>> {
    try {
      const now = new Date();
      const result = await this.db
        .select()
        .from(guests)
        .where(lt(guests.tokenExpiresAt, now))
        .orderBy(asc(guests.tokenExpiresAt));

      const guestList = result.map(row => this.mapToEntity(row));
      return Ok(guestList);
    } catch (error) {
      return Err(new Error(`Failed to find expired guests: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find guests from closed rooms for cleanup
   */
  async findFromClosedRooms(): Promise<Result<Guest[]>> {
    try {
      const result = await this.db
        .select({
          id: guests.id,
          roomId: guests.roomId,
          displayName: guests.displayName,
          email: guests.email,
          accessTokenHash: guests.accessTokenHash,
          tokenExpiresAt: guests.tokenExpiresAt,
          joinedAt: guests.joinedAt,
          lastSeenAt: guests.lastSeenAt,
          leftAt: guests.leftAt,
          kickedAt: guests.kickedAt,
          kickedBy: guests.kickedBy,
          invitedBy: guests.invitedBy,
          createdAt: guests.createdAt,
          updatedAt: guests.updatedAt
        })
        .from(guests)
        .innerJoin(rooms, eq(guests.roomId, rooms.id))
        .where(and(
          eq(rooms.status, 'closed'),
          isNull(guests.leftAt),
          isNull(guests.kickedAt)
        ))
        .orderBy(asc(rooms.closedAt));

      const guestList = result.map(row => this.mapToEntity(row));
      return Ok(guestList);
    } catch (error) {
      return Err(new Error(`Failed to find guests from closed rooms: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Bulk expire guests when room closes
   */
  async expireGuestsInRoom(roomId: string): Promise<Result<void>> {
    try {
      const now = new Date();
      await this.db
        .update(guests)
        .set({
          leftAt: now,
          tokenExpiresAt: now
        })
        .where(and(
          eq(guests.roomId, roomId),
          isNull(guests.leftAt),
          isNull(guests.kickedAt)
        ));

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to expire guests in room: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Map database row to domain entity
   */
  private mapToEntity(row: any): Guest {
    return {
      id: row.id,
      roomId: row.roomId,
      displayName: row.displayName,
      email: row.email,
      accessTokenHash: row.accessTokenHash,
      tokenExpiresAt: row.tokenExpiresAt,
      joinedAt: row.joinedAt,
      lastSeenAt: row.lastSeenAt,
      leftAt: row.leftAt,
      kickedAt: row.kickedAt,
      kickedBy: row.kickedBy,
      invitedBy: row.invitedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}