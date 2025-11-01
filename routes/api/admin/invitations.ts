// ============================================================================
// Admin Host Invitations API
// ============================================================================

import { Handlers } from "$fresh/server.ts";
import { getContainer } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import type { InviteHostUseCase, ListHostInvitationsUseCase } from "../../../lib/application/use-cases/user/index.ts";
import type { UserRepository } from "../../../lib/domain/repositories/user-repository.ts";
import { auth } from "../../../lib/auth/better-auth.ts";

interface InviteHostRequestBody {
  email: string;
  role: "host" | "admin";
  organizationName?: string;
}

interface ResendInvitationRequestBody {
  invitationId: string;
  organizationName?: string;
}

export const handler: Handlers = {
  // POST /api/admin/invitations - Create new host invitation
  async POST(req, _ctx) {
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

      // Parse request body
      const body: InviteHostRequestBody = await req.json();

      // Validate required fields
      if (!body.email || !body.role) {
        return new Response(
          JSON.stringify({ error: "Email and role are required" }),
          { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Get use case
      const inviteHostUseCase = await container.get<InviteHostUseCase>(ServiceKeys.INVITE_HOST_USE_CASE);

      // Execute use case
      const result = await inviteHostUseCase.execute({
        email: body.email,
        role: body.role,
        invitedBy: session.user.id,
        organizationName: body.organizationName
      });

      if (!result.success) {
        const status = result.error.name === "ValidationError" ? 400 :
                      result.error.name === "ConflictError" ? 409 : 500;
        
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
          status: 201,
          headers: { "Content-Type": "application/json" }
        }
      );

    } catch (error) {
      console.error("Error creating host invitation:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  },

  // GET /api/admin/invitations - List host invitations
  async GET(req, _ctx) {
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

      // Parse query parameters
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      // Get use case
      const listInvitationsUseCase = await container.get<ListHostInvitationsUseCase>(ServiceKeys.LIST_HOST_INVITATIONS_USE_CASE);

      // Execute use case
      const result = await listInvitationsUseCase.execute({
        requestedBy: session.user.id,
        limit,
        offset
      });

      if (!result.success) {
        const status = result.error.name === "ValidationError" ? 400 : 500;
        
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
      console.error("Error listing host invitations:", error);
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