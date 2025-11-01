// ============================================================================
// User Invitation Repository Interface
// ============================================================================

import type { UserInvitation, NewUserInvitation } from "../../../database/schema.ts";

export interface UserInvitationRepository {
  /**
   * Create a new user invitation
   */
  create(invitation: NewUserInvitation): Promise<UserInvitation>;

  /**
   * Find invitation by token hash
   */
  findByTokenHash(tokenHash: string): Promise<UserInvitation | null>;

  /**
   * Find invitation by email and role (for checking duplicates)
   */
  findByEmailAndRole(email: string, role: "host" | "admin"): Promise<UserInvitation | null>;

  /**
   * Find invitations by inviter
   */
  findByInviter(inviterId: string, limit?: number, offset?: number): Promise<UserInvitation[]>;

  /**
   * Update invitation status
   */
  updateStatus(
    id: string,
    status: "pending" | "accepted" | "expired" | "revoked",
    acceptedAt?: Date
  ): Promise<UserInvitation>;

  /**
   * Mark invitation as expired
   */
  markAsExpired(id: string): Promise<UserInvitation>;

  /**
   * Delete expired invitations (cleanup)
   */
  deleteExpired(): Promise<number>;

  /**
   * Count pending invitations by inviter
   */
  countPendingByInviter(inviterId: string): Promise<number>;

  /**
   * Find all pending invitations that have expired
   */
  findExpiredPending(): Promise<UserInvitation[]>;
}