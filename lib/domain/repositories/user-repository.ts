// ============================================================================
// User Repository Interface
// ============================================================================

import { User, CreateUserData, UpdateUserData } from '../entities/user.ts';
import { UserRole, Result, PaginatedResult, PaginationParams } from '../types/common.ts';

/**
 * User repository interface for data access abstraction
 */
export interface UserRepository {
  /**
   * Find user by ID
   */
  findById(id: string): Promise<Result<User | null>>;

  /**
   * Find user by email
   */
  findByEmail(email: string): Promise<Result<User | null>>;

  /**
   * Find users by role with pagination
   */
  findByRole(role: UserRole, params?: PaginationParams): Promise<Result<PaginatedResult<User>>>;

  /**
   * Find all active users with pagination
   */
  findActive(params?: PaginationParams): Promise<Result<PaginatedResult<User>>>;

  /**
   * Create a new user
   */
  create(data: CreateUserData): Promise<Result<User>>;

  /**
   * Update an existing user
   */
  update(id: string, data: UpdateUserData): Promise<Result<User>>;

  /**
   * Soft delete a user
   */
  delete(id: string): Promise<Result<void>>;

  /**
   * Check if email exists (for uniqueness validation)
   */
  emailExists(email: string, excludeId?: string): Promise<Result<boolean>>;

  /**
   * Count total users by role
   */
  countByRole(role: UserRole): Promise<Result<number>>;

  /**
   * Find users with failed login attempts above threshold
   */
  findWithFailedAttempts(threshold: number): Promise<Result<User[]>>;

  /**
   * Find locked users
   */
  findLocked(): Promise<Result<User[]>>;
}