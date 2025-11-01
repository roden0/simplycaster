// ============================================================================
// Resend Host Invitation API
// ============================================================================

import { Handlers } from "$fresh/server.ts";
import { getContainer } from "../../../../../lib/container/global.ts";
import { ServiceKeys } from "../../../../../lib/container/registry.ts";
import type { ResendHostInvitationUseCase } from "../../../../../lib/application/use-cases/user/index.ts";
import type { UserRepository } from "../../../../../lib/domain/repositories/user-repository.ts";
import { auth } from "../../../../../lib/auth/better-auth.ts";

interface ResendInvitationRequestBody {
  organizationName?: string;
}

export const handler: Handlers = {
  // POST /api/admin/invitations/[id]/resend - Resend host invitation
  async POST(req, ctx) {
    try {
      // Authenticate user
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session?.user) {
        return new Response("Unauthorized", { status: 401 });
      }

      // Get user from database to check role
      const container = getContainer();
      const userRepository = container.getSync<UserRepository>(ServiceKeys.USER_REPOSITORY);
      const userResult = await userRepository.findById(session.user.id);
      
      if (!userResult.success || !userResult.data) {
        return new Response("User not found", { status: 404 });
      }

      // Check admin role
      if (userResult.data.role !== "admin") {
        return new Response("Forbidden: Admin access required", { status: 403 });
      }

      // Get invitation ID from URL
      const invitationId = ctx.params.id;
      if (!invitationId) {
        return new Response(
          JSON.stringify({ error: "Invitation ID is required" }),
          { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Parse request body (optional)
      let body: ResendInvitationRequestBody = {};
      try {
        body = await req.json();
      } catch {
        // Body is optional for resend
      }

      // Get use case
      const resendInvitationUseCase = await container.get<ResendHostInvitationUseCase>(ServiceKeys.RESEND_HOST_INVITATION_USE_CASE);

      // Execute use case
      const result = await resendInvitationUseCase.execute({
        invitationId,
        requestedBy: session.user.id,
        organizationName: body.organizationName
      });

      if (!result.success) {
        const status = result.error.name === "ValidationError" ? 400 :
                      result.error.name === "NotFoundError" ? 404 : 500;
        
        return new Response(
          JSON.stringify({ error: result.error.message }),
          { 
            status,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: result.data
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );

    } catch (error) {
      console.error("Error resending host invitation:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};