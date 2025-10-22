/**
 * List Rooms Route
 * 
 * Handles listing rooms for the authenticated user
 */

import { define } from "../../../utils.ts";
import { getService } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import { RoomRepository } from "../../../lib/domain/repositories/room-repository.ts";
import { CachedRoomService } from "../../../lib/infrastructure/services/cached-room-service.ts";
import { requireAuth } from "../../../lib/middleware/auth.ts";

export const handler = define.handlers({
  GET: requireAuth(async (req, user) => {
    try {
      // Parse query parameters
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "10");
      const status = url.searchParams.get("status");

      // Get cached room service from container for better performance
      const cachedRoomService = getService<CachedRoomService>(ServiceKeys.CACHED_ROOM_SERVICE);
      const roomRepository = getService<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);

      let rooms: any[] = [];
      let pagination = {
        page,
        limit,
        total: 0,
        totalPages: 0
      };
      
      try {
        if (status) {
          // Filter by status - use repository for complex queries
          const result = await roomRepository.findByStatus(status as any, { page, limit });
          if (result.success) {
            rooms = result.data.items;
            pagination = {
              page: result.data.page,
              limit: result.data.limit,
              total: result.data.total,
              totalPages: result.data.totalPages
            };
          }
        } else if (user.role === 'admin') {
          // Admin can see all active rooms - use cached service for better performance
          const allRooms = await cachedRoomService.getActiveRooms();
          
          // Apply pagination manually for cached results
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          rooms = allRooms.slice(startIndex, endIndex);
          
          pagination = {
            page,
            limit,
            total: allRooms.length,
            totalPages: Math.ceil(allRooms.length / limit)
          };
        } else {
          // Host can only see their own rooms - use cached service for better performance
          const hostRooms = await cachedRoomService.getRoomsByHostId(user.id);
          
          // Apply pagination manually for cached results
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          rooms = hostRooms.slice(startIndex, endIndex);
          
          pagination = {
            page,
            limit,
            total: hostRooms.length,
            totalPages: Math.ceil(hostRooms.length / limit)
          };
        }
      } catch (cacheError) {
        console.error("Cache error in room listing, falling back to repository:", cacheError);
        
        // Fallback to repository on cache error
        let result;
        if (status) {
          result = await roomRepository.findByStatus(status as any, { page, limit });
        } else if (user.role === 'admin') {
          result = await roomRepository.findActiveRooms({ page, limit });
        } else {
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
        
        rooms = result.data.items;
        pagination = {
          page: result.data.page,
          limit: result.data.limit,
          total: result.data.total,
          totalPages: result.data.totalPages
        };
      }

      // Success response
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            rooms: rooms.map(room => ({
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
            pagination
          }
        }),
        {
          status: 200,
          headers: { 
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=60" // Cache for 1 minute
          }
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