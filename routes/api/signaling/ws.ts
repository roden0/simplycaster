/**
 * WebSocket Signaling Server Route
 * 
 * Handles WebRTC signaling for real-time communication between participants
 * in recording rooms. Manages WebSocket connections, authentication, and
 * message routing for peer-to-peer connection establishment.
 */

import { define } from "../../../utils.ts";
import { getService } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import { authenticateWebSocketConnection } from "../../../lib/middleware/auth.ts";
import { GuestRepository } from "../../../lib/domain/repositories/guest-repository.ts";
import { RoomRepository } from "../../../lib/domain/repositories/room-repository.ts";
import { GuestDomain } from "../../../lib/domain/entities/guest.ts";
import { RoomDomain } from "../../../lib/domain/entities/room.ts";
import { 
  SignalingMessage, 
  SignalingConnection, 
  SignalingErrorCode,
  ParticipantInfo 
} from "../../../lib/webrtc/types.ts";
import { 
  validateSignalingMessage, 
  createErrorMessage,
  MessageRateLimiter,
  sanitizeMessageData
} from "../../../lib/webrtc/message-validator.ts";

/**
 * Room session management
 */
class RoomSessionManager {
  private connections = new Map<string, SignalingConnection>();
  private roomParticipants = new Map<string, Set<string>>();

  /**
   * Add connection to room session
   */
  addConnection(connection: SignalingConnection): void {
    this.connections.set(connection.id, connection);
    
    if (!this.roomParticipants.has(connection.roomId)) {
      this.roomParticipants.set(connection.roomId, new Set());
    }
    this.roomParticipants.get(connection.roomId)!.add(connection.id);
  }

  /**
   * Remove connection from room session
   */
  removeConnection(connectionId: string): SignalingConnection | null {
    const connection = this.connections.get(connectionId);
    if (!connection) return null;

    this.connections.delete(connectionId);
    
    const roomConnections = this.roomParticipants.get(connection.roomId);
    if (roomConnections) {
      roomConnections.delete(connectionId);
      if (roomConnections.size === 0) {
        this.roomParticipants.delete(connection.roomId);
      }
    }

    return connection;
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): SignalingConnection | null {
    return this.connections.get(connectionId) || null;
  }

  /**
   * Get all connections in a room
   */
  getRoomConnections(roomId: string): SignalingConnection[] {
    const connectionIds = this.roomParticipants.get(roomId) || new Set();
    return Array.from(connectionIds)
      .map(id => this.connections.get(id))
      .filter((conn): conn is SignalingConnection => conn !== undefined);
  }

  /**
   * Broadcast message to all participants in room except sender
   */
  broadcastToRoom(roomId: string, message: SignalingMessage, excludeConnectionId?: string): void {
    const connections = this.getRoomConnections(roomId);
    
    connections.forEach(connection => {
      if (connection.id !== excludeConnectionId && connection.socket.readyState === WebSocket.OPEN) {
        try {
          connection.socket.send(JSON.stringify(message));
          connection.lastSeen = new Date();
        } catch (error) {
          console.error(`Failed to send message to connection ${connection.id}:`, error);
        }
      }
    });
  }

  /**
   * Send message to specific participant
   */
  sendToParticipant(participantId: string, message: SignalingMessage): boolean {
    const connection = Array.from(this.connections.values())
      .find(conn => conn.participantId === participantId);
    
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      connection.socket.send(JSON.stringify(message));
      connection.lastSeen = new Date();
      return true;
    } catch (error) {
      console.error(`Failed to send message to participant ${participantId}:`, error);
      return false;
    }
  }

  /**
   * Update connection last seen timestamp
   */
  updateLastSeen(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastSeen = new Date();
    }
  }

  /**
   * Get room participant count
   */
  getRoomParticipantCount(roomId: string): number {
    return this.roomParticipants.get(roomId)?.size || 0;
  }

  /**
   * Clean up inactive connections
   */
  cleanupInactiveConnections(maxInactiveMinutes: number = 5): void {
    const cutoffTime = new Date(Date.now() - maxInactiveMinutes * 60 * 1000);
    const inactiveConnections: string[] = [];

    this.connections.forEach((connection, id) => {
      if (connection.lastSeen < cutoffTime || connection.socket.readyState !== WebSocket.OPEN) {
        inactiveConnections.push(id);
      }
    });

    inactiveConnections.forEach(id => {
      const connection = this.removeConnection(id);
      if (connection) {
        try {
          connection.socket.close();
        } catch (error) {
          console.error(`Error closing inactive connection ${id}:`, error);
        }
      }
    });
  }
}

