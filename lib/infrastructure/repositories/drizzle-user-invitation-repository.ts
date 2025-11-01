// ============================================================================
// Drizzle User Invitation Repository Implementation
// ============================================================================

import { eq, and, lt, desc, count } from "drizzle-orm";
import type { Database } from "../../../database/connection.ts";
import { userInvitations } from "../../../database/schema.ts";
import type { UserInvitation, NewUserInvitation } from "../../../database/schema.ts";
import type { UserInvitationRepository } from "../../domain/repositories/user-invitation-repository.ts";

export class DrizzleUserInvitationRepository implements UserInvitationRepository {
  constructor(private db: Database) {}

  async create(invitation: NewUserInvitation): Promise<UserInvitation> {
    const [created] = await this.db
      .insert(userInvitations)
      .values(invitation)
      .returning();

    if (!created) {
      throw new Error("Failed to create user invitation");
    }

    return created;
  }

  async findByTokenHash(tokenHash: string): Promise<UserInvitation | null> {
    const [invitation] = await this.db
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.tokenHash, tokenHash))
      .limit(1);

    return invitation || null;
  }

  async findByEmailAndRole(email: string, role: "host" | "admin"): Promise<UserInvitation | null> {
    const [invitation] = await this.db
      .select()
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.email, email.toLowerCase()),
          eq(userInvitations.role, role),
          eq(userInvitations.status, "pending")
        )
      )
      .limit(1);

    return invitation || null;
  }

  async findByInviter(
    inviterId: string,
    limit = 50,
    offset = 0
  ): Promise<UserInvitation[]> {
    return await this.db
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.invitedBy, inviterId))
      .orderBy(desc(userInvitations.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async updateStatus(
    id: string,
    status: "pending" | "accepted" | "expired" | "revoked",
    acceptedAt?: Date
  ): Promise<UserInvitation> {
    const updateData: Partial<UserInvitation> = { status };
    if (acceptedAt) {
      updateData.acceptedAt = acceptedAt;
    }

    const [updated] = await this.db
      .update(userInvitations)
      .set(updateData)
      .where(eq(userInvitations.id, id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update user invitation");
    }

    return updated;
  }

  async markAsExpired(id: string): Promise<UserInvitation> {
    return this.updateStatus(id, "expired");
  }

  async deleteExpired(): Promise<number> {
    const result = await this.db
      .delete(userInvitations)
      .where(
        and(
          eq(userInvitations.status, "expired"),
          lt(userInvitations.expiresAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // 7 days ago
        )
      );

    return result.rowCount || 0;
  }

  async countPendingByInviter(inviterId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.invitedBy, inviterId),
          eq(userInvitations.status, "pending")
        )
      );

    return result?.count || 0;
  }

  async findExpiredPending(): Promise<UserInvitation[]> {
    return await this.db
      .select()
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.status, "pending"),
          lt(userInvitations.expiresAt, new Date())
        )
      );
  }
}