/**
 * Room Creation Route
 * 
 * Handles room creation using CreateRoomUseCase
 */

import { define } from "../../../utils.ts";
import { getService } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import { CreateRoomUseCase, type CreateRoomInput } from "../../../lib/application/use-cases/room/index.ts";
import { CachedRoomService } from "../../../lib/infrastructure/services/cached-room-service.ts";
import { ValidationError, EntityNotFoundError, BusinessRuleError } from "../../../lib/domain/errors/index.ts";
import { requireRole } from "../../../lib/middleware/auth.ts";
import { createRoleBasedRateLimitedHandler } from "../../../lib/middleware/rate-limit.ts";

export const handler = define.handlers({
  POST: createRoleBasedRateLimitedHandler(
    ['host', 'admin'],
    async (req, user) => {
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
      const createRoomUseCase = await getService<CreateRoomUseCase>(
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
      const { room, message } = result.data;\n      \n      // Initialize WebRTC capabilities for the room\n      try {\n        const { getWebRTCServiceManager } = await import(\"../../../lib/webrtc/index.ts\");\n        const serviceManager = getWebRTCServiceManager();\n        const roomCoordinator = serviceManager.getRoomCoordinator();\n        \n        // Initialize WebRTC session for the room\n        await roomCoordinator.initializeRoom(room.id, {\n          hostId: room.hostId,\n          maxParticipants: room.maxParticipants,\n          allowVideo: room.allowVideo,\n          roomName: room.name\n        });\n        \n        console.log(`WebRTC capabilities initialized for room ${room.id}`);\n      } catch (webrtcError) {\n        console.error(\"Error initializing WebRTC capabilities:\", webrtcError);\n        // Don't fail the request if WebRTC initialization fails\n      }
      
      // Warm the cache with the newly created room
      try {
        const cachedRoomService = await getService<CachedRoomService>(ServiceKeys.CACHED_ROOM_SERVICE);
        // The cached room service should have already cached the room during creation
        // but we can ensure it's warmed here if needed
      } catch (cacheError) {
        console.error("Error warming cache after room creation:", cacheError);
        // Don't fail the request if cache warming fails
      }
      
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
  },
  {
    skipForAdmin: true,
    customEndpoint: '/api/rooms/create'
  }
  )
});