/**
 * Room Coordinator Service
 * 
 * Manages WebRTC room sessions, participant tracking, and signaling coordination.
 * Integrates with the existing room management system and provides utilities
 * for WebSocket connection management.
 */

import { getService } from "../container/global.ts";
import { ServiceKeys } from "../container/registry.ts";
import { RoomRepository } from "../domain/repositories/room-repository.ts";
import { GuestRepository } from "../domain/repositories/guest-repository.ts";
import { UserRepository } from "../domain/repositories/user-repository.ts";
import { RedisService } from "../domain/services/redis-service.ts";
import { RoomDomain } from "../domain/entities/room.ts";
import { GuestDomain } from "../domain/entities/guest.ts";
import { Result, Ok, Err } from "../domain/types/common.ts";

/**
 * WebRTC session data stored in Redis
 */
export interface WebRTCSession {
  roomId: string;
  participants: {
    [participantId: string]: {
      id: string;
      name: string;
      type: 'host' | 'guest';
      connectionId: string;
      joinedAt: Date;
      lastSeen: Date;
    };
  };
  isRecording: boolean;
  recordingStartedAt?: Date;
  createdAt: Date;
}

/**
 * Participant information
 */
export interface Participant {
  id: string;
  name: string;
  type: 'host' | 'guest';
  connectionId: string;
  joinedAt: Date;
  lastSeen: Date;
}

/**
 * Room Coordinator Service
 */
export class RoomCoordinator {
  private redisService: RedisService | null = null;
  private activeConnections = new Map<string, WebSocket>(); // connectionId -> WebSocket
  private connectionToParticipant = new Map<string, string>(); // connectionId -> participantId
  private participantToConnection = new Map<string, string>(); // participantId -> connectionId

  constructor() {
    // Initialize Redis service lazily
    this.initializeRedisService();
  }

  private async initializeRedisService(): Promise<void> {
    try {
      this.redisService = await getService<RedisService>(ServiceKeys.REDIS_SERVICE);
    } catch (error) {
      console.error('Failed to initialize Redis service for RoomCoordinator:', error);
    }
  }

