/**
 * Drizzle Password Reset Token Repository Implementation
 * 
 * Implements PasswordResetTokenRepository interface using Drizzle ORM
 * for PostgreSQL database operations.
 */

import { eq, and, isNull, lt, count, desc, gte } from 'drizzle-orm';
import { Database, passwordResetTokens } from '../../../database/connection.ts';
import { 
  PasswordResetTokenRepository,
  PasswordResetToken,
  CreatePasswordResetTokenData,
  UpdatePasswordResetTokenData
} from '../../domain/repositories/password-reset-token-repository.ts';
import { Result, Ok, Err } from '../../domain/types/common.ts';
import { ValidationError, EntityNotFoundError } from '../../domain/errors/index.ts';

/**
 * Drizzle implementation of PasswordResetTokenRepository
 */
export class DrizzlePasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private db: Database) {}

  /**
   * Find token by ID
   */
  async findById(id: string): Promise<Result<PasswordResetToken | null>> {
    try {
      const result = await this.db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.id, id))
        .limit(1);

      const token = result[0] ? this.mapToEntity(result[0]) : null;
      return Ok(token);
    } catch (error) {
      return Err(new Error(`Failed to find token by ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find active tokens by user ID
   */
  async findActiveByUserId(userId: string): Promise<Result<PasswordResetToken[]>> {
    try {
      const now = new Date();
      const result = await this.db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, userId),
            isNull(passwordResetTokens.usedAt),
            gte(passwordResetTokens.expiresAt, now)
          )
        )
        .orderBy(desc(passwordResetTokens.createdAt));

      const tokens = result.map(row => this.mapToEntity(row));
      return Ok(tokens);
    } catch (error) {
      return Err(new Error(`Failed to find active tokens by user ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find token by hash
   */
  async findByTokenHash(tokenHash: string): Promise<Result<PasswordResetToken | null>> {
    try {
      const now = new Date();
      const result = await this.db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gte(passwordResetTokens.expiresAt, now)
          )
        )
        .limit(1);

      const token = result[0] ? this.mapToEntity(result[0]) : null;
      return Ok(token);
    } catch (error) {
      return Err(new Error(`Failed to find token by hash: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Create a new password reset token
   */
  async create(data: CreatePasswordResetTokenData): Promise<Result<PasswordResetToken>> {
    try {
      const now = new Date();
      const result = await this.db
        .insert(passwordResetTokens)
        .values({
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          createdAt: now
        })
        .returning();

      if (!result[0]) {
        return Err(new Error('Failed to create password reset token'));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to create password reset token: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Update a password reset token
   */
  async update(id: string, data: UpdatePasswordResetTokenData): Promise<Result<PasswordResetToken>> {
    try {
      const updateData: any = {};

      // Only include fields that are provided
      if (data.usedAt !== undefined) updateData.usedAt = data.usedAt;
      if (data.ipAddress !== undefined) updateData.ipAddress = data.ipAddress;
      if (data.userAgent !== undefined) updateData.userAgent = data.userAgent;

      const result = await this.db
        .update(passwordResetTokens)
        .set(updateData)
        .where(eq(passwordResetTokens.id, id))
        .returning();

      if (!result[0]) {
        return Err(new EntityNotFoundError('PasswordResetToken', id));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to update password reset token: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Mark token as used
   */
  async markAsUsed(id: string, ipAddress?: string, userAgent?: string): Promise<Result<void>> {
    try {
      const result = await this.db
        .update(passwordResetTokens)
        .set({
          usedAt: new Date(),
          ipAddress: ipAddress || null,
          userAgent: userAgent || null
        })
        .where(eq(passwordResetTokens.id, id))
        .returning({ id: passwordResetTokens.id });

      if (!result[0]) {
        return Err(new EntityNotFoundError('PasswordResetToken', id));
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to mark token as used: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Invalidate all active tokens for a user
   */
  async invalidateUserTokens(userId: string): Promise<Result<void>> {
    try {
      await this.db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.userId, userId),
            isNull(passwordResetTokens.usedAt)
          )
        );

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to invalidate user tokens: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpired(): Promise<Result<number>> {
    try {
      const now = new Date();
      const result = await this.db
        .delete(passwordResetTokens)
        .where(lt(passwordResetTokens.expiresAt, now))
        .returning({ id: passwordResetTokens.id });

      return Ok(result.length);
    } catch (error) {
      return Err(new Error(`Failed to cleanup expired tokens: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find expired tokens for cleanup
   */
  async findExpired(limit: number = 100): Promise<Result<PasswordResetToken[]>> {
    try {
      const now = new Date();
      const result = await this.db
        .select()
        .from(passwordResetTokens)
        .where(lt(passwordResetTokens.expiresAt, now))
        .orderBy(passwordResetTokens.expiresAt)
        .limit(limit);

      const tokens = result.map(row => this.mapToEntity(row));
      return Ok(tokens);
    } catch (error) {
      return Err(new Error(`Failed to find expired tokens: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Count active tokens by user
   */
  async countActiveByUserId(userId: string): Promise<Result<number>> {
    try {
      const now = new Date();
      const result = await this.db
        .select({ count: count() })
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, userId),
            isNull(passwordResetTokens.usedAt),
            gte(passwordResetTokens.expiresAt, now)
          )
        );

      return Ok(result[0]?.count || 0);
    } catch (error) {
      return Err(new Error(`Failed to count active tokens by user: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Map database row to domain entity
   */
  private mapToEntity(row: any): PasswordResetToken {
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt
    };
  }
}