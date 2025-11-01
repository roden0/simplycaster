/**
 * Request Password Reset Use Case
 * 
 * Handles password reset requests by generating secure tokens,
 * storing them in the database, and sending reset emails.
 */

import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { TokenService } from '../../../domain/services/token-service.ts';
import { EmailService, EmailTemplateData } from '../../../domain/services/email-service.ts';
import { Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, EntityNotFoundError } from '../../../domain/errors/index.ts';
import { Database } from '../../../../database/connection.ts';
import { passwordResetTokens } from '../../../../database/schema.ts';
import { eq, and, isNull } from 'drizzle-orm';

/**
 * Request password reset input data
 */
export interface RequestPasswordResetData {
  email: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Request password reset result
 */
export interface RequestPasswordResetResult {
  success: boolean;
  message: string;
  tokenId?: string;
}

/**
 * Use case for requesting password reset
 */
export class RequestPasswordResetUseCase {
  constructor(
    private userRepository: UserRepository,
    private tokenService: TokenService,
    private emailService: EmailService,
    private db: Database
  ) {}

  /**
   * Execute password reset request
   */
  async execute(data: RequestPasswordResetData): Promise<Result<RequestPasswordResetResult>> {
    try {
      // Validate input
      const validationResult = this.validateInput(data);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // Find user by email
      const userResult = await this.userRepository.findByEmail(data.email);
      if (!userResult.success) {
        return Err(userResult.error);
      }

      // Always return success to prevent email enumeration attacks
      // But only send email if user exists and is active
      if (!userResult.data || !userResult.data.isActive) {
        return Ok({
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent.'
        });
      }

      const user = userResult.data;

      // Invalidate any existing active reset tokens for this user
      await this.invalidateExistingTokens(user.id);

      // Generate secure reset token
      const tokenResult = await this.tokenService.generateSecureToken(32);
      if (!tokenResult.success) {
        return Err(tokenResult.error);
      }

      const token = tokenResult.data;

      // Hash token for storage
      const hashResult = await this.tokenService.hashToken(token);
      if (!hashResult.success) {
        return Err(hashResult.error);
      }

      const tokenHash = hashResult.data;

      // Create token record with 1-hour expiration
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      const tokenRecord = await this.db
        .insert(passwordResetTokens)
        .values({
          userId: user.id,
          tokenHash,
          expiresAt,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent
        })
        .returning({ id: passwordResetTokens.id });

      if (!tokenRecord[0]) {
        return Err(new Error('Failed to create password reset token'));
      }

      // Generate reset URL
      const baseUrl = Deno.env.get('BASE_URL') || 'http://localhost:8000';
      const resetUrl = `${baseUrl}/reset-password?token=${token}&id=${tokenRecord[0].id}`;

      // Send password reset email
      const emailResult = await this.sendPasswordResetEmail(user, resetUrl, expiresAt, data.ipAddress);
      if (!emailResult.success) {
        // Log error but don't expose it to prevent information leakage
        console.error('Failed to send password reset email:', emailResult.error);
        
        // Clean up the token since email failed
        await this.db
          .update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(eq(passwordResetTokens.id, tokenRecord[0].id));
      }

      return Ok({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
        tokenId: tokenRecord[0].id
      });

    } catch (error) {
      return Err(new Error(`Failed to request password reset: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(data: RequestPasswordResetData): Result<void> {
    if (!data.email) {
      return Err(new ValidationError('Email is required'));
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return Err(new ValidationError('Invalid email format'));
    }

    return Ok(undefined);
  }

  /**
   * Invalidate existing active reset tokens for user
   */
  private async invalidateExistingTokens(userId: string): Promise<void> {
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
    } catch (error) {
      // Log but don't fail the operation
      console.error('Failed to invalidate existing tokens:', error);
    }
  }

  /**
   * Send password reset email
   */
  private async sendPasswordResetEmail(
    user: any,
    resetUrl: string,
    expiresAt: Date,
    ipAddress?: string
  ): Promise<Result<void>> {
    try {
      const emailData: EmailTemplateData = {
        to: user.email,
        subject: 'Reset your SimplyCaster password',
        templateId: 'password-reset',
        variables: {
          userName: user.email.split('@')[0], // Use email prefix as name fallback
          userEmail: user.email,
          resetUrl,
          expiresAt: expiresAt.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          }),
          ipAddress
        },
        correlationId: `password-reset-${user.id}-${Date.now()}`
      };

      const result = await this.emailService.sendTemplate(emailData);
      if (!result.success) {
        return Err(result.error);
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to send password reset email: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}