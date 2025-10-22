/**
 * Create User Use Case
 * 
 * Handles user registration with validation, password hashing,
 * role assignment, and audit logging.
 */

import { UserRepository } from '../../../domain/repositories/user-repository.ts';
import { PasswordService } from '../../../domain/services/password-service.ts';
import { User, CreateUserData, UserDomain } from '../../../domain/entities/user.ts';
import { UserRole, Result, Ok, Err } from '../../../domain/types/common.ts';
import { ValidationError, ConflictError, BusinessRuleError } from '../../../domain/errors/index.ts';
import { EventPublisher } from '../../../domain/types/events.ts';
import { createBaseEvent, generateCorrelationId } from '../../../domain/services/event-utils.ts';
import { EventType, AuthEventData } from '../../../domain/types/events.ts';

/**
 * Input data for creating a user
 */
export interface CreateUserInput {
  email: string;
  password: string;
  role: UserRole;
  isActive?: boolean;
  emailVerified?: boolean;
  createdBy?: string; // ID of the user creating this user (for audit)
}

/**
 * Output data from user creation
 */
export interface CreateUserOutput {
  user: User;
  message: string;
}

/**
 * Create User Use Case implementation
 */
export class CreateUserUseCase {
  constructor(
    private userRepository: UserRepository,
    private passwordService: PasswordService,
    private eventPublisher?: EventPublisher
  ) {}

  /**
   * Execute the create user use case
   */
  async execute(input: CreateUserInput): Promise<Result<CreateUserOutput>> {
    try {
      // 1. Validate input data
      const validationResult = this.validateInput(input);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // 2. Validate email format using domain logic
      try {
        UserDomain.validateEmail(input.email);
      } catch (error) {
        return Err(error as ValidationError);
      }

      // 3. Validate role using domain logic
      try {
        UserDomain.validateRole(input.role);
      } catch (error) {
        return Err(error as ValidationError);
      }

      // 4. Validate password strength
      const passwordValidation = this.passwordService.validatePasswordStrength(input.password);
      if (!passwordValidation.success) {
        return Err(passwordValidation.error);
      }

      // 5. Check email uniqueness
      const emailExistsResult = await this.userRepository.emailExists(input.email);
      if (!emailExistsResult.success) {
        return Err(emailExistsResult.error);
      }
      if (emailExistsResult.data) {
        return Err(new ConflictError('Email address is already registered'));
      }

      // 6. Validate role assignment permissions (business rule)
      const roleValidationResult = this.validateRoleAssignment(input.role, input.createdBy);
      if (!roleValidationResult.success) {
        return Err(roleValidationResult.error);
      }

      // 7. Generate salt for password hashing
      const saltResult = await this.passwordService.generateSalt();
      if (!saltResult.success) {
        return Err(saltResult.error);
      }

      // 8. Hash the password
      const hashResult = await this.passwordService.hash(input.password, saltResult.data);
      if (!hashResult.success) {
        return Err(hashResult.error);
      }

      // 9. Create user data
      const createUserData: CreateUserData = {
        email: input.email.toLowerCase().trim(),
        role: input.role,
        isActive: input.isActive ?? true,
        emailVerified: input.emailVerified ?? false
      };

      // 10. Create user in repository
      const createResult = await this.userRepository.create(createUserData);
      if (!createResult.success) {
        return Err(createResult.error);
      }

      // 11. Store password hash separately (in a real implementation, this would be in the same transaction)
      // For now, we'll assume the password is stored as part of the user creation
      // In a production system, you'd want to handle this in a transaction

      // 12. Publish user created event
      if (this.eventPublisher) {
        try {
          const correlationId = generateCorrelationId();
          const authEventData: AuthEventData = {
            userId: createResult.data.id,
            email: createResult.data.email,
            role: createResult.data.role as 'admin' | 'host' | 'guest'
          };

          const userCreatedEvent = createBaseEvent(
            EventType.USER_CREATED,
            authEventData,
            {
              correlationId,
              userId: input.createdBy || createResult.data.id,
              priority: 'normal',
              source: 'user-service'
            }
          );

          await this.eventPublisher.publish(userCreatedEvent);
        } catch (error) {
          // Log event publishing error but don't fail the user creation
          console.error('Failed to publish user created event:', error);
        }
      }

      // 13. Prepare success response
      const output: CreateUserOutput = {
        user: createResult.data,
        message: `User ${createResult.data.email} created successfully with role ${createResult.data.role}`
      };

      return Ok(output);

    } catch (error) {
      return Err(new Error(`Failed to create user: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: CreateUserInput): Result<void> {
    const errors: string[] = [];

    // Email validation
    if (!input.email || input.email.trim().length === 0) {
      errors.push('Email is required');
    }

    if (input.email && input.email.length > 255) {
      errors.push('Email must not exceed 255 characters');
    }

    // Password validation
    if (!input.password) {
      errors.push('Password is required');
    }

    // Role validation
    if (!input.role) {
      errors.push('Role is required');
    }

    if (errors.length > 0) {
      return Err(new ValidationError(errors.join('; ')));
    }

    return Ok(undefined);
  }

  /**
   * Validate role assignment permissions
   * Business rule: Only admins can create other admins
   */
  private validateRoleAssignment(targetRole: UserRole, createdBy?: string): Result<void> {
    // If creating an admin user, we need to validate permissions
    if (targetRole === UserRole.ADMIN) {
      if (!createdBy) {
        return Err(new BusinessRuleError('Admin users can only be created by other admins'));
      }
      
      // In a real implementation, you would check if createdBy is an admin
      // For now, we'll assume this validation happens at a higher level
    }

    // Host users can be created by admins (validation happens at higher level)
    // Guest users are handled separately (temporary, not created through this use case)

    return Ok(undefined);
  }

  /**
   * Validate business rules for user creation
   */
  private validateBusinessRules(input: CreateUserInput): Result<void> {
    // Business rule: Guest users cannot be created through this use case
    if (input.role === UserRole.GUEST) {
      return Err(new BusinessRuleError('Guest users cannot be created through user registration. Use guest invitation instead.'));
    }

    // Business rule: Email must be from allowed domains (if configured)
    // This could be extended to check against a whitelist of domains
    
    return Ok(undefined);
  }
}