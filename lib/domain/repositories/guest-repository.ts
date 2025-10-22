// ============================================================================
// Guest Repository Interface
// ============================================================================

import { Guest, CreateGuestData, UpdateGuestData } from '../entities/guest.ts';
import { Result, PaginatedResult, PaginationParams } from '../types/common.ts';

/**
 * Guest repository interface for data access abstraction
 */
export interface GuestRepository {
  /**
   * Find guest by ID
   */
  findById(id: string): Promise<Result<Guest | null>>;

  /**
   * Find guest by access token hash
   */
  findByTokenHash(tokenHash: string): Promise<Result<Guest | null>>;

  /**
   * Find guests by room ID
   */
  findByRoomId(roomId: string): Promise<Result<Guest[]>>;

  /**
   * Find active guests by room ID (not left, not kicked, token not expired)
   */
  findActiveByRoomId(roomId: string): Promise<Result<Guest[]>>;

  /**
   * Find guests by inviter with pagination
   */
  findByInviter(invitedBy: string, params?: PaginationParams): Promise<Result<PaginatedResult<Guest>>>;

  /**
   * Create a new guest
   */
  create(data: CreateGuestData): Promise<Result<Guest>>;

  /**
   * Update an existing guest
   */
  update(id: string, data: UpdateGuestData): Promise<Result<Guest>>;

  /**
   * Delete a guest (hard delete since guests are temporary)
   */
  delete(id: string): Promise<Result<void>>;

  /**
   * Check if token hash exists (for uniqueness validation)
   */
  tokenHashExists(tokenHash: string, excludeId?: string): Promise<Result<boolean>>;

  /**
   * Count active guests in room
   */
  countActiveInRoom(roomId: string): Promise<Result<number>>;

  /**
   * Count active guests by room (alias for consistency)
   */
  countActiveByRoom(roomId: string): Promise<Result<number>>;

  /**
   * Find active guest by room and email
   */
  findActiveByRoomAndEmail(roomId: string, email: string): Promise<Result<Guest | null>>;

  /**
   * Find expired guests for cleanup
   */
  findExpired(): Promise<Result<Guest[]>>;

  /**
   * Find guests from closed rooms for cleanup
   */
  findFromClosedRooms(): Promise<Result<Guest[]>>;

  /**
   * Bulk expire guests when room closes
   */
  expireGuestsInRoom(roomId: string): Promise<Result<void>>;
}