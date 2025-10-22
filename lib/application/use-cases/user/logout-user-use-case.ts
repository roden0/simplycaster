/**
 * Logout User Use Case
 * 
 * Handles user logout with token invalidation and event publishing.
 */

import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { TokenService } from '../../../domain/services/token-service.ts';
import { SessionService } from '../../../domain/services/session-service.ts';
import { User } from '../../../domain/entities/user.ts';
import { Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, EntityNotFoundError } from '../../../domain/errors/index.ts';
import { EventPublisher } from '../../../domain/types/events.ts';
import { createBaseEvent, generateCorrelationId } from '../../../domain/services/event-utils.ts';
import { EventType, AuthEventData } from '../../../domain/types/events.ts';

/**
 * Input data for user logout
 */
export interface LogoutUserInput {
  userId: string;
  token?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Output data from user logout
 */
export interface LogoutUserOutput {
  message: string;
  loggedOut: boolean;
}

/**
 * Logout User Use Case implementation
 */
export class LogoutUserUseCase {
  constructor(
    private userRepository: UserRepository,
    private tokenService: TokenService,
    private sessionService?: SessionService,
    private eventPublisher?: EventPublisher
  ) {}

  /**
   * Execute the logout user use case
   */
  async execute(input: LogoutUserInput): Promise<Result<LogoutUserOutput>> {
    try {
      // 1. Validate input data
      const validationResult = this.validateInput(input);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // 2. Find user
      const userResult = await this.userRepository.findById(input.userId);
      if (!userResult.success) {
        return Err(userResult.error);
      }

      if (!userResult.data) {
        return Err(new EntityNotFoundError('User', input.userId));
      }

      const user = userResult.data;

      // 3. Invalidate token if provided
      if (input.token) {
        try {
          const invalidateResult = await this.tokenService.invalidateToken(input.token);
          if (!invalidateResult.success) {
            console.error('Failed to invalidate token:', invalidateResult.error);
            // Don't fail logout for token invalidation errors
          }
        } catch (error) {
          console.error('Error invalidating token:', error);
        }
      }

      // 4. Invalidate session if provided
      if (this.sessionService && input.sessionId) {
        try {
          const sessionResult = await this.sessionService.invalidateSession(input.sessionId);
          if (!sessionResult.success) {
            console.error('Failed to invalidate session:', sessionResult.error);
            // Don't fail logout for session invalidation errors
          }
        } catch (error) {
          console.error('Error invalidating session:', error);
        }
      }

      // 5. Publish user logout event
      if (this.eventPublisher) {
        try {
          const correlationId = generateCorrelationId();
          const authEventData: AuthEventData = {
            userId: user.id,
            email: user.email,
            role: user.role as 'admin' | 'host' | 'guest',
            sessionId: input.sessionId,
            ipAddress: input.ipAddress
          };

          const userLogoutEvent = createBaseEvent(
            EventType.USER_LOGOUT,
            authEventData,
            {
              correlationId,
              userId: user.id,
              priority: 'normal',
              source: 'auth-service'
            }
          );

          await this.eventPublisher.publish(userLogoutEvent);
        } catch (error) {
          // Log event publishing error but don't fail the logout
          console.error('Failed to publish user logout event:', error);
        }
      }

      // 6. Prepare success response
      const output: LogoutUserOutput = {
        message: 'User logged out successfully',
        loggedOut: true
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Logout failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: LogoutUserInput): Result<void> {
    const errors: string[] = [];

    // User ID validation
    if (!input.userId || input.userId.trim().length === 0) {
      errors.push('User ID is required');
    }

    if (errors.length > 0) {
      return Err(new ValidationError(errors.join('; ')));
    }

    return Ok(undefined);
  }
}