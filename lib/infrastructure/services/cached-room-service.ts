/**
 * Cached Room Service
 * 
 * Implements cache-aside pattern for room data operations with automatic
 * fallback to database queries and cache invalidation on updates.
 * Includes room listing cache and participant count caching.
 */

import { Room, CreateRoomData, UpdateRoomData } from '../../domain/entities/room.ts';
import { RoomRepository } from '../../domain/repositories/room-repository.ts';
import { CacheService, CacheKeys } from '../../domain/services/cache-service.ts';
import { RedisService } from '../../domain/services/redis-service.ts';
import { RealtimeService, RoomStatus } from '../../domain/services/realtime-service.ts';

export interface RoomWithParticipantCount extends Room {
  participantCount: number;
}

export class CachedRoomService {
  constructor(
    private roomRepository: RoomRepository,
    private cacheService: CacheService,
    private redisService: RedisService,
    private realtimeService?: RealtimeService
  ) {}

  /**
   * Get room by ID with cache-aside pattern
   */
  async getRoomById(id: string): Promise<Room | null> {
    try {
      // Try cache first
      const cachedRoom = await this.cacheService.getRoomById(id);
      if (cachedRoom) {
        return cachedRoom;
      }

      // Cache miss - fetch from database
      const room = await this.roomRepository.findById(id);
      if (room) {
        // Cache the result for future requests
        await this.cacheService.setRoom(room);
      }

      return room;
    } catch (error) {
      console.error(`Error getting room ${id}:`, error);
      // On cache error, fallback to database only
      return await this.roomRepository.findById(id);
    }
  }

  /**
   * Get room by slug with cache-aside pattern
   */
  async getRoomBySlug(slug: string): Promise<Room | null> {
    try {
      // For slug lookups, we don't have a direct cache key
      // So we go to database and then cache the result
      const room = await this.roomRepository.findBySlug(slug);
      if (room) {
        // Cache the room for future ID-based lookups
        await this.cacheService.setRoom(room);
      }

      return room;
    } catch (error) {
      console.error(`Error getting room by slug ${slug}:`, error);
      return await this.roomRepository.findBySlug(slug);
    }
  }

  /**
   * Get rooms by host ID with cache-aside pattern
   */
  async getRoomsByHostId(hostId: string): Promise<Room[]> {
    try {
      // Try cache first
      const cachedRooms = await this.cacheService.getRoomList(hostId);
      if (cachedRooms.length > 0) {
        return cachedRooms;
      }

      // Cache miss - fetch from database
      const rooms = await this.roomRepository.findByHostId(hostId);
      if (rooms.length > 0) {
        // Cache the result for future requests
        await this.cacheService.setRoomList(rooms, hostId);
        
        // Also cache individual rooms
        await Promise.all(rooms.map(room => this.cacheService.setRoom(room)));
      }

      return rooms;
    } catch (error) {
      console.error(`Error getting rooms for host ${hostId}:`, error);
      // On cache error, fallback to database only
      return await this.roomRepository.findByHostId(hostId);
    }
  }

  /**
   * Get all active rooms with cache-aside pattern
   */
  async getActiveRooms(): Promise<Room[]> {
    try {
      // Try cache first
      const cachedRooms = await this.cacheService.getRoomList();
      if (cachedRooms.length > 0) {
        return cachedRooms;
      }

      // Cache miss - fetch from database
      const rooms = await this.roomRepository.findActive();
      if (rooms.length > 0) {
        // Cache the result for future requests
        await this.cacheService.setRoomList(rooms);
        
        // Also cache individual rooms
        await Promise.all(rooms.map(room => this.cacheService.setRoom(room)));
      }

      return rooms;
    } catch (error) {
      console.error('Error getting active rooms:', error);
      // On cache error, fallback to database only
      return await this.roomRepository.findActive();
    }
  }

  /**
   * Create room and cache the result
   */
  async createRoom(roomData: CreateRoomData): Promise<Room> {
    try {
      const room = await this.roomRepository.create(roomData);
      
      // Cache the newly created room
      await this.cacheService.setRoom(room);
      
      // Invalidate room lists to ensure they include the new room
      await this.cacheService.invalidateRoomList(roomData.hostId);
      await this.cacheService.invalidateRoomList(); // General list
      
      return room;
    } catch (error) {
      console.error('Error creating room:', error);
      throw error;
    }
  }

