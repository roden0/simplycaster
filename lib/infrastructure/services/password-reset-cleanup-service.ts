/**
 * Password Reset Token Cleanup Service
 * 
 * Handles cleanup of expired password reset tokens to maintain database hygiene.
 */

import { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token-repository.ts';
import { Result, Ok, Err } from '../../domain/types/common.ts';

/**
 * Cleanup service for password reset tokens
 */
export class PasswordResetCleanupService {
  constructor(
    private passwordResetTokenRepository: PasswordResetTokenRepository
  ) {}

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<Result<number>> {
    try {
      const result = await this.passwordResetTokenRepository.cleanupExpired();
      if (!result.success) {
        return Err(result.error);
      }

      const cleanedCount = result.data;
      
      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired password reset tokens`);
      }

      return Ok(cleanedCount);
    } catch (error) {
      return Err(new Error(`Failed to cleanup expired tokens: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Get expired tokens count without deleting them
   */
  async getExpiredTokensCount(): Promise<Result<number>> {
    try {
      const result = await this.passwordResetTokenRepository.findExpired(1000);
      if (!result.success) {
        return Err(result.error);
      }

      return Ok(result.data.length);
    } catch (error) {
      return Err(new Error(`Failed to get expired tokens count: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Schedule periodic cleanup (call this from a cron job or similar)
   */
  async scheduleCleanup(intervalMinutes: number = 60): Promise<void> {
    const cleanup = async () => {
      try {
        await this.cleanupExpiredTokens();
      } catch (error) {
        console.error('Password reset token cleanup failed:', error);
      }
    };

    // Run initial cleanup
    await cleanup();

    // Schedule periodic cleanup
    setInterval(cleanup, intervalMinutes * 60 * 1000);
    
    console.log(`Password reset token cleanup scheduled every ${intervalMinutes} minutes`);
  }
}