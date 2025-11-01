// ============================================================================
// List Host Invitations Use Case
// ============================================================================

import type { UserInvitationRepository } from "../../../domain/repositories/user-invitation-repository.ts";
import type { UserRepository } from "../../../domain/repositories/user-repository.ts";
import { ValidationError } from "../../../domain/errors/index.ts";
import type { Result } from "../../../domain/types/common.ts";
import { Ok, Err } from "../../../domain/types/common.ts";
import type { UserInvitation } from "../../../../database/schema.ts";

export interface ListHostInvitationsRequest {
  requestedBy: string;
  limit?: number;
  offset?: number;
}

export interface InvitationSummary {
  id: string;
  email: string;
  role: "host" | "admin";
  status: "pending" | "accepted" | "expired" | "revoked";
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
}

export interface ListHostInvitationsResponse {
  invitations: InvitationSummary[];
  total: number;
  hasMore: boolean;
}

export class ListHostInvitationsUseCase {
  constructor(
    private userInvitationRepository: UserInvitationRepository,
    private userRepository: UserRepository
  ) {}

  async execute(request: ListHostInvitationsRequest): Promise<Result<ListHostInvitationsResponse>> {
    try {
      // Validate input
      if (!request.requestedBy) {
        return Err(new ValidationError("Requester ID is required"));
      }

      const limit = Math.min(request.limit || 50, 100); // Max 100 items
      const offset = Math.max(request.offset || 0, 0);

      // Get requester information
      const requester = await this.userRepository.findById(request.requestedBy);
      if (!requester) {
        return Err(new ValidationError("Requester not found"));
      }

      // Verify requester has permission (only admins can list invitations)
      if (requester.role !== "admin") {
        return Err(new ValidationError("Only admins can list host invitations"));
      }

      // Get invitations
      const invitations = await this.userInvitationRepository.findByInviter(
        request.requestedBy,
        limit + 1, // Get one extra to check if there are more
        offset
      );

      // Check for expired invitations and update them
      await this.updateExpiredInvitations(invitations);

      // Prepare response
      const hasMore = invitations.length > limit;
      const resultInvitations = hasMore ? invitations.slice(0, limit) : invitations;

      const invitationSummaries: InvitationSummary[] = resultInvitations.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
        acceptedAt: inv.acceptedAt || undefined
      }));

      // Get total count (for pagination)
      const total = await this.userInvitationRepository.countPendingByInviter(request.requestedBy);

      return Ok({
        invitations: invitationSummaries,
        total,
        hasMore
      });

    } catch (error) {
      return Err(new Error(`Failed to list host invitations: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private async updateExpiredInvitations(invitations: UserInvitation[]): Promise<void> {
    const now = new Date();
    const expiredInvitations = invitations.filter(
      inv => inv.status === "pending" && inv.expiresAt < now
    );

    // Update expired invitations
    for (const invitation of expiredInvitations) {
      try {
        await this.userInvitationRepository.markAsExpired(invitation.id);
        invitation.status = "expired"; // Update local copy for response
      } catch (error) {
        console.error(`Failed to mark invitation ${invitation.id} as expired:`, error);
      }
    }
  }
}