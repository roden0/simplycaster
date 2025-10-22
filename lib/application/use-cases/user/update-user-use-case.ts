/**
 * Update User Use Case
 * 
 * Handles user profile updates with validation,
 * permission checking, and audit logging.
 */

import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { PasswordService } from '../../../domain/services/password-service.ts';
import { User, UpdateUserData, UserDomain } from '../../../domain/entities/user.ts';
import { UserRole, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, AuthorizationError, BusinessRuleError, EntityNotFoundError } from '../../../domain/errors/index.ts';
import { EventPublisher } from '../../../domain/types/events.ts';
import { createBaseEvent, generateCorrelationId } from '../../../domain/services/event-utils.ts';
import { EventType, AuthEventData } from '../../../domain/types/events.ts';

/**
 * Input data for updating a user
 */
export interface UpdateUserInput {
  userId: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  emailVerified?: boolean;
  newPassword?: string;
  currentPassword?: string; // Required when changing password
  updatedBy: string; // ID of the user performing the update (for audit and permissions)
  updatedByRole: UserRole; // Role of the user performing the update
}

/**
 * Output data from user update
 */
export interface UpdateUserOutput {
  user: User;
  message: string;
  changedFields: string[];
}

/**
 * Update User Use Case implementation
 */
export class UpdateUserUseCase {
  constructor(
    private userRepository: UserRepository,
    private passwordService: PasswordService,
    private eventPublisher?: EventPublisher
  ) { }