  /**
   * Create a new WebRTC room session
   */
  async createRoomSession(roomId: string): Promise<Result<WebRTCSession>> {
    try {
      // Verify room exists and is active
      const roomRepository = await getService<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
      const roomResult = await roomRepository.findById(roomId);
      
      if (!roomResult.success || !roomResult.data) {
        return Err(new Error('Room not found'));
      }

      const room = roomResult.data;
      if (!RoomDomain.isActive(room)) {
        return Err(new Error('Room is not active'));
      }

      // Create session data
      const session: WebRTCSession = {
        roomId,
        participants: {},
        isRecording: RoomDomain.isRecording(room),
        recordingStartedAt: room.recordingStartedAt,
        createdAt: new Date()
      };

      // Store session in Redis if available
      if (this.redisService) {
        try {
          const sessionKey = `webrtc:session:${roomId}`;
          const sessionData = JSON.stringify(session, (key, value) => {
            if (value instanceof Date) {
              return value.toISOString();
            }
            return value;
          });

          await this.redisService.set(sessionKey, sessionData, 3600); // 1 hour TTL
        } catch (error) {
          console.warn('Failed to store WebRTC session in Redis:', error);
        }
      }

      return Ok(session);
    } catch (error) {
      return Err(new Error(`Failed to create room session: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Get WebRTC room session
   */
  async getRoomSession(roomId: string): Promise<Result<WebRTCSession | null>> {
    try {
      if (!this.redisService) {
        // If Redis is not available, create a minimal session
        return this.createRoomSession(roomId);
      }

      const sessionKey = `webrtc:session:${roomId}`;
      const sessionData = await this.redisService.get<string>(sessionKey);
      
      if (!sessionData) {
        // Session doesn't exist, create a new one
        return this.createRoomSession(roomId);
      }

      // Parse session data
      const parsedSession = JSON.parse(sessionData, (key, value) => {
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
          return new Date(value);
        }
        return value;
      });

      return Ok(parsedSession as WebRTCSession);
    } catch (error) {
      return Err(new Error(`Failed to get room session: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Add participant to room session
   */
  async addParticipant(roomId: string, participant: Participant): Promise<Result<void>> {
    try {
      const sessionResult = await this.getRoomSession(roomId);
      if (!sessionResult.success) {
        return Err(sessionResult.error);
      }

      const session = sessionResult.data;
      if (!session) {
        return Err(new Error('Room session not found'));
      }

      // Add participant to session
      session.participants[participant.id] = participant;

      // Update session in Redis
      if (this.redisService) {
        try {
          const sessionKey = `webrtc:session:${roomId}`;
          const sessionData = JSON.stringify(session, (key, value) => {
            if (value instanceof Date) {
              return value.toISOString();
            }
            return value;
          });

          await this.redisService.set(sessionKey, sessionData, 3600);
        } catch (error) {
          console.warn('Failed to update WebRTC session in Redis:', error);
        }
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to add participant: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Remove participant from room session
   */
  async removeParticipant(roomId: string, participantId: string): Promise<Result<void>> {
    try {
      const sessionResult = await this.getRoomSession(roomId);
      if (!sessionResult.success) {
        return Err(sessionResult.error);
      }

      const session = sessionResult.data;
      if (!session) {
        return Ok(undefined); // Session doesn't exist, nothing to remove
      }

      // Remove participant from session
      delete session.participants[participantId];

      // Update session in Redis
      if (this.redisService) {
        try {
          const sessionKey = `webrtc:session:${roomId}`;
          const sessionData = JSON.stringify(session, (key, value) => {
            if (value instanceof Date) {
              return value.toISOString();
            }
            return value;
          });

          await this.redisService.set(sessionKey, sessionData, 3600);
        } catch (error) {
          console.warn('Failed to update WebRTC session in Redis:', error);
        }
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to remove participant: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Update recording status for room session
   */
  async updateRecordingStatus(roomId: string, isRecording: boolean): Promise<Result<void>> {
    try {
      const sessionResult = await this.getRoomSession(roomId);
      if (!sessionResult.success) {
        return Err(sessionResult.error);
      }

      const session = sessionResult.data;
      if (!session) {
        return Err(new Error('Room session not found'));
      }

      // Update recording status
      session.isRecording = isRecording;
      if (isRecording && !session.recordingStartedAt) {
        session.recordingStartedAt = new Date();
      }

      // Update session in Redis
      if (this.redisService) {
        try {
          const sessionKey = `webrtc:session:${roomId}`;
          const sessionData = JSON.stringify(session, (key, value) => {
            if (value instanceof Date) {
              return value.toISOString();
            }
            return value;
          });

          await this.redisService.set(sessionKey, sessionData, 3600);
        } catch (error) {
          console.warn('Failed to update WebRTC session in Redis:', error);
        }
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to update recording status: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Get active participants in room
   */
  async getActiveParticipants(roomId: string): Promise<Result<Participant[]>> {
    try {
      const sessionResult = await this.getRoomSession(roomId);
      if (!sessionResult.success) {
        return Err(sessionResult.error);
      }

      const session = sessionResult.data;
      if (!session) {
        return Ok([]);
      }

      const participants = Object.values(session.participants);
      return Ok(participants);
    } catch (error) {
      return Err(new Error(`Failed to get active participants: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate participant access to room
   */
  async validateParticipantAccess(
    participantId: string,
    participantType: 'host' | 'guest',
    roomId: string
  ): Promise<Result<boolean>> {
    try {
      if (participantType === 'host') {
        // Validate host access
        const userRepository = await getService<UserRepository>(ServiceKeys.USER_REPOSITORY);
        const userResult = await userRepository.findById(participantId);
        
        if (!userResult.success || !userResult.data) {
          return Ok(false);
        }

        const user = userResult.data;
        if (!user.isActive || user.role === 'guest') {
          return Ok(false);
        }

        // Check if user is the room host or admin
        const roomRepository = await getService<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
        const roomResult = await roomRepository.findById(roomId);
        
        if (!roomResult.success || !roomResult.data) {
          return Ok(false);
        }

        const room = roomResult.data;
        return Ok(user.role === 'admin' || room.hostId === user.id);
      } else {
        // Validate guest access
        const guestRepository = await getService<GuestRepository>(ServiceKeys.GUEST_REPOSITORY);
        const guestResult = await guestRepository.findById(participantId);
        
        if (!guestResult.success || !guestResult.data) {
          return Ok(false);
        }

        const guest = guestResult.data;
        return Ok(GuestDomain.isActive(guest) && guest.roomId === roomId);
      }
    } catch (error) {
      return Err(new Error(`Failed to validate participant access: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Clean up room session
   */
  async cleanupRoomSession(roomId: string): Promise<Result<void>> {
    try {
      // Clean up Redis session
      if (this.redisService) {
        try {
          const sessionKey = `webrtc:session:${roomId}`;
          await this.redisService.del(sessionKey);
        } catch (error) {
          console.warn('Failed to delete WebRTC session from Redis:', error);
        }
      }

      // Clean up local connections for this room
      const sessionResult = await this.getRoomSession(roomId);
      if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data;
        for (const participantId of Object.keys(session.participants)) {
          const connectionId = this.participantToConnection.get(participantId);
          if (connectionId) {
            this.unregisterConnection(connectionId);
          }
        }
      }

      console.log(`Cleaned up WebRTC session for room ${roomId}`);
      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to cleanup room session: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Set session expiration
   */
  async setSessionExpiration(roomId: string, expirationSeconds: number = 3600): Promise<Result<void>> {
    try {
      if (!this.redisService) {
        return Ok(undefined);
      }

      const sessionKey = `webrtc:session:${roomId}`;
      try {
        await this.redisService.expire(sessionKey, expirationSeconds);
      } catch (error) {
        console.warn('Failed to set session expiration:', error);
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to set session expiration: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Get all active room sessions
   */
  async getActiveRoomSessions(): Promise<Result<string[]>> {
    try {
      if (!this.redisService) {
        return Ok([]);
      }

      const keys = await this.redisService.keys('webrtc:session:*');
      const roomIds = keys.map(key => key.replace('webrtc:session:', ''));
      return Ok(roomIds);
    } catch (error) {
      return Err(new Error(`Failed to get active room sessions: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<Result<number>> {
    try {
      const activeSessionsResult = await this.getActiveRoomSessions();
      if (!activeSessionsResult.success) {
        return Err(activeSessionsResult.error);
      }

      let cleanedCount = 0;
      const roomRepository = await getService<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);

      for (const roomId of activeSessionsResult.data) {
        // Check if room still exists and is active
        const roomResult = await roomRepository.findById(roomId);
        if (!roomResult.success || !roomResult.data || !RoomDomain.isActive(roomResult.data)) {
          await this.cleanupRoomSession(roomId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired WebRTC sessions`);
      }

      return Ok(cleanedCount);
    } catch (error) {
      return Err(new Error(`Failed to cleanup expired sessions: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Get room session statistics
   */
  async getRoomSessionStats(roomId: string): Promise<Result<{
    participantCount: number;
    isRecording: boolean;
    recordingDuration?: number;
    createdAt: Date;
  }>> {
    try {
      const sessionResult = await this.getRoomSession(roomId);
      if (!sessionResult.success) {
        return Err(sessionResult.error);
      }

      const session = sessionResult.data;
      if (!session) {
        return Ok({
          participantCount: 0,
          isRecording: false,
          createdAt: new Date()
        });
      }

      const stats = {
        participantCount: Object.keys(session.participants).length,
        isRecording: session.isRecording,
        createdAt: session.createdAt
      };

      // Calculate recording duration if recording
      if (session.isRecording && session.recordingStartedAt) {
        const recordingDuration = Math.floor((Date.now() - session.recordingStartedAt.getTime()) / 1000);
        return Ok({ ...stats, recordingDuration });
      }

      return Ok(stats);
    } catch (error) {
      return Err(new Error(`Failed to get room session stats: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Register a WebSocket connection for a participant
   */
  registerConnection(connectionId: string, participantId: string, socket: WebSocket): void {
    // Remove any existing connection for this participant
    const existingConnectionId = this.participantToConnection.get(participantId);
    if (existingConnectionId) {
      this.unregisterConnection(existingConnectionId);
    }

    // Register new connection
    this.activeConnections.set(connectionId, socket);
    this.connectionToParticipant.set(connectionId, participantId);
    this.participantToConnection.set(participantId, connectionId);

    console.log(`Registered WebSocket connection ${connectionId} for participant ${participantId}`);
  }

  /**
   * Unregister a WebSocket connection
   */
  unregisterConnection(connectionId: string): void {
    const participantId = this.connectionToParticipant.get(connectionId);
    
    this.activeConnections.delete(connectionId);
    this.connectionToParticipant.delete(connectionId);
    
    if (participantId) {
      this.participantToConnection.delete(participantId);
      console.log(`Unregistered WebSocket connection ${connectionId} for participant ${participantId}`);
    }
  }

  /**
   * Get WebSocket connection for a participant
   */
  getParticipantConnection(participantId: string): WebSocket | null {
    const connectionId = this.participantToConnection.get(participantId);
    if (!connectionId) {
      return null;
    }
    return this.activeConnections.get(connectionId) || null;
  }

  /**
   * Get all active connections for a room
   */
  async getRoomConnections(roomId: string): Promise<Result<{
    connectionId: string;
    participantId: string;
    socket: WebSocket;
  }[]>> {
    try {
      const sessionResult = await this.getRoomSession(roomId);
      if (!sessionResult.success) {
        return Err(sessionResult.error);
      }

      const session = sessionResult.data;
      if (!session) {
        return Ok([]);
      }

      const connections: {
        connectionId: string;
        participantId: string;
        socket: WebSocket;
      }[] = [];

      for (const participantId of Object.keys(session.participants)) {
        const connectionId = this.participantToConnection.get(participantId);
        const socket = connectionId ? this.activeConnections.get(connectionId) : null;
        
        if (connectionId && socket) {
          connections.push({
            connectionId,
            participantId,
            socket
          });
        }
      }

      return Ok(connections);
    } catch (error) {
      return Err(new Error(`Failed to get room connections: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Broadcast message to all participants in a room
   */
  async broadcastToRoom(roomId: string, message: any, excludeParticipantId?: string): Promise<Result<number>> {
    try {
      const connectionsResult = await this.getRoomConnections(roomId);
      if (!connectionsResult.success) {
        return Err(connectionsResult.error);
      }

      const connections = connectionsResult.data;
      let sentCount = 0;

      for (const connection of connections) {
        if (excludeParticipantId && connection.participantId === excludeParticipantId) {
          continue;
        }

        if (connection.socket.readyState === WebSocket.OPEN) {
          try {
            connection.socket.send(JSON.stringify(message));
            sentCount++;
          } catch (error) {
            console.error(`Failed to send message to participant ${connection.participantId}:`, error);
          }
        }
      }

      return Ok(sentCount);
    } catch (error) {
      return Err(new Error(`Failed to broadcast to room: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Send message to specific participant
   */
  sendToParticipant(participantId: string, message: any): boolean {
    const socket = this.getParticipantConnection(participantId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Failed to send message to participant ${participantId}:`, error);
      return false;
    }
  }

  /**
   * Clean up inactive connections
   */
  cleanupInactiveConnections(): number {
    let cleanedCount = 0;
    const inactiveConnections: string[] = [];

    for (const [connectionId, socket] of this.activeConnections.entries()) {
      if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        inactiveConnections.push(connectionId);
      }
    }

    for (const connectionId of inactiveConnections) {
      this.unregisterConnection(connectionId);
      cleanedCount++;
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} inactive WebSocket connections`);
    }

    return cleanedCount;
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    activeConnections: number;
    participantConnections: number;
  } {
    return {
      totalConnections: this.activeConnections.size,
      activeConnections: Array.from(this.activeConnections.values())
        .filter(socket => socket.readyState === WebSocket.OPEN).length,
      participantConnections: this.participantToConnection.size
    };
  }

  /**
   * Synchronize room state with database
   */
  async syncRoomState(roomId: string): Promise<Result<void>> {
    try {
      // Get current room state from database
      const roomRepository = await getService<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
      const roomResult = await roomRepository.findById(roomId);
      
      if (!roomResult.success || !roomResult.data) {
        // Room no longer exists, clean up session
        await this.cleanupRoomSession(roomId);
        return Ok(undefined);
      }

      const room = roomResult.data;
      
      // Update session recording status if it has changed
      const sessionResult = await this.getRoomSession(roomId);
      if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data;
        const isRecording = RoomDomain.isRecording(room);
        
        if (session.isRecording !== isRecording) {
          await this.updateRecordingStatus(roomId, isRecording);
        }
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to sync room state: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}