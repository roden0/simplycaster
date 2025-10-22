/**
 * Room Creation Route
 * 
 * Handles room creation using CreateRoomUseCase
 */

import { define } from "../../../utils.ts";
import { getService } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import { CreateRoomUseCase, type CreateRoomInput } from "../../../lib/application/use-cases/room/index.ts";
import { ValidationError, EntityNotFoundError, BusinessRuleError } from "../../../lib/domain/errors/index.ts";
import { requireRole } from "../../../lib/middleware/auth.ts";

export const handler = define.handlers({
  POST: requireRole(['host', 'admin'])(async (req, user) => {
    try {
      // Parse request body
      const body = await req.json();
      
      // Use authenticated user as host
      const input: CreateRoomInput = {
        name: body.name,
        slug: body.slug,
        hostId: user.id,
        maxParticipants: body.maxParticipants,
        allowVideo: body.allowVideo
      };

      // Get create room use case from container
      const createRoomUseCase = getService<CreateRoomUseCase>(
        ServiceKeys.CREATE_ROOM_USE_CASE
      );

      // Execute room creation
      const result = await createRoomUseCase.execute(input);

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
            error: "Room creation failed",
            code: "INTERNAL_ERROR"
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Success response
      const { room, message } = result.data;
      
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            room: {
              id: room.id,
              name: room.name,
              slug: room.slug,
              status: room.status,
              hostId: room.hostId,
              maxParticipants: room.maxParticipants,
              allowVideo: room.allowVideo,
              createdAt: room.createdAt,
              updatedAt: room.updatedAt
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
      console.error("Room creation route error:", error);
      
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