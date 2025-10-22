/**
 * List Rooms Route
 * 
 * Handles listing rooms for the authenticated user
 */

import { define } from "../../../utils.ts";
import { getService } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import { RoomRepository } from "../../../lib/domain/repositories/room-repository.ts";
import { requireAuth } from "../../../lib/middleware/auth.ts";

export const handler = define.handlers({
  GET: requireAuth(async (req, user) => {
    try {
      // Parse query parameters
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "10");
      const status = url.searchParams.get("status");

      // Get room repository from container
      const roomRepository = getService<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);

      let result;
      
      if (status) {
        // Filter by status
        result = await roomRepository.findByStatus(status as any, { page, limit });
      } else if (user.role === 'admin') {
        // Admin can see all active rooms
        result = await roomRepository.findActiveRooms({ page, limit });
      } else {
        // Host can only see their own rooms
        result = await roomRepository.findByHostId(user.id, { page, limit });
      }

      if (!result.success) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch rooms",
            code: "INTERNAL_ERROR"
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Success response
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            rooms: result.data.items.map(room => ({
              id: room.id,
              name: room.name,
              slug: room.slug,
              status: room.status,
              hostId: room.hostId,
              maxParticipants: room.maxParticipants,
              allowVideo: room.allowVideo,
              recordingStartedAt: room.recordingStartedAt,
              createdAt: room.createdAt,
              updatedAt: room.updatedAt
            })),
            pagination: {
              page: result.data.page,
              limit: result.data.limit,
              total: result.data.total,
              totalPages: result.data.totalPages
            }
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );

    } catch (error) {
      console.error("List rooms route error:", error);
      
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