/**
 * Invite Guest Route
 * 
 * Handles guest invitation using InviteGuestUseCase
 */

import { define } from "../../../../utils.ts";
import { getService } from "../../../../lib/container/global.ts";
import { ServiceKeys } from "../../../../lib/container/registry.ts";
import { InviteGuestUseCase, type InviteGuestInput } from "../../../../lib/application/use-cases/room/index.ts";
import { ValidationError, EntityNotFoundError, BusinessRuleError, ConflictError } from "../../../../lib/domain/errors/index.ts";
import { requireRole } from "../../../../lib/middleware/auth.ts";

export const handler = define.handlers({
  POST: requireRole(['host', 'admin'])(async (req, user, ctx) => {
    try {
      // Get room ID from URL parameters
      const roomId = ctx.params.id;

      if (!roomId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Room ID is required",
            code: "VALIDATION_ERROR"
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Parse request body
      const body = await req.json();

      // Validate required fields
      if (!body.displayName) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Display name is required",
            code: "VALIDATION_ERROR"
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Use authenticated user as host
      const input: InviteGuestInput = {
        roomId: roomId,
        hostId: user.id,
        displayName: body.displayName,
        email: body.email,
        tokenExpirationHours: body.tokenExpirationHours
      };

      // Get invite guest use case from container
      const inviteGuestUseCase = getService<InviteGuestUseCase>(
        ServiceKeys.INVITE_GUEST_USE_CASE
      );

      // Execute guest invitation
      const result = await inviteGuestUseCase.execute(input);

      if (!result.success) {
        // Handle different error types
        const error = result.error;

        if (error instanceof ValidationError) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error.message,
              code: error.code,
              field: error.field
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        if (error instanceof EntityNotFoundError) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error.message,
              code: error.code
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        if (error instanceof ConflictError) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error.message,
              code: error.code
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        if (error instanceof BusinessRuleError) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error.message,
              code: error.code,
              rule: error.rule
            }),
            {
              status: 422,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        // Generic error
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to invite guest",
            code: "INTERNAL_ERROR"
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Success response
      const { guest, room, inviteToken, inviteUrl, expiresAt, message } = result.data;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            guest: {
              id: guest.id,
              roomId: guest.roomId,
              displayName: guest.displayName,
              email: guest.email,
              tokenExpiresAt: guest.tokenExpiresAt,
              joinedAt: guest.joinedAt,
              invitedBy: guest.invitedBy
            },
            room: {
              id: room.id,
              name: room.name,
              slug: room.slug,
              status: room.status
            },
            invitation: {
              token: inviteToken,
              url: inviteUrl,
              expiresAt: expiresAt.toISOString()
            },
            message
          }
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" }
        }
      );

    } catch (error) {
      console.error("Invite guest route error:", error);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Internal server error",
          code: "INTERNAL_ERROR"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  })
});