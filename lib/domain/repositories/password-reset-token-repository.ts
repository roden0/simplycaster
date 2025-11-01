/**
 * Password Reset Token Repository Interface
 * 
 * Defines the contract for password reset token data access operations.
 */

import { Result, PaginatedResult, PaginationParams } from '../types/common.ts';

/**
 * Password reset token entity
 */
export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

/**
 * Create password reset token data
 */
export interface CreatePasswordResetTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Update password reset token data
 */
export interface UpdatePasswordResetTokenData {
  usedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Password reset token repository interface
 */
export interface PasswordResetTokenRepository {
  /**
   * Find token by ID
   */
  findById(id: string): Promise<Result<PasswordResetToken | null>>;

  /**
   * Find active tokens by user ID
   */
  findActiveByUserId(userId: string): Promise<Result<PasswordResetToken[]>>;

  /**
   * Find token by hash
   */
  findByTokenHash(tokenHash: string): Promise<Result<PasswordResetToken | null>>;

  /**
   * Create a new password reset token
   */
  create(data: CreatePasswordResetTokenData): Promise<Result<PasswordResetToken>>;

  /**
   * Update a password reset token
   */
  update(id: string, data: UpdatePasswordResetTokenData): Promise<Result<PasswordResetToken>>;

  /**
   * Mark token as used
   */
  markAsUsed(id: string, ipAddress?: string, userAgent?: string): Promise<Result<void>>;

  /**
   * Invalidate all active tokens for a user
   */
  invalidateUserTokens(userId: string): Promise<Result<void>>;

  /**
   * Clean up expired tokens
   */
  cleanupExpired(): Promise<Result<number>>;

  /**
   * Find expired tokens for cleanup
   */
  findExpired(limit?: number): Promise<Result<PasswordResetToken[]>>;

  /**
   * Count active tokens by user
   */
  countActiveByUserId(userId: string): Promise<Result<number>>;
}