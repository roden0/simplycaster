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
import { IICEServerService, ICEServerConfig } from "./ice-server-service.ts";
import { IConnectionAnalyticsService, createConnectionAnalyticsService } from "./connection-analytics-service.ts";
import { createComponentLogger, type LogContext } from "../observability/logging/index.ts";

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
  iceServerConfig?: ICEServerConfig[];
  iceServerExpiresAt?: Date;
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
  private iceServerService: IICEServerService | null = null;
  private analyticsService: IConnectionAnalyticsService;
  private activeConnections = new Map<string, WebSocket>(); // connectionId -> WebSocket
  private connectionToParticipant = new Map<string, string>(); // connectionId -> participantId
  private participantToConnection = new Map<string, string>(); // participantId -> connectionId
  private logger = createComponentLogger('webrtc-room-coordinator');

  constructor() {
    // Initialize services lazily
    this.initializeServices();
    this.analyticsService = createConnectionAnalyticsService();
    this.logger.info('RoomCoordinator initialized');
  }

  private async initializeServices(): Promise<void> {
    const logContext: LogContext = {
      operation: 'initialize-services',
      component: 'webrtc-room-coordinator',
    };

    try {
      this.logger.debug('Initializing Redis service', logContext);
      this.redisService = await getService<RedisService>(ServiceKeys.REDIS_SERVICE);
      this.logger.debug('Redis service initialized successfully', logContext);
    } catch (error) {
      this.logger.error('Failed to initialize Redis service for RoomCoordinator', error as Error, logContext);
    }

    try {
      this.logger.debug('Initializing ICE server service', logContext);
      this.iceServerService = await getService<IICEServerService>(ServiceKeys.ICE_SERVER_SERVICE);
      this.logger.debug('ICE server service initialized successfully', logContext);
    } catch (error) {
      this.logger.error('Failed to initialize ICE server service for RoomCoordinator', error as Error, logContext);
    }
  }

  /**
   * Create a new WebRTC room session
   */
  async createRoomSession(roomId: string): Promise<Result<WebRTCSession>> {
    const logContext: LogContext = {
      roomId,
      operation: 'create-room-session',
      component: 'webrtc-room-coordinator',
    };

    this.logger.info('Creating WebRTC room session', logContext);

    try {
      // Verify room exists and is active
      this.logger.debug('Verifying room exists and is active', logContext);
      const roomRepository = await getService<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
      const roomResult = await roomRepository.findById(roomId);
      
      if (!roomResult.success || !roomResult.data) {
        this.logger.warn('Room not found', logContext);
        return Err(new Error('Room not found'));
      }

      const room = roomResult.data;
      if (!RoomDomain.isActive(room)) {
        this.logger.warn('Room is not active', {
          ...logContext,
          metadata: {
            roomStatus: room.status,
            roomClosedAt: room.closedAt?.toISOString(),
          },
        });
        return Err(new Error('Room is not active'));
      }

      // Initialize ICE server configuration for the room
      let iceServerConfig: ICEServerConfig[] | undefined;
      let iceServerExpiresAt: Date | undefined;

      if (this.iceServerService) {
        try {
          this.logger.debug('Generating ICE server configuration', {
            ...logContext,
            userId: room.hostId,
          });
          // Use host ID for ICE server configuration
          iceServerConfig = await this.iceServerService.generateICEServerConfiguration(room.hostId);
          // Set expiration to 12 hours from now
          iceServerExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
          this.logger.debug('ICE server configuration generated successfully', {
            ...logContext,
            metadata: {
              iceServerCount: iceServerConfig.length,
              expiresAt: iceServerExpiresAt.toISOString(),
            },
          });
        } catch (error) {
          this.logger.warn('Failed to initialize ICE server configuration for room', {
            ...logContext,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      } else {
        this.logger.debug('ICE server service not available, skipping configuration', logContext);
      }

      // Create session data
      const session: WebRTCSession = {
        roomId,
        participants: {},
        isRecording: RoomDomain.isRecording(room),
        recordingStartedAt: room.recordingStartedAt,
        iceServerConfig,
        iceServerExpiresAt,
        createdAt: new Date()
      };

      this.logger.debug('WebRTC session data created', {
        ...logContext,
        metadata: {
          isRecording: session.isRecording,
          recordingStartedAt: session.recordingStartedAt?.toISOString(),
          hasIceServerConfig: !!iceServerConfig,
        },
      });

      // Store session in Redis if available
      if (this.redisService) {
        try {
          this.logger.debug('Storing WebRTC session in Redis', logContext);
          const sessionKey = `webrtc:session:${roomId}`;
          const sessionData = JSON.stringify(session, (key, value) => {
            if (value instanceof Date) {
              return value.toISOString();
            }
            return value;
          });

          await this.redisService.set(sessionKey, sessionData, 3600); // 1 hour TTL
          this.logger.debug('WebRTC session stored in Redis successfully', {
            ...logContext,
            metadata: {
              sessionKey,
              ttl: 3600,
            },
          });
        } catch (error) {
          this.logger.warn('Failed to store WebRTC session in Redis', {
            ...logContext,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      } else {
        this.logger.debug('Redis service not available, session stored in memory only', logContext);
      }

      this.logger.info('WebRTC room session created successfully', {
        ...logContext,
        metadata: {
          sessionCreatedAt: session.createdAt.toISOString(),
          isRecording: session.isRecording,
          hasIceServerConfig: !!iceServerConfig,
        },
      });

      return Ok(session);
    } catch (error) {
      this.logger.error('Failed to create room session', error as Error, logContext);
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
   * Validate participant access to room and ICE servers
   */
  async validateParticipantAccess(
    participantId: string,
    participantType: 'host' | 'guest',
    roomId: string
  ): Promise<Result<{
    hasAccess: boolean;
    canUseICEServers: boolean;
    iceServerConfig?: ICEServerConfig[];
  }>> {
    try {
      let hasAccess = false;
      let canUseICEServers = false;
      let iceServerConfig: ICEServerConfig[] | undefined;

      if (participantType === 'host') {
        // Validate host access
        const userRepository = await getService<UserRepository>(ServiceKeys.USER_REPOSITORY);
        const userResult = await userRepository.findById(participantId);
        
        if (!userResult.success || !userResult.data) {
          return Ok({ hasAccess: false, canUseICEServers: false });
        }

        const user = userResult.data;
        if (!user.isActive || user.role === 'guest') {
          return Ok({ hasAccess: false, canUseICEServers: false });
        }

        // Check if user is the room host or admin
        const roomRepository = await getService<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
        const roomResult = await roomRepository.findById(roomId);
        
        if (!roomResult.success || !roomResult.data) {
          return Ok({ hasAccess: false, canUseICEServers: false });
        }

        const room = roomResult.data;
        hasAccess = user.role === 'admin' || room.hostId === user.id;
        canUseICEServers = hasAccess; // Hosts can always use ICE servers

        // Get ICE server configuration for host
        if (hasAccess) {
          const iceConfigResult = await this.getICEServerConfiguration(roomId, participantId);
          if (iceConfigResult.success) {
            iceServerConfig = iceConfigResult.data;
          }
        }
      } else {
        // Validate guest access
        const guestRepository = await getService<GuestRepository>(ServiceKeys.GUEST_REPOSITORY);
        const guestResult = await guestRepository.findById(participantId);
        
        if (!guestResult.success || !guestResult.data) {
          return Ok({ hasAccess: false, canUseICEServers: false });
        }

        const guest = guestResult.data;
        hasAccess = GuestDomain.isActive(guest) && guest.roomId === roomId;
        
        // Guests can use ICE servers if they have valid access and token hasn't expired
        canUseICEServers = hasAccess && guest.tokenExpiresAt > new Date();

        // Get ICE server configuration for guest
        if (canUseICEServers) {
          const iceConfigResult = await this.getICEServerConfiguration(roomId, participantId);
          if (iceConfigResult.success) {
            iceServerConfig = iceConfigResult.data;
          }
        }
      }

      return Ok({
        hasAccess,
        canUseICEServers,
        iceServerConfig
      });
    } catch (error) {
      return Err(new Error(`Failed to validate participant access: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Get ICE server configuration for a participant
   */
  async getICEServerConfiguration(roomId: string, participantId: string): Promise<Result<ICEServerConfig[]>> {
    try {
      const sessionResult = await this.getRoomSession(roomId);
      if (!sessionResult.success) {
        return Err(sessionResult.error);
      }

      const session = sessionResult.data;
      if (!session) {
        return Err(new Error('Room session not found'));
      }

      // Check if ICE server configuration exists and is not expired
      if (session.iceServerConfig && session.iceServerExpiresAt) {
        if (session.iceServerExpiresAt > new Date()) {
          return Ok(session.iceServerConfig);
        }
      }

      // Generate new ICE server configuration if needed
      if (this.iceServerService) {
        try {
          const newConfig = await this.iceServerService.generateICEServerConfiguration(participantId);
          
          // Update session with new configuration
          session.iceServerConfig = newConfig;
          session.iceServerExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

          // Store updated session in Redis
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
              console.warn('Failed to update WebRTC session with new ICE config in Redis:', error);
            }
          }

          return Ok(newConfig);
        } catch (error) {
          console.error('Failed to generate ICE server configuration:', error);
          return Err(new Error(`Failed to generate ICE server configuration: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      // Return empty configuration if no ICE server service available
      return Ok([]);
    } catch (error) {
      return Err(new Error(`Failed to get ICE server configuration: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Refresh ICE server credentials for a participant
   */
  async refreshICEServerCredentials(roomId: string, participantId: string): Promise<Result<ICEServerConfig[]>> {
    try {
      if (!this.iceServerService) {
        return Err(new Error('ICE server service not available'));
      }

      // Generate fresh ICE server configuration
      const newConfig = await this.iceServerService.generateICEServerConfiguration(participantId);

      // Update session with new configuration
      const sessionResult = await this.getRoomSession(roomId);
      if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data;
        session.iceServerConfig = newConfig;
        session.iceServerExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

        // Store updated session in Redis
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
            console.warn('Failed to update WebRTC session with refreshed ICE config in Redis:', error);
          }
        }
      }

      return Ok(newConfig);
    } catch (error) {
      return Err(new Error(`Failed to refresh ICE server credentials: ${error instanceof Error ? error.message : String(error)}`));
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

      // Clean up any ICE server resources if needed
      // Note: TURN credentials are time-limited and will expire automatically
      // No explicit cleanup needed for ICE servers

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
   * Start connection analytics tracking for a participant
   */
  startConnectionAnalytics(sessionId: string, roomId: string, participantId: string, participantType: 'host' | 'guest'): void {
    this.analyticsService.startTracking(sessionId, roomId, participantId, participantType);
  }

  /**
   * Update connection analytics with WebRTC stats
   */
  updateConnectionAnalytics(sessionId: string, stats: RTCStatsReport): void {
    this.analyticsService.updateConnectionStats(sessionId, stats);
  }

  /**
   * End connection analytics tracking
   */
  endConnectionAnalytics(sessionId: string): void {
    this.analyticsService.endTracking(sessionId);
  }

  /**
   * Get connection analytics for a room
   */
  getRoomAnalytics(roomId: string): any[] {
    return this.analyticsService.getConnectionHistory(roomId);
  }

  /**
   * Get aggregated connection metrics
   */
  getConnectionMetrics(timeRange?: number): any {
    return this.analyticsService.getAggregatedMetrics(timeRange);
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