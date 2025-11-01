/**
 * Reset Password Use Case
 * 
 * Handles password reset completion by validating tokens,
 * updating user passwords, and cleaning up tokens.
 */

import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { TokenService } from '../../../domain/services/token-service.ts';
import { PasswordService } from '../../../domain/services/password-service.ts';
import { Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, EntityNotFoundError, AuthenticationError } from '../../../domain/errors/index.ts';
import { Database } from '../../../../database/connection.ts';
import { passwordResetTokens, users } from '../../../../database/schema.ts';
import { eq, and, isNull, gte, ne } from 'drizzle-orm';

/**
 * Reset password input data
 */
export interface ResetPasswordData {
  tokenId: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Reset password result
 */
export interface ResetPasswordResult {
  success: boolean;
  message: string;
  userId?: string;
}

/**
 * Use case for resetting password
 */
export class ResetPasswordUseCase {
  constructor(
    private userRepository: UserRepository,
    private tokenService: TokenService,
    private passwordService: PasswordService,
    private db: Database
  ) {}

  /**
   * Execute password reset
   */
  async execute(data: ResetPasswordData): Promise<Result<ResetPasswordResult>> {
    try {
      // Validate input
      const validationResult = this.validateInput(data);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // Find and validate token
      const tokenValidationResult = await this.validateResetToken(data.tokenId, data.token);
      if (!tokenValidationResult.success) {
        return Err(tokenValidationResult.error);
      }

      const { tokenRecord, user } = tokenValidationResult.data;

      // Validate password requirements
      const passwordValidationResult = await this.validatePassword(data.newPassword);
      if (!passwordValidationResult.success) {
        return Err(passwordValidationResult.error);
      }

      // Generate new password hash and salt
      const hashResult = await this.passwordService.hashPassword(data.newPassword);
      if (!hashResult.success) {
        return Err(hashResult.error);
      }

      const { hash, salt } = hashResult.data;

      // Update user password and reset security fields
      const updateResult = await this.userRepository.update(user.id, {
        passwordHash: hash,
        passwordSalt: salt,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: data.ipAddress
      });

      if (!updateResult.success) {
        return Err(updateResult.error);
      }

      // Mark token as used
      await this.markTokenAsUsed(tokenRecord.id, data.ipAddress, data.userAgent);

      // Clean up any other active tokens for this user
      await this.cleanupUserTokens(user.id, tokenRecord.id);

      return Ok({
        success: true,
        message: 'Password has been successfully reset. You can now log in with your new password.',
        userId: user.id
      });

    } catch (error) {
      return Err(new Error(`Failed to reset password: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(data: ResetPasswordData): Result<void> {
    if (!data.tokenId) {
      return Err(new ValidationError('Token ID is required'));
    }

    if (!data.token) {
      return Err(new ValidationError('Reset token is required'));
    }

    if (!data.newPassword) {
      return Err(new ValidationError('New password is required'));
    }

    if (!data.confirmPassword) {
      return Err(new ValidationError('Password confirmation is required'));
    }

    if (data.newPassword !== data.confirmPassword) {
      return Err(new ValidationError('Passwords do not match'));
    }

    return Ok(undefined);
  }

  /**
   * Validate password requirements
   */
  private async validatePassword(password: string): Promise<Result<void>> {
    // Minimum length check
    if (password.length < 8) {
      return Err(new ValidationError('Password must be at least 8 characters long'));
    }

    // Maximum length check (prevent DoS)
    if (password.length > 128) {
      return Err(new ValidationError('Password must be less than 128 characters long'));
    }

    // Check for at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      return Err(new ValidationError('Password must contain at least one uppercase letter'));
    }

    // Check for at least one lowercase letter
    if (!/[a-z]/.test(password)) {
      return Err(new ValidationError('Password must contain at least one lowercase letter'));
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
      return Err(new ValidationError('Password must contain at least one number'));
    }

    // Check for at least one special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\?]/.test(password)) {
      return Err(new ValidationError('Password must contain at least one special character'));
    }

    return Ok(undefined);
  }

  /**
   * Validate reset token
   */
  private async validateResetToken(tokenId: string, token: string): Promise<Result<{ tokenRecord: any, user: any }>> {
    try {
      // Find token record
      const tokenRecords = await this.db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.id, tokenId),
            isNull(passwordResetTokens.usedAt),
            gte(passwordResetTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!tokenRecords[0]) {
        return Err(new AuthenticationError('Invalid or expired reset token'));
      }

      const tokenRecord = tokenRecords[0];

      // Verify token hash
      const hashVerificationResult = await this.tokenService.verifyTokenHash(token, tokenRecord.tokenHash);
      if (!hashVerificationResult.success) {
        return Err(hashVerificationResult.error);
      }

      if (!hashVerificationResult.data) {
        return Err(new AuthenticationError('Invalid reset token'));
      }

      // Find associated user
      const userResult = await this.userRepository.findById(tokenRecord.userId);
      if (!userResult.success) {
        return Err(userResult.error);
      }

      if (!userResult.data) {
        return Err(new EntityNotFoundError('User', tokenRecord.userId));
      }

      const user = userResult.data;

      // Check if user is still active
      if (!user.isActive) {
        return Err(new AuthenticationError('User account is not active'));
      }

      return Ok({ tokenRecord, user });

    } catch (error) {
      return Err(new AuthenticationError(`Token validation failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Mark token as used
   */
  private async markTokenAsUsed(tokenId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    try {
      await this.db
        .update(passwordResetTokens)
        .set({
          usedAt: new Date(),
          ipAddress: ipAddress || null,
          userAgent: userAgent || null
        })
        .where(eq(passwordResetTokens.id, tokenId));
    } catch (error) {
      // Log but don't fail the operation
      console.error('Failed to mark token as used:', error);
    }
  }

  /**
   * Clean up other active tokens for user
   */
  private async cleanupUserTokens(userId: string, excludeTokenId: string): Promise<void> {
    try {
      await this.db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.userId, userId),
            isNull(passwordResetTokens.usedAt),
            ne(passwordResetTokens.id, excludeTokenId)
          )
        );
    } catch (error) {
      // Log but don't fail the operation
      console.error('Failed to cleanup user tokens:', error);
    }
  }
}