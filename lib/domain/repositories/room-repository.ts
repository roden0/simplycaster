// ============================================================================
// Room Repository Interface
// ============================================================================

import { Room, CreateRoomData, UpdateRoomData } from '../entities/room.ts';
import { RoomStatus, Result, PaginatedResult, PaginationParams } from '../types/common.ts';

/**
 * Room repository interface for data access abstraction
 */
export interface RoomRepository {
  /**
   * Find room by ID
   */
  findById(id: string): Promise<Result<Room | null>>;

  /**
   * Find room by slug
   */
  findBySlug(slug: string): Promise<Result<Room | null>>;

  /**
   * Find rooms by host ID with pagination
   */
  findByHostId(hostId: string, params?: PaginationParams): Promise<Result<PaginatedResult<Room>>>;

  /**
   * Find rooms by status with pagination
   */
  findByStatus(status: RoomStatus, params?: PaginationParams): Promise<Result<PaginatedResult<Room>>>;

  /**
   * Find all active rooms (not closed)
   */
  findActiveRooms(params?: PaginationParams): Promise<Result<PaginatedResult<Room>>>;

  /**
   * Find rooms currently recording
   */
  findRecordingRooms(): Promise<Result<Room[]>>;

  /**
   * Create a new room
   */
  create(data: CreateRoomData): Promise<Result<Room>>;

  /**
   * Update an existing room
   */
  update(id: string, data: UpdateRoomData): Promise<Result<Room>>;

  /**
   * Close a room (soft close by setting status and closedAt)
   */
  closeRoom(id: string): Promise<Result<void>>;

  /**
   * Check if slug exists (for uniqueness validation)
   */
  slugExists(slug: string, excludeId?: string): Promise<Result<boolean>>;

  /**
   * Count rooms by host
   */
  countByHost(hostId: string): Promise<Result<number>>;

  /**
   * Count rooms by status
   */
  countByStatus(status: RoomStatus): Promise<Result<number>>;

  /**
   * Find rooms that need cleanup (closed for more than X days)
   */
  findForCleanup(daysOld: number): Promise<Result<Room[]>>;
}