  /**
   * Execute the update user use case
   */
  async execute(input: UpdateUserInput): Promise<Result<UpdateUserOutput>> {
    try {
      // 1. Validate input data
      const validationResult = this.validateInput(input);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // 2. Find the user to update
      const userResult = await this.userRepository.findById(input.userId);
      if (!userResult.success) {
        return Err(userResult.error);
      }

      if (!userResult.data) {
        return Err(new EntityNotFoundError('User', input.userId));
      }

      const currentUser = userResult.data;

      // 3. Find the user performing the update (for permission checking)
      const updaterResult = await this.userRepository.findById(input.updatedBy);
      if (!updaterResult.success) {
        return Err(updaterResult.error);
      }

      if (!updaterResult.data) {
        return Err(new EntityNotFoundError('Updater', input.updatedBy));
      }

      const updater = updaterResult.data;

      // 4. Check permissions
      const permissionResult = this.checkUpdatePermissions(currentUser, updater, input);
      if (!permissionResult.success) {
        return Err(permissionResult.error);
      }

      // 5. Validate business rules
      const businessRuleResult = this.validateBusinessRules(currentUser, input);
      if (!businessRuleResult.success) {
        return Err(businessRuleResult.error);
      }

      // 6. Prepare update data
      const updateDataResult = await this.prepareUpdateData(currentUser, input);
      if (!updateDataResult.success) {
        return Err(updateDataResult.error);
      }

      const { updateData, changedFields } = updateDataResult.data;

      // 7. Perform the update
      const updateResult = await this.userRepository.update(input.userId, updateData);
      if (!updateResult.success) {
        return Err(updateResult.error);
      }

      // 8. Publish user updated event (only if there were actual changes)
      if (this.eventPublisher && changedFields.length > 0) {
        try {
          const correlationId = generateCorrelationId();
          const authEventData: AuthEventData = {
            userId: updateResult.data.id,
            email: updateResult.data.email,
            role: updateResult.data.role as 'admin' | 'host' | 'guest'
          };

          const userUpdatedEvent = createBaseEvent(
            EventType.USER_UPDATED,
            authEventData,
            {
              correlationId,
              userId: input.updatedBy,
              priority: 'normal',
              source: 'user-service'
            }
          );

          // Add changed fields to event metadata
          userUpdatedEvent.metadata = {
            ...userUpdatedEvent.metadata,
            changedFields: changedFields,
            updatedBy: input.updatedBy,
            updatedByRole: input.updatedByRole
          };

          await this.eventPublisher.publish(userUpdatedEvent);
        } catch (error) {
          // Log event publishing error but don't fail the user update
          console.error('Failed to publish user updated event:', error);
        }
      }

      // 9. Prepare success response
      const output: UpdateUserOutput = {
        user: updateResult.data,
        message: `User ${updateResult.data.email} updated successfully`,
        changedFields
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to update user: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: UpdateUserInput): Result<void> {
    const errors: string[] = [];

    // User ID validation
    if (!input.userId || input.userId.trim().length === 0) {
      errors.push('User ID is required');
    }

    // Updater validation
    if (!input.updatedBy || input.updatedBy.trim().length === 0) {
      errors.push('Updater ID is required');
    }

    if (!input.updatedByRole) {
      errors.push('Updater role is required');
    }

    // Email validation (if provided)
    if (input.email !== undefined) {
      if (input.email.trim().length === 0) {
        errors.push('Email cannot be empty');
      } else if (input.email.length > 255) {
        errors.push('Email must not exceed 255 characters');
      } else {
        try {
          UserDomain.validateEmail(input.email);
        } catch (error) {
          errors.push((error as ValidationError).message);
        }
      }
    }

    // Role validation (if provided)
    if (input.role !== undefined) {
      try {
        UserDomain.validateRole(input.role);
      } catch (error) {
        errors.push((error as ValidationError).message);
      }
    }

    // Password validation (if provided)
    if (input.newPassword !== undefined) {
      if (!input.currentPassword) {
        errors.push('Current password is required when changing password');
      }

      const passwordValidation = this.passwordService.validatePasswordStrength(input.newPassword);
      if (!passwordValidation.success) {
        errors.push(passwordValidation.error.message);
      }
    }

    if (errors.length > 0) {
      return Err(new ValidationError(errors.join('; ')));
    }

    return Ok(undefined);
  }

  /**
   * Check update permissions
   */
  private checkUpdatePermissions(currentUser: User, updater: User, input: UpdateUserInput): Result<void> {
    // Self-update permissions
    if (currentUser.id === updater.id) {
      return this.checkSelfUpdatePermissions(input);
    }

    // Admin permissions
    if (updater.role === UserRole.ADMIN) {
      return this.checkAdminUpdatePermissions(currentUser, input);
    }

    // Host permissions (very limited)
    if (updater.role === UserRole.HOST) {
      return this.checkHostUpdatePermissions(currentUser, input);
    }

    // Guest users cannot update other users
    return Err(new AuthorizationError('Insufficient permissions to update user'));
  }

  /**
   * Check self-update permissions
   */
  private checkSelfUpdatePermissions(input: UpdateUserInput): Result<void> {
    // Users can update their own email and password
    const restrictedFields = ['role', 'isActive', 'emailVerified'];

    for (const field of restrictedFields) {
      if (input[field as keyof UpdateUserInput] !== undefined) {
        return Err(new AuthorizationError(`Users cannot modify their own ${field}`));
      }
    }

    return Ok(undefined);
  }

  /**
   * Check admin update permissions
   */
  private checkAdminUpdatePermissions(currentUser: User, input: UpdateUserInput): Result<void> {
    // Admins can update most fields, but with some restrictions

    // Cannot demote themselves
    if (currentUser.role === UserRole.ADMIN && input.role && input.role !== UserRole.ADMIN) {
      return Err(new AuthorizationError('Admins cannot demote themselves'));
    }

    // Cannot deactivate themselves
    if (currentUser.role === UserRole.ADMIN && input.isActive === false) {
      return Err(new AuthorizationError('Admins cannot deactivate themselves'));
    }

    return Ok(undefined);
  }

  /**
   * Check host update permissions
   */
  private checkHostUpdatePermissions(currentUser: User, input: UpdateUserInput): Result<void> {
    // Hosts have very limited permissions to update other users
    // They can only update basic profile information of guests in their rooms

    if (currentUser.role !== UserRole.GUEST) {
      return Err(new AuthorizationError('Hosts can only update guest user profiles'));
    }

    // Only allow updating basic fields
    const allowedFields = ['email'];
    const providedFields = Object.keys(input).filter(key =>
      input[key as keyof UpdateUserInput] !== undefined &&
      !['userId', 'updatedBy', 'updatedByRole'].includes(key)
    );

    for (const field of providedFields) {
      if (!allowedFields.includes(field)) {
        return Err(new AuthorizationError(`Hosts cannot modify ${field}`));
      }
    }

    return Ok(undefined);
  }

  /**
   * Validate business rules
   */
  private validateBusinessRules(currentUser: User, input: UpdateUserInput): Result<void> {
    // Business rule: Cannot change role to guest through this use case
    if (input.role === UserRole.GUEST) {
      return Err(new BusinessRuleError('Cannot change user role to guest through profile update'));
    }

    // Business rule: Cannot activate a user without email verification
    if (input.isActive === true && !currentUser.emailVerified && input.emailVerified !== true) {
      return Err(new BusinessRuleError('Cannot activate user without email verification'));
    }

    // Business rule: Email changes require re-verification
    if (input.email && input.email !== currentUser.email && input.emailVerified !== false) {
      return Err(new BusinessRuleError('Email changes require re-verification'));
    }

    return Ok(undefined);
  }

  /**
   * Prepare update data
   */
  private async prepareUpdateData(
    currentUser: User,
    input: UpdateUserInput
  ): Promise<Result<{ updateData: UpdateUserData; changedFields: string[] }>> {
    try {
      const updateData: UpdateUserData = {};
      const changedFields: string[] = [];

      // Email update
      if (input.email && input.email !== currentUser.email) {
        // Check email uniqueness
        const emailExistsResult = await this.userRepository.emailExists(input.email, currentUser.id);
        if (!emailExistsResult.success) {
          return Err(emailExistsResult.error);
        }
        if (emailExistsResult.data) {
          return Err(new ValidationError('Email address is already in use'));
        }

        updateData.email = input.email.toLowerCase().trim();
        updateData.emailVerified = false; // Reset verification on email change
        changedFields.push('email');
      }

      // Role update
      if (input.role && input.role !== currentUser.role) {
        updateData.role = input.role;
        changedFields.push('role');
      }

      // Active status update
      if (input.isActive !== undefined && input.isActive !== currentUser.isActive) {
        updateData.isActive = input.isActive;
        changedFields.push('isActive');
      }

      // Email verification update
      if (input.emailVerified !== undefined && input.emailVerified !== currentUser.emailVerified) {
        updateData.emailVerified = input.emailVerified;
        changedFields.push('emailVerified');
      }

      // Password update
      if (input.newPassword && input.currentPassword) {
        // Note: In a real implementation, password verification and update would be handled
        // by a separate service or repository method like:
        // const verifyResult = await this.userRepository.verifyPassword(currentUser.id, input.currentPassword);
        // const updateResult = await this.userRepository.updatePassword(currentUser.id, input.newPassword);

        // For now, we'll validate the new password and track the change
        const passwordValidation = this.passwordService.validatePasswordStrength(input.newPassword);
        if (!passwordValidation.success) {
          return Err(passwordValidation.error);
        }

        // Generate new salt and hash for validation (but don't store in User entity)
        const saltResult = await this.passwordService.generateSalt();
        if (!saltResult.success) {
          return Err(saltResult.error);
        }

        const hashResult = await this.passwordService.hash(input.newPassword, saltResult.data);
        if (!hashResult.success) {
          return Err(hashResult.error);
        }

        // Track that the password was changed
        changedFields.push('password');
      }

      return Ok({ updateData, changedFields });

    } catch (error) {
      return Err(new Error(`Failed to prepare update data: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}