  /**
   * Update room and invalidate cache
   */
  async updateRoom(id: string, updateData: UpdateRoomData): Promise<Room | null> {
    try {
      const updatedRoom = await this.roomRepository.update(id, updateData);
      
      if (updatedRoom) {
        // Invalidate cache to ensure consistency
        await this.cacheService.invalidateRoom(id);
        
        // Cache the updated room
        await this.cacheService.setRoom(updatedRoom);
        
        // Invalidate room lists that might include this room
        await this.cacheService.invalidateRoomList(updatedRoom.hostId);
        await this.cacheService.invalidateRoomList(); // General list
      }
      
      return updatedRoom;
    } catch (error) {
      console.error(`Error updating room ${id}:`, error);
      
      // On error, still invalidate cache to prevent stale data
      try {
        await this.cacheService.invalidateRoom(id);
      } catch (cacheError) {
        console.error(`Error invalidating cache for room ${id}:`, cacheError);
      }
      
      throw error;
    }
  }

  /**
   * Delete room and invalidate cache
   */
  async deleteRoom(id: string): Promise<boolean> {
    try {
      // Get room first to know which host's list to invalidate
      const room = await this.getRoomById(id);
      
      const deleted = await this.roomRepository.delete(id);
      
      if (deleted) {
        // Invalidate cache
        await this.cacheService.invalidateRoom(id);
        
        // Invalidate room lists
        if (room) {
          await this.cacheService.invalidateRoomList(room.hostId);
        }
        await this.cacheService.invalidateRoomList(); // General list
      }
      
      return deleted;
    } catch (error) {
      console.error(`Error deleting room ${id}:`, error);
      
      // On error, still invalidate cache to prevent stale data
      try {
        await this.cacheService.invalidateRoom(id);
      } catch (cacheError) {
        console.error(`Error invalidating cache for room ${id}:`, cacheError);
      }
      
      throw error;
    }
  }

  /**
   * Get participant count for a room (cached)
   */
  async getParticipantCount(roomId: string): Promise<number> {
    try {
      const key = CacheKeys.ROOM_PARTICIPANTS(roomId);
      const cachedCount = await this.redisService.get<number>(key);
      
      if (cachedCount !== null) {
        return cachedCount;
      }

      // Cache miss - get from database (this would need to be implemented in repository)
      // For now, return 0 as default
      const count = 0; // await this.roomRepository.getParticipantCount(roomId);
      
      // Cache the count with shorter TTL since it changes frequently
      await this.redisService.set(key, count, 300); // 5 minutes
      
      return count;
    } catch (error) {
      console.error(`Error getting participant count for room ${roomId}:`, error);
      return 0;
    }
  }

  /**
   * Update participant count in cache
   */
  async updateParticipantCount(roomId: string, count: number): Promise<void> {
    try {
      const key = CacheKeys.ROOM_PARTICIPANTS(roomId);
      await this.redisService.set(key, count, 300); // 5 minutes TTL
    } catch (error) {
      console.error(`Error updating participant count for room ${roomId}:`, error);
    }
  }

  /**
   * Increment participant count and broadcast update
   */
  async incrementParticipantCount(roomId: string): Promise<number> {
    try {
      const currentCount = await this.getParticipantCount(roomId);
      const newCount = currentCount + 1;
      await this.updateParticipantCount(roomId, newCount);
      
      // Broadcast room status update with new participant count
      if (this.realtimeService) {
        const room = await this.getRoomById(roomId);
        if (room) {
          const roomStatus: RoomStatus = {
            status: room.status as 'waiting' | 'active' | 'recording' | 'closed',
            participantCount: newCount,
            updatedAt: new Date()
          };
          
          if (room.recordingStartedAt) {
            roomStatus.recordingStartedAt = room.recordingStartedAt;
          }
          
          await this.realtimeService.broadcastRoomStatus(roomId, roomStatus);
        }
      }
      
      return newCount;
    } catch (error) {
      console.error(`Error incrementing participant count for room ${roomId}:`, error);
      return 0;
    }
  }

  /**
   * Decrement participant count and broadcast update
   */
  async decrementParticipantCount(roomId: string): Promise<number> {
    try {
      const currentCount = await this.getParticipantCount(roomId);
      const newCount = Math.max(0, currentCount - 1);
      await this.updateParticipantCount(roomId, newCount);
      
      // Broadcast room status update with new participant count
      if (this.realtimeService) {
        const room = await this.getRoomById(roomId);
        if (room) {
          const roomStatus: RoomStatus = {
            status: room.status as 'waiting' | 'active' | 'recording' | 'closed',
            participantCount: newCount,
            updatedAt: new Date()
          };
          
          if (room.recordingStartedAt) {
            roomStatus.recordingStartedAt = room.recordingStartedAt;
          }
          
          await this.realtimeService.broadcastRoomStatus(roomId, roomStatus);
        }
      }
      
      return newCount;
    } catch (error) {
      console.error(`Error decrementing participant count for room ${roomId}:`, error);
      return 0;
    }
  }

