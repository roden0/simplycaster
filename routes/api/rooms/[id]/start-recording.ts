/**
 * Start Recording Route
 * 
 * Handles recording start using StartRecordingUseCase
 */

import { define } from "../../../../utils.ts";
import { getService } from "../../../../lib/container/global.ts";
import { ServiceKeys } from "../../../../lib/container/registry.ts";
import { StartRecordingUseCase, type StartRecordingInput } from "../../../../lib/application/use-cases/room/index.ts";
import { CachedRoomService } from "../../../../lib/infrastructure/services/cached-room-service.ts";
import { CachedRecordingService } from "../../../../lib/infrastructure/services/cached-recording-service.ts";
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
      
      // Use authenticated user as host
      const input: StartRecordingInput = {
        roomId: roomId,
        hostId: user.id,
        participantCount: body.participantCount
      };

      // Get start recording use case from container
      const startRecordingUseCase = await getService<StartRecordingUseCase>(
        ServiceKeys.START_RECORDING_USE_CASE
      );

      // Execute recording start
      const result = await startRecordingUseCase.execute(input);

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
            error: "Failed to start recording",
            code: "INTERNAL_ERROR"
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Success response
      const { recording, room, storageInfo, message } = result.data;
      
      // Warm cache with updated room and recording data
      try {
        const cachedRoomService = await getService<CachedRoomService>(ServiceKeys.CACHED_ROOM_SERVICE);
        const cachedRecordingService = await getService<CachedRecordingService>(ServiceKeys.CACHED_RECORDING_SERVICE);
        
        // Update room status in cache
        await cachedRoomService.updateRoomStatus(roomId, room.status);
        
        // The recording should already be cached by the use case, but ensure it's there
        // Cache warming is handled by the cached services automatically
      } catch (cacheError) {
        console.error("Error updating cache after recording start:", cacheError);
        // Don't fail the request if cache update fails
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            recording: {
              id: recording.id,
              roomId: recording.roomId,
              folderName: recording.folderName,
              status: recording.status,
              participantCount: recording.participantCount,
              startedAt: recording.startedAt,
              createdBy: recording.createdBy
            },
            room: {
              id: room.id,
              name: room.name,
              status: room.status,
              recordingStartedAt: room.recordingStartedAt
            },
            storageInfo,
            message
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );

    } catch (error) {
      console.error("Start recording route error:", error);
      
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