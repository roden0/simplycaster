// ============================================================================
// Invite Host Use Case
// ============================================================================

import type { UserInvitationRepository } from "../../../domain/repositories/user-invitation-repository.ts";
import type { UserRepository } from "../../../domain/repositories/user-repository.ts";
import type { EmailService } from "../../../domain/services/email-service.ts";
import type { TokenService } from "../../../domain/services/token-service.ts";
import { ValidationError, ConflictError, EmailSendingError } from "../../../domain/errors/index.ts";
import type { Result } from "../../../domain/types/common.ts";
import { Ok, Err } from "../../../domain/types/common.ts";

export interface InviteHostRequest {
  email: string;
  role: "host" | "admin";
  invitedBy: string;
  organizationName?: string;
}

export interface InviteHostResponse {
  invitationId: string;
  email: string;
  role: "host" | "admin";
  expiresAt: Date;
  setupUrl: string;
}

export class InviteHostUseCase {
  constructor(
    private userInvitationRepository: UserInvitationRepository,
    private userRepository: UserRepository,
    private emailService: EmailService,
    private tokenService: TokenService
  ) {}

  async execute(request: InviteHostRequest): Promise<Result<InviteHostResponse>> {
    try {
      // Validate input
      const validationResult = this.validateRequest(request);
      if (!validationResult.success) {
        return validationResult;
      }

      // Check if user already exists
      const existingUser = await this.userRepository.findByEmail(request.email);
      if (existingUser) {
        return Err(new ConflictError("User with this email already exists"));
      }

      // Check if there's already a pending invitation
      const existingInvitation = await this.userInvitationRepository.findByEmailAndRole(
        request.email,
        request.role
      );
      if (existingInvitation) {
        return Err(new ConflictError("Pending invitation already exists for this email and role"));
      }

      // Get inviter information
      const inviter = await this.userRepository.findById(request.invitedBy);
      if (!inviter) {
        return Err(new ValidationError("Inviter not found"));
      }

      // Verify inviter has permission to invite
      if (inviter.role !== "admin") {
        return Err(new ValidationError("Only admins can invite new hosts"));
      }

      // Generate secure token
      const tokenResult = await this.tokenService.generateSecureToken(32);
      if (!tokenResult.success) {
        return Err(new Error(`Failed to generate invitation token: ${tokenResult.error.message}`));
      }

      // Hash token for storage
      const hashResult = await this.tokenService.hashToken(tokenResult.data);
      if (!hashResult.success) {
        return Err(new Error(`Failed to hash invitation token: ${hashResult.error.message}`));
      }

      // Set expiration (7 days from now)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Create invitation
      const invitation = await this.userInvitationRepository.create({
        email: request.email.toLowerCase(),
        role: request.role,
        tokenHash: hashResult.data,
        invitedBy: request.invitedBy,
        expiresAt,
        status: "pending"
      });

      // Generate setup URL
      const baseUrl = Deno.env.get("BASE_URL") || "http://localhost:8000";
      const setupUrl = `${baseUrl}/host-setup?token=${encodeURIComponent(tokenResult.data)}`;

      // Send invitation email
      const emailResult = await this.sendInvitationEmail({
        email: request.email,
        hostName: this.extractNameFromEmail(request.email),
        invitedByName: inviter.email, // Use email as name for now
        invitedByEmail: inviter.email,
        setupUrl,
        expiresAt,
        organizationName: request.organizationName
      });

      if (!emailResult.success) {
        // Log error but don't fail the invitation creation
        console.error("Failed to send invitation email:", emailResult.error.message);
      }

      return Ok({
        invitationId: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        setupUrl
      });

    } catch (error) {
      return Err(new Error(`Failed to invite host: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private validateRequest(request: InviteHostRequest): Result<void> {
    if (!request.email || !request.email.trim()) {
      return Err(new ValidationError("Email is required"));
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.email)) {
      return Err(new ValidationError("Invalid email format"));
    }

    if (!request.role || !["host", "admin"].includes(request.role)) {
      return Err(new ValidationError("Role must be 'host' or 'admin'"));
    }

    if (!request.invitedBy || !request.invitedBy.trim()) {
      return Err(new ValidationError("Inviter ID is required"));
    }

    return Ok(undefined);
  }

  private async sendInvitationEmail(data: {
    email: string;
    hostName: string;
    invitedByName: string;
    invitedByEmail: string;
    setupUrl: string;
    expiresAt: Date;
    organizationName?: string;
  }): Promise<Result<void>> {
    try {
      const result = await this.emailService.sendTemplate("host-invitation", {
        to: data.email,
        variables: {
          hostName: data.hostName,
          invitedByName: data.invitedByName,
          invitedByEmail: data.invitedByEmail,
          setupUrl: data.setupUrl,
          expiresAt: data.expiresAt.toLocaleDateString(),
          organizationName: data.organizationName
        }
      });

      if (!result.success) {
        return Err(new EmailSendingError(`Failed to send invitation email: ${result.error}`));
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new EmailSendingError(`Email sending failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private extractNameFromEmail(email: string): string {
    const localPart = email.split("@")[0];
    // Convert dots and underscores to spaces and capitalize
    return localPart
      .replace(/[._]/g, " ")
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }
}