// Global session manager instance
const sessionManager = new RoomSessionManager();

// Cleanup inactive connections every 2 minutes
setInterval(() => {
  sessionManager.cleanupInactiveConnections(5);
}, 2 * 60 * 1000);

// Cleanup rate limiter every 5 minutes
setInterval(() => {
  rateLimiter.cleanup();
}, 5 * 60 * 1000);



// Global rate limiter for message validation
const rateLimiter = new MessageRateLimiter(100, 60000); // 100 messages per minute

/**
 * Handle WebSocket signaling messages
 */
async function handleSignalingMessage(
  connection: SignalingConnection,
  rawMessage: any
): Promise<void> {
  try {
    // Update connection last seen
    sessionManager.updateLastSeen(connection.id);

    // Rate limiting check
    if (!rateLimiter.canSendMessage(connection.participantId)) {
      const errorMsg = createErrorMessage(
        connection.roomId,
        connection.participantId,
        SignalingErrorCode.NETWORK_ERROR,
        'Message rate limit exceeded'
      );
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(errorMsg));
      }
      return;
    }

    // Sanitize message data
    const sanitizedRawMessage = sanitizeMessageData(rawMessage);

    // Validate message structure
    const validationResult = validateSignalingMessage(sanitizedRawMessage);
    if (!validationResult.isValid) {
      console.error('Invalid signaling message:', validationResult.errors);
      const errorMsg = createErrorMessage(
        connection.roomId,
        connection.participantId,
        SignalingErrorCode.INVALID_MESSAGE,
        `Invalid message: ${validationResult.errors.join(', ')}`
      );
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(errorMsg));
      }
      return;
    }

    const message = validationResult.sanitizedMessage!;

    // Verify message is from authenticated participant
    if (message.participantId !== connection.participantId || message.roomId !== connection.roomId) {
      console.error('Message participant/room mismatch:', {
        messageParticipant: message.participantId,
        connectionParticipant: connection.participantId,
        messageRoom: message.roomId,
        connectionRoom: connection.roomId
      });
      const errorMsg = createErrorMessage(
        connection.roomId,
        connection.participantId,
        SignalingErrorCode.AUTHENTICATION_FAILED,
        'Message authentication failed'
      );
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(errorMsg));
      }
      return;
    }

    // Route message based on type
    switch (message.type) {
      case 'join': {
        await handleJoinMessage(connection, message);
        break;
      }
      
      case 'leave': {
        await handleLeaveMessage(connection, message);
        break;
      }
      
      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        handleWebRTCMessage(connection, message);
        break;
      }
      
      case 'recording-status': {
        handleRecordingStatusMessage(connection, message);
        break;
      }

      case 'heartbeat': {
        handleHeartbeatMessage(connection, message);
        break;
      }

      case 'media-status': {
        handleMediaStatusMessage(connection, message);
        break;
      }

      case 'connection-status': {
        handleConnectionStatusMessage(connection, message);
        break;
      }
      
      default: {
        console.warn('Unknown signaling message type:', message.type);
        const errorMsg = createErrorMessage(
          connection.roomId,
          connection.participantId,
          SignalingErrorCode.INVALID_MESSAGE,
          `Unknown message type: ${message.type}`
        );
        if (connection.socket.readyState === WebSocket.OPEN) {
          connection.socket.send(JSON.stringify(errorMsg));
        }
      }
    }

  } catch (error) {
    console.error('Error handling signaling message:', error);
    const errorMsg = createErrorMessage(
      connection.roomId,
      connection.participantId,
      SignalingErrorCode.INTERNAL_ERROR,
      'Internal server error'
    );
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(errorMsg));
    }
  }
}