  /**
   * Handle participant joined event
   */
  async handleParticipantJoined(roomId: string, participantId: string, participantName: string, participantType: 'host' | 'guest'): Promise<void> {
    try {
      // Update participant count
      const newCount = await this.incrementParticipantCount(roomId);
      
      // Broadcast participant joined event
      if (this.realtimeService) {
        const participant = {
          id: participantId,
          name: participantName,
          type: participantType,
          joinedAt: new Date()
        };
        
        await this.realtimeService.broadcastParticipantJoined(roomId, participant);
      }
      
      console.log(`Participant ${participantName} joined room ${roomId}. New count: ${newCount}`);
    } catch (error) {
      console.error(`Error handling participant joined for room ${roomId}:`, error);
    }
  }

  /**
   * Handle participant left event
   */
  async handleParticipantLeft(roomId: string, participantId: string): Promise<void> {
    try {
      // Update participant count
      const newCount = await this.decrementParticipantCount(roomId);
      
      // Broadcast participant left event
      if (this.realtimeService) {
        await this.realtimeService.broadcastParticipantLeft(roomId, participantId);
      }
      
      console.log(`Participant ${participantId} left room ${roomId}. New count: ${newCount}`);
    } catch (error) {
      console.error(`Error handling participant left for room ${roomId}:`, error);
    }
  }

  /**
   * Get room status (cached)
   */
  async getRoomStatus(roomId: string): Promise<string | null> {
    try {
      const key = CacheKeys.ROOM_STATUS(roomId);
      const cachedStatus = await this.redisService.get<string>(key);
      
      if (cachedStatus !== null) {
        return cachedStatus;
      }

      // Cache miss - get from database
      const room = await this.getRoomById(roomId);
      if (room) {
        // Cache the status with shorter TTL since it changes frequently
        await this.redisService.set(key, room.status, 300); // 5 minutes
        return room.status;
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting room status for room ${roomId}:`, error);
      return null;
    }
  }

  /**
   * Update room status in cache and broadcast the change
   */
  async updateRoomStatus(roomId: string, status: string): Promise<void> {
    try {
      const key = CacheKeys.ROOM_STATUS(roomId);
      await this.redisService.set(key, status, 300); // 5 minutes TTL
      
      // Broadcast room status change if realtime service is available
      if (this.realtimeService) {
        const participantCount = await this.getParticipantCount(roomId);
        const roomStatus: RoomStatus = {
          status: status as 'waiting' | 'active' | 'recording' | 'closed',
          participantCount,
          updatedAt: new Date()
        };
        
        // Add recording started time if status is recording
        if (status === 'recording') {
          const room = await this.getRoomById(roomId);
          if (room?.recordingStartedAt) {
            roomStatus.recordingStartedAt = room.recordingStartedAt;
          }
        }
        
        await this.realtimeService.broadcastRoomStatus(roomId, roomStatus);
      }
    } catch (error) {
      console.error(`Error updating room status for room ${roomId}:`, error);
    }
  }

  /**
   * Warm room cache with frequently accessed rooms
   */
  async warmRoomCache(roomIds: string[]): Promise<void> {
    try {
      const rooms = await Promise.all(
        roomIds.map(id => this.roomRepository.findById(id))
      );

      // Cache all found rooms
      await Promise.all(
        rooms
          .filter((room): room is Room => room !== null)
          .map(room => this.cacheService.setRoom(room))
      );

      console.log(`Warmed cache for ${rooms.filter(r => r !== null).length} rooms`);
    } catch (error) {
      console.error('Error warming room cache:', error);
    }
  }

  /**
   * Warm room list cache for active rooms
   */
  async warmRoomListCache(): Promise<void> {
    try {
      const activeRooms = await this.roomRepository.findActive();
      
      // Cache the general active rooms list
      await this.cacheService.setRoomList(activeRooms);
      
      // Group rooms by host and cache host-specific lists
      const roomsByHost = new Map<string, Room[]>();
      for (const room of activeRooms) {
        if (!roomsByHost.has(room.hostId)) {
          roomsByHost.set(room.hostId, []);
        }
        roomsByHost.get(room.hostId)!.push(room);
      }
      
      // Cache host-specific lists
      await Promise.all(
        Array.from(roomsByHost.entries()).map(([hostId, rooms]) =>
          this.cacheService.setRoomList(rooms, hostId)
        )
      );
      
      console.log(`Warmed room list cache for ${activeRooms.length} rooms across ${roomsByHost.size} hosts`);
    } catch (error) {
      console.error('Error warming room list cache:', error);
    }
  }

  /**
   * Invalidate all room cache entries
   */
  async invalidateAllRoomCache(): Promise<void> {
    try {
      await this.cacheService.invalidatePattern('room:*');
      console.log('Invalidated all room cache entries');
    } catch (error) {
      console.error('Error invalidating all room cache:', error);
    }
  }
}