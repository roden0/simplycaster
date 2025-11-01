// ============================================================================
// Resend Host Invitation Use Case
// ============================================================================

import type { UserInvitationRepository } from "../../../domain/repositories/user-invitation-repository.ts";
import type { UserRepository } from "../../../domain/repositories/user-repository.ts";
import type { EmailService } from "../../../domain/services/email-service.ts";
import type { TokenService } from "../../../domain/services/token-service.ts";
import { ValidationError, EmailSendingError, EntityNotFoundError } from "../../../domain/errors/index.ts";
import type { Result } from "../../../domain/types/common.ts";
import { Ok, Err } from "../../../domain/types/common.ts";

export interface ResendHostInvitationRequest {
  invitationId: string;
  requestedBy: string;
  organizationName?: string;
}

export interface ResendHostInvitationResponse {
  invitationId: string;
  email: string;
  newExpiresAt: Date;
  setupUrl: string;
}

export class ResendHostInvitationUseCase {
  constructor(
    private userInvitationRepository: UserInvitationRepository,
    private userRepository: UserRepository,
    private emailService: EmailService,
    private tokenService: TokenService
  ) {}

  async execute(request: ResendHostInvitationRequest): Promise<Result<ResendHostInvitationResponse>> {
    try {
      // Validate input
      if (!request.invitationId || !request.requestedBy) {
        return Err(new ValidationError("Invitation ID and requester ID are required"));
      }

      // Find the invitation
      const invitations = await this.userInvitationRepository.findByInviter(request.requestedBy);
      const invitation = invitations.find(inv => inv.id === request.invitationId);
      
      if (!invitation) {
        return Err(new EntityNotFoundError("Invitation", "id"));
      }

      // Check if invitation can be resent
      if (invitation.status === "accepted") {
        return Err(new ValidationError("Cannot resend accepted invitation"));
      }

      if (invitation.status === "revoked") {
        return Err(new ValidationError("Cannot resend revoked invitation"));
      }

      // Get requester information
      const requester = await this.userRepository.findById(request.requestedBy);
      if (!requester) {
        return Err(new ValidationError("Requester not found"));
      }

      // Verify requester has permission
      if (requester.role !== "admin" && invitation.invitedBy !== request.requestedBy) {
        return Err(new ValidationError("Insufficient permissions to resend invitation"));
      }

      // Generate new token
      const tokenResult = await this.tokenService.generateSecureToken(32);
      if (!tokenResult.success) {
        return Err(new Error(`Failed to generate new invitation token: ${tokenResult.error.message}`));
      }

      // Hash new token
      const hashResult = await this.tokenService.hashToken(tokenResult.data);
      if (!hashResult.success) {
        return Err(new Error(`Failed to hash new invitation token: ${hashResult.error.message}`));
      }

      // Update invitation with new token and expiration
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      
      const updatedInvitation = await this.userInvitationRepository.create({
        email: invitation.email,
        role: invitation.role,
        tokenHash: hashResult.data,
        invitedBy: invitation.invitedBy,
        expiresAt: newExpiresAt,
        status: "pending"
      });

      // Mark old invitation as expired
      await this.userInvitationRepository.markAsExpired(invitation.id);

      // Generate new setup URL
      const baseUrl = Deno.env.get("BASE_URL") || "http://localhost:8000";
      const setupUrl = `${baseUrl}/host-setup?token=${encodeURIComponent(tokenResult.data)}`;

      // Send new invitation email
      const emailResult = await this.sendInvitationEmail({
        email: invitation.email,
        hostName: this.extractNameFromEmail(invitation.email),
        invitedByName: requester.email, // Use email as name for now
        invitedByEmail: requester.email,
        setupUrl,
        expiresAt: newExpiresAt,
        organizationName: request.organizationName
      });

      if (!emailResult.success) {
        // Log error but don't fail the operation
        console.error("Failed to send resent invitation email:", emailResult.error.message);
      }

      return Ok({
        invitationId: updatedInvitation.id,
        email: updatedInvitation.email,
        newExpiresAt,
        setupUrl
      });

    } catch (error) {
      return Err(new Error(`Failed to resend host invitation: ${error instanceof Error ? error.message : String(error)}`));
    }
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