/**
 * Handle participant join message
 */
async function handleJoinMessage(
  connection: SignalingConnection,
  message: SignalingMessage
): Promise<void> {
  try {
    // Validate join message data
    if (message.type !== 'join') {
      console.error('Invalid join message type');
      return;
    }

    // Extract participant capabilities if provided
    const capabilities = (message.data as any)?.capabilities;
    if (capabilities) {
      connection.capabilities = capabilities;
    }

    // Verify room is still active and accessible
    const roomRepository = await getService<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const roomResult = await roomRepository.findById(connection.roomId);
    
    if (!roomResult.success || !roomResult.data) {
      const errorMsg = createErrorMessage(
        connection.roomId,
        connection.participantId,
        SignalingErrorCode.ROOM_NOT_FOUND,
        'Room no longer exists'
      );
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(errorMsg));
      }
      return;
    }

    const room = roomResult.data;
    if (!RoomDomain.isActive(room)) {
      const errorMsg = createErrorMessage(
        connection.roomId,
        connection.participantId,
        SignalingErrorCode.ROOM_NOT_FOUND,
        'Room is no longer active'
      );
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(errorMsg));
      }
      return;
    }

    // Check room capacity
    const currentParticipantCount = sessionManager.getRoomParticipantCount(connection.roomId);
    if (currentParticipantCount >= room.maxParticipants) {
      const errorMsg = createErrorMessage(
        connection.roomId,
        connection.participantId,
        SignalingErrorCode.ROOM_FULL,
        'Room has reached maximum capacity'
      );
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(errorMsg));
      }
      return;
    }

    // Update guest last seen if it's a guest
    if (connection.participantType === 'guest') {
      const guestRepository = await getService<GuestRepository>(ServiceKeys.GUEST_REPOSITORY);
      await guestRepository.update(connection.participantId, GuestDomain.updateLastSeen());
    }

    // Broadcast participant joined to other participants
    const participantUpdateMessage: SignalingMessage = {
      type: 'participant-update',
      roomId: connection.roomId,
      participantId: connection.participantId,
      data: {
        action: 'joined',
        participant: {
          id: connection.participantId,
          name: connection.participantName,
          type: connection.participantType,
          joinedAt: new Date(),
          isConnected: true
        }
      },
      timestamp: new Date()
    };

    sessionManager.broadcastToRoom(connection.roomId, participantUpdateMessage, connection.id);

    // Send current participants list to the new participant
    const roomConnections = sessionManager.getRoomConnections(connection.roomId);
    const participants = roomConnections
      .filter(conn => conn.id !== connection.id)
      .map(conn => ({
        id: conn.participantId,
        name: conn.participantName,
        type: conn.participantType,
        joinedAt: new Date(), // This would ideally come from the connection creation time
        isConnected: conn.socket.readyState === WebSocket.OPEN
      }));

    const participantsListMessage: SignalingMessage = {
      type: 'participant-update',
      roomId: connection.roomId,
      participantId: 'system',
      data: {
        action: 'participants-list',
        participants
      },
      timestamp: new Date()
    };

    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(participantsListMessage));
    }

    // Send room recording status to the new participant
    if (RoomDomain.isRecording(room)) {
      const recordingStatusMessage: SignalingMessage = {
        type: 'recording-status',
        roomId: connection.roomId,
        participantId: 'system',
        data: {
          isRecording: true,
          recordingId: room.id, // Using room ID as recording ID for now
          startedAt: room.recordingStartedAt
        },
        timestamp: new Date()
      };

      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(recordingStatusMessage));
      }
    }

    console.log(`Participant ${connection.participantName} joined room ${connection.roomId} (${currentParticipantCount + 1}/${room.maxParticipants})`);

  } catch (error) {
    console.error('Error handling join message:', error);
    const errorMsg = createErrorMessage(
      connection.roomId,
      connection.participantId,
      SignalingErrorCode.INTERNAL_ERROR,
      'Failed to process join request'
    );
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(errorMsg));
    }
  }
}

/**
 * Handle participant leave message
 */
async function handleLeaveMessage(
  connection: SignalingConnection,
  message: SignalingMessage
): Promise<void> {
  try {
    // Validate leave message data
    if (message.type !== 'leave') {
      console.error('Invalid leave message type');
      return;
    }

    // Extract leave reason if provided
    const reason = (message.data as any)?.reason || 'voluntary';

    // Update guest status if it's a guest
    if (connection.participantType === 'guest') {
      try {
        const guestRepository = await getService<GuestRepository>(ServiceKeys.GUEST_REPOSITORY);
        
        // Mark guest as left
        await guestRepository.update(connection.participantId, {
          ...GuestDomain.leaveRoom(),
          ...GuestDomain.updateLastSeen()
        });
        
        console.log(`Guest ${connection.participantName} left room ${connection.roomId} (reason: ${reason})`);
      } catch (error) {
        console.error('Error updating guest leave status:', error);
      }
    }

    // Broadcast participant left to other participants
    const participantUpdateMessage: SignalingMessage = {
      type: 'participant-update',
      roomId: connection.roomId,
      participantId: connection.participantId,
      data: {
        action: 'left',
        participant: {
          id: connection.participantId,
          name: connection.participantName,
          type: connection.participantType,
          joinedAt: new Date(), // This would ideally come from the connection creation time
          isConnected: false
        }
      },
      timestamp: new Date()
    };

    sessionManager.broadcastToRoom(connection.roomId, participantUpdateMessage, connection.id);

    // Get remaining participant count
    const remainingParticipants = sessionManager.getRoomParticipantCount(connection.roomId) - 1;
    
    console.log(`Participant ${connection.participantName} left room ${connection.roomId} (${remainingParticipants} remaining, reason: ${reason})`);

    // Close the WebSocket connection after a brief delay to ensure message delivery
    setTimeout(() => {
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.close(1000, 'Participant left room');
      }
    }, 100);

  } catch (error) {
    console.error('Error handling leave message:', error);
    const errorMsg = createErrorMessage(
      connection.roomId,
      connection.participantId,
      SignalingErrorCode.INTERNAL_ERROR,
      'Failed to process leave request'
    );
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(errorMsg));
    }
  }
}

/**
 * Handle WebRTC signaling messages (offer, answer, ICE candidates)
 */
/**
 * Handle WebRTC signaling messages (offer, answer, ICE candidates)
 */
function handleWebRTCMessage(
  connection: SignalingConnection,
  message: SignalingMessage
): void {
  try {
    // Extract target participant from message data based on message type
    let targetParticipantId: string | undefined;
    let messageData: any;
    
    if (message.type === 'offer' || message.type === 'answer' || message.type === 'ice-candidate') {
      messageData = message.data as any;
      targetParticipantId = messageData?.to;
    }
    
    if (!targetParticipantId || typeof targetParticipantId !== 'string') {
      console.error('WebRTC message missing target participant:', message.type, message.participantId);
      const errorMsg = createErrorMessage(
        connection.roomId,
        connection.participantId,
        SignalingErrorCode.INVALID_MESSAGE,
        'WebRTC message missing target participant'
      );
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(errorMsg));
      }
      return;
    }

    // Validate that target participant exists in the room
    const roomConnections = sessionManager.getRoomConnections(connection.roomId);
    const targetConnection = roomConnections.find(conn => conn.participantId === targetParticipantId);
    
    if (!targetConnection) {
      console.warn(`Target participant ${targetParticipantId} not found in room ${connection.roomId}`);
      const errorMsg = createErrorMessage(
        connection.roomId,
        connection.participantId,
        SignalingErrorCode.PARTICIPANT_NOT_FOUND,
        'Target participant not found in room'
      );
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(errorMsg));
      }
      return;
    }

    // Validate message-specific data
    if (message.type === 'offer' || message.type === 'answer') {
      if (!messageData?.sdp || typeof messageData.sdp !== 'object') {
        console.error('WebRTC offer/answer missing SDP data');
        const errorMsg = createErrorMessage(
          connection.roomId,
          connection.participantId,
          SignalingErrorCode.INVALID_MESSAGE,
          'WebRTC offer/answer missing SDP data'
        );
        if (connection.socket.readyState === WebSocket.OPEN) {
          connection.socket.send(JSON.stringify(errorMsg));
        }
        return;
      }
    } else if (message.type === 'ice-candidate') {
      if (!messageData?.candidate || typeof messageData.candidate !== 'object') {
        console.error('WebRTC ICE candidate missing candidate data');
        const errorMsg = createErrorMessage(
          connection.roomId,
          connection.participantId,
          SignalingErrorCode.INVALID_MESSAGE,
          'WebRTC ICE candidate missing candidate data'
        );
        if (connection.socket.readyState === WebSocket.OPEN) {
          connection.socket.send(JSON.stringify(errorMsg));
        }
        return;
      }
    }

    // Create forwarded message with proper source identification
    const forwardedMessage: SignalingMessage = {
      ...message,
      data: {
        ...messageData,
        from: connection.participantId,
        fromName: connection.participantName
      } as any
    };

    // Forward message to target participant
    const success = sessionManager.sendToParticipant(targetParticipantId, forwardedMessage);

    if (!success) {
      console.warn(`Failed to deliver ${message.type} from ${connection.participantId} to ${targetParticipantId}`);
      const errorMsg = createErrorMessage(
        connection.roomId,
        connection.participantId,
        SignalingErrorCode.NETWORK_ERROR,
        'Failed to deliver message to target participant'
      );
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(errorMsg));
      }
    } else {
      // Log successful WebRTC signaling relay
      console.log(`Relayed ${message.type} from ${connection.participantName} to ${targetConnection.participantName} in room ${connection.roomId}`);
    }

  } catch (error) {
    console.error('Error handling WebRTC message:', error);
    const errorMsg = createErrorMessage(
      connection.roomId,
      connection.participantId,
      SignalingErrorCode.INTERNAL_ERROR,
      'Failed to process WebRTC message'
    );
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(errorMsg));
    }
  }
}

/**
 * Handle recording status messages
 */
function handleRecordingStatusMessage(
  connection: SignalingConnection,
  message: SignalingMessage
): void {
  // Only hosts can change recording status
  if (connection.participantType !== 'host') {
    console.warn('Non-host attempted to change recording status:', connection.participantId);
    const errorMsg = createErrorMessage(
      connection.roomId,
      connection.participantId,
      SignalingErrorCode.AUTHENTICATION_FAILED,
      'Only hosts can change recording status'
    );
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(errorMsg));
    }
    return;
  }

  // Broadcast recording status to all participants
  sessionManager.broadcastToRoom(connection.roomId, message, connection.id);

  console.log(`Recording status changed in room ${connection.roomId}:`, message.data);
}

/**
 * Handle heartbeat messages
 */
function handleHeartbeatMessage(
  connection: SignalingConnection,
  message: SignalingMessage
): void {
  // Respond to ping with pong
  if (message.type === 'heartbeat' && (message.data as any)?.ping) {
    const pongMessage: SignalingMessage = {
      type: 'heartbeat',
      roomId: connection.roomId,
      participantId: 'system',
      timestamp: new Date(),
      data: {
        pong: true,
        latency: Date.now() - (message.timestamp?.getTime() || Date.now())
      }
    };
    
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(pongMessage));
    }
  }
}

/**
 * Handle media status messages
 */
function handleMediaStatusMessage(
  connection: SignalingConnection,
  message: SignalingMessage
): void {
  // Broadcast media status to other participants
  sessionManager.broadcastToRoom(connection.roomId, message, connection.id);
  
  console.log(`Media status updated for ${connection.participantName}:`, message.data);
}

/**
 * Handle connection status messages
 */
function handleConnectionStatusMessage(
  connection: SignalingConnection,
  message: SignalingMessage
): void {
  // Broadcast connection status to other participants
  sessionManager.broadcastToRoom(connection.roomId, message, connection.id);
  
  console.log(`Connection status updated for ${connection.participantName}:`, message.data);
}

/**
 * WebSocket route handler
 */
export const handler = define.handlers({
  GET: async (ctx) => {
    const req = ctx.req;
    
    // Check if this is a WebSocket upgrade request
    const upgrade = req.headers.get("upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 400 });
    }

    // Authenticate the connection
    const authResult = await authenticateWebSocketConnection(req);
    if (!authResult) {
      return new Response("Authentication failed", { status: 401 });
    }

    const { participantId, participantName, participantType, roomId } = authResult;

    // Verify room exists and is active
    try {
      const roomRepository = await getService<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
      const roomResult = await roomRepository.findById(roomId);
      
      if (!roomResult.success || !roomResult.data) {
        return new Response("Room not found", { status: 404 });
      }

      const room = roomResult.data;
      if (!RoomDomain.isActive(room)) {
        return new Response("Room is not active", { status: 403 });
      }

      // Check room capacity
      const currentParticipantCount = sessionManager.getRoomParticipantCount(roomId);
      if (currentParticipantCount >= room.maxParticipants) {
        return new Response("Room is full", { status: 403 });
      }

    } catch (error) {
      console.error('Error verifying room:', error);
      return new Response("Internal server error", { status: 500 });
    }

    // Upgrade to WebSocket
    const { socket, response } = Deno.upgradeWebSocket(req);

    // Create connection object
    const connectionId = crypto.randomUUID();
    const connection: SignalingConnection = {
      id: connectionId,
      roomId,
      participantId,
      participantName,
      participantType,
      socket,
      lastSeen: new Date(),
      isAuthenticated: true
    };

    // Set up WebSocket event handlers
    socket.onopen = () => {
      console.log(`WebSocket connection opened for ${participantName} in room ${roomId}`);
      sessionManager.addConnection(connection);
      
      // Send connection confirmation
      const confirmationMessage: SignalingMessage = {
        type: 'participant-update',
        roomId,
        participantId,
        data: {
          action: 'connected' as any, // Custom action for connection confirmation
          participant: {
            id: participantId,
            name: participantName,
            type: participantType,
            joinedAt: new Date()
          }
        },
        timestamp: new Date()
      };
      
      socket.send(JSON.stringify(confirmationMessage));
    };

    socket.onmessage = async (event) => {
      try {
        const rawMessage = JSON.parse(event.data);
        await handleSignalingMessage(connection, rawMessage);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        const errorMsg = createErrorMessage(
          roomId,
          participantId,
          SignalingErrorCode.INVALID_MESSAGE,
          'Failed to parse message JSON'
        );
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(errorMsg));
        }
      }
    };

    socket.onclose = () => {
      console.log(`WebSocket connection closed for ${participantName} in room ${roomId}`);
      
      // Remove connection and notify other participants
      const removedConnection = sessionManager.removeConnection(connectionId);
      if (removedConnection) {
        const leaveMessage: SignalingMessage = {
          type: 'participant-update',
          roomId,
          participantId,
          data: {
            action: 'disconnected',
            participant: {
              id: participantId,
              name: participantName,
              type: participantType,
              joinedAt: new Date() // This would ideally come from the connection creation time
            }
          },
          timestamp: new Date()
        };
        
        sessionManager.broadcastToRoom(roomId, leaveMessage);
      }

      // Update guest last seen if it's a guest
      if (participantType === 'guest') {
        getService<GuestRepository>(ServiceKeys.GUEST_REPOSITORY)
          .then(guestRepository => 
            guestRepository.update(participantId, GuestDomain.updateLastSeen())
          )
          .catch(error => console.error('Error updating guest last seen on disconnect:', error));
      }
    };

    socket.onerror = (error) => {
      console.error(`WebSocket error for ${participantName} in room ${roomId}:`, error);
    };

    return response;
  }
});