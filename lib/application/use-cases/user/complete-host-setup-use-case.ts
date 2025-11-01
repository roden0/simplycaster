// ============================================================================
// Complete Host Setup Use Case
// ============================================================================

import type { UserInvitationRepository } from "../../../domain/repositories/user-invitation-repository.ts";
import type { UserRepository } from "../../../domain/repositories/user-repository.ts";
import type { TokenService } from "../../../domain/services/token-service.ts";
import type { PasswordService } from "../../../domain/services/password-service.ts";
import { ValidationError, AuthenticationError, EntityNotFoundError } from "../../../domain/errors/index.ts";
import type { Result } from "../../../domain/types/common.ts";
import { Ok, Err } from "../../../domain/types/common.ts";

export interface CompleteHostSetupRequest {
  token: string;
  name?: string;
  password: string;
  confirmPassword: string;
}

export interface CompleteHostSetupResponse {
  userId: string;
  email: string;
  role: "host" | "admin";
  name?: string;
}

export class CompleteHostSetupUseCase {
  constructor(
    private userInvitationRepository: UserInvitationRepository,
    private userRepository: UserRepository,
    private tokenService: TokenService,
    private passwordService: PasswordService
  ) {}

  async execute(request: CompleteHostSetupRequest): Promise<Result<CompleteHostSetupResponse>> {
    try {
      // Validate input
      const validationResult = this.validateRequest(request);
      if (!validationResult.success) {
        return validationResult;
      }

      // Hash the token to find the invitation
      const hashResult = await this.tokenService.hashToken(request.token);
      if (!hashResult.success) {
        return Err(new AuthenticationError("Invalid invitation token"));
      }

      // Find invitation by token hash
      const invitation = await this.userInvitationRepository.findByTokenHash(hashResult.data);
      if (!invitation) {
        return Err(new EntityNotFoundError("Invitation", "token"));
      }

      // Check invitation status
      if (invitation.status !== "pending") {
        return Err(new ValidationError(`Invitation is ${invitation.status}`));
      }

      // Check if invitation has expired
      if (invitation.expiresAt < new Date()) {
        // Mark as expired
        await this.userInvitationRepository.markAsExpired(invitation.id);
        return Err(new ValidationError("Invitation has expired"));
      }

      // Check if user already exists (shouldn't happen, but safety check)
      const existingUser = await this.userRepository.findByEmail(invitation.email);
      if (existingUser) {
        return Err(new ValidationError("User already exists"));
      }

      // Hash password
      const passwordHashResult = await this.passwordService.hashPassword(request.password);
      if (!passwordHashResult.success) {
        return Err(new Error(`Failed to hash password: ${passwordHashResult.error.message}`));
      }

      // Create user
      const user = await this.userRepository.create({
        email: invitation.email,
        passwordHash: passwordHashResult.data.hash,
        passwordSalt: passwordHashResult.data.salt,
        role: invitation.role,
        isActive: true,
        emailVerified: true, // Email is verified through invitation process
        createdBy: invitation.invitedBy
      });

      // Mark invitation as accepted
      await this.userInvitationRepository.updateStatus(
        invitation.id,
        "accepted",
        new Date()
      );

      return Ok({
        userId: user.id,
        email: user.email,
        role: user.role,
        name: request.name
      });

    } catch (error) {
      return Err(new Error(`Failed to complete host setup: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private validateRequest(request: CompleteHostSetupRequest): Result<void> {
    if (!request.token || !request.token.trim()) {
      return Err(new ValidationError("Invitation token is required"));
    }

    if (!request.password || request.password.length < 8) {
      return Err(new ValidationError("Password must be at least 8 characters long"));
    }

    if (request.password !== request.confirmPassword) {
      return Err(new ValidationError("Passwords do not match"));
    }

    // Password strength validation
    const hasUpperCase = /[A-Z]/.test(request.password);
    const hasLowerCase = /[a-z]/.test(request.password);
    const hasNumbers = /\d/.test(request.password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(request.password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      return Err(new ValidationError(
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
      ));
    }

    return Ok(undefined);
  }
}