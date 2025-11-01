// ============================================================================
// Validate Invitation Token API
// ============================================================================

import { Handlers } from "$fresh/server.ts";
import { getContainer } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import type { UserInvitationRepository } from "../../../lib/domain/repositories/user-invitation-repository.ts";
import type { TokenService } from "../../../lib/domain/services/token-service.ts";

export const handler: Handlers = {
  // GET /api/auth/validate-invitation-token?token=... - Validate invitation token
  async GET(req, _ctx) {
    try {
      // Get token from query parameters
      const url = new URL(req.url);
      const token = url.searchParams.get("token");

      if (!token) {
        return new Response(
          JSON.stringify({ error: "Token is required" }),
          { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Get services
      const container = getContainer();
      const tokenService = container.getSync<TokenService>(ServiceKeys.TOKEN_SERVICE);
      const userInvitationRepository = container.getSync<UserInvitationRepository>(ServiceKeys.USER_INVITATION_REPOSITORY);

      // Hash the token to find the invitation
      const hashResult = await tokenService.hashToken(token);
      if (!hashResult.success) {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: "Invalid token format" 
          }),
          { 
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Find invitation by token hash
      const invitation = await userInvitationRepository.findByTokenHash(hashResult.data);
      if (!invitation) {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: "Invitation not found" 
          }),
          { 
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Check invitation status
      if (invitation.status !== "pending") {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: `Invitation is ${invitation.status}` 
          }),
          { 
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Check if invitation has expired
      if (invitation.expiresAt < new Date()) {
        // Mark as expired
        await userInvitationRepository.markAsExpired(invitation.id);
        
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: "Invitation has expired" 
          }),
          { 
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Token is valid
      return new Response(
        JSON.stringify({
          valid: true,
          data: {
            email: invitation.email,
            role: invitation.role,
            expiresAt: invitation.expiresAt.toISOString()
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );

    } catch (error) {
      console.error("Error validating invitation token:", error);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Internal server error" 
        }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};