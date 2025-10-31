/**
 * Custom Instrumentation Usage Examples
 * 
 * This file demonstrates how to use the custom instrumentation layer
 * for SimplyCaster operations including room management, WebRTC,
 * database operations, and Redis cache operations.
 */

import {
  // Room instrumentation
  instrumentRoomCreation,
  instrumentRoomJoin,
  instrumentRecordingStart,
  recordRoomStatistics,
  
  // WebRTC instrumentation
  instrumentSignaling,
  instrumentConnectionEstablishment,
  recordConnectionQuality,
  
  // Database instrumentation
  autoInstrumentQuery,
  instrumentTransaction,
  recordConnectionPoolStats,
  
  // Redis instrumentation
  instrumentCacheOperation,
  instrumentSessionOperation,
  recordCacheStats,
  
  // Types
  type RoomOperationContext,
  type ParticipantOperationContext,
  type SignalingContext,
  type ConnectionContext,
  type CacheOperationContext,
  type SessionOperationContext,
} from "../index.ts";

// ============================================================================
// ROOM MANAGEMENT INSTRUMENTATION EXAMPLES
// ============================================================================

/**
 * Example: Instrument room creation
 */
export async function createRoomExample(hostId: string, roomName: string): Promise<{ id: string; name: string }> {
  const roomId = crypto.randomUUID();
  
  const context: RoomOperationContext = {
    roomId,
    roomName,
    hostId,
    operation: 'create',
    maxParticipants: 10,
  };

  return await instrumentRoomCreation(context, async () => {
    // Simulate room creation logic
    console.log(`Creating room ${roomName} for host ${hostId}`);
    
    // Simulate database operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return { id: roomId, name: roomName };
  });
}

/**
 * Example: Instrument participant joining
 */
export async function joinRoomExample(roomId: string, participantId: string, participantName: string): Promise<void> {
  const context: ParticipantOperationContext = {
    roomId,
    participantId,
    participantName,
    participantType: 'guest',
    operation: 'join',
  };

  return await instrumentRoomJoin(context, async () => {
    // Simulate participant joining logic
    console.log(`Participant ${participantName} joining room ${roomId}`);
    
    // Simulate WebRTC setup
    await new Promise(resolve => setTimeout(resolve, 200));
  });
}

/**
 * Example: Instrument recording start
 */
export async function startRecordingExample(roomId: string, hostId: string): Promise<string> {
  const recordingId = crypto.randomUUID();
  
  const context = {
    roomId,
    recordingId,
    hostId,
    operation: 'start' as const,
    participantCount: 3,
  };

  return await instrumentRecordingStart(context, async () => {
    // Simulate recording start logic
    console.log(`Starting recording ${recordingId} in room ${roomId}`);
    
    // Simulate media setup
    await new Promise(resolve => setTimeout(resolve, 150));
    
    return recordingId;
  });
}

/**
 * Example: Record room statistics
 */
export function recordRoomStatsExample(roomId: string): void {
  recordRoomStatistics(roomId, {
    participantCount: 5,
    maxParticipants: 10,
    isRecording: true,
    sessionDuration: 1800, // 30 minutes
  });
}

// ============================================================================
// WEBRTC INSTRUMENTATION EXAMPLES
// ============================================================================

/**
 * Example: Instrument WebRTC signaling
 */
export async function handleSignalingExample(roomId: string, participantId: string, offer: any): Promise<any> {
  const context: SignalingContext = {
    roomId,
    participantId,
    participantType: 'guest',
    operation: 'offer',
    sdpType: 'offer',
  };

  return await instrumentSignaling(context, async () => {
    // Simulate signaling processing
    console.log(`Processing WebRTC offer from ${participantId} in room ${roomId}`);
    
    // Simulate SDP processing
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return { type: 'answer', sdp: 'mock-answer-sdp' };
  });
}

/**
 * Example: Instrument connection establishment
 */
export async function establishConnectionExample(roomId: string, participantId: string): Promise<void> {
  const connectionId = crypto.randomUUID();
  
  const context: ConnectionContext = {
    roomId,
    participantId,
    participantType: 'guest',
    connectionId,
    operation: 'establish',
    iceConnectionState: 'checking',
  };

  return await instrumentConnectionEstablishment(context, async () => {
    // Simulate connection establishment
    console.log(`Establishing WebRTC connection for ${participantId}`);
    
    // Simulate ICE negotiation
    await new Promise(resolve => setTimeout(resolve, 300));
  });
}

/**
 * Example: Record connection quality metrics
 */
export function recordConnectionQualityExample(roomId: string, participantId: string): void {
  recordConnectionQuality({
    roomId,
    participantId,
    connectionId: crypto.randomUUID(),
    rtt: 45, // 45ms round-trip time
    packetsLost: 2,
    packetsSent: 1000,
    packetsReceived: 998,
    bytesReceived: 1024000, // 1MB
    bytesSent: 1024000,
    jitter: 5, // 5ms jitter
    audioLevel: 0.7,
    videoFrameRate: 30,
    videoBitrate: 500000, // 500kbps
    audioBitrate: 64000, // 64kbps
  });
}

// ============================================================================
// DATABASE INSTRUMENTATION EXAMPLES
// ============================================================================

/**
 * Example: Auto-instrument database query
 */
export async function queryUsersExample(userId?: string): Promise<any[]> {
  const query = "SELECT id, email, role FROM users WHERE deleted_at IS NULL";
  
  return await autoInstrumentQuery(
    query,
    userId,
    'conn_123',
    undefined, // no transaction
    async () => {
      // Simulate database query
      console.log('Executing user query');
      await new Promise(resolve => setTimeout(resolve, 25));
      
      return [
        { id: '1', email: 'user1@example.com', role: 'host' },
        { id: '2', email: 'user2@example.com', role: 'admin' },
      ];
    }
  );
}

/**
 * Example: Instrument database transaction
 */
export async function createUserTransactionExample(userData: any): Promise<string> {
  const transactionId = crypto.randomUUID();
  
  return await instrumentTransaction(
    {
      transactionId,
      operation: 'begin',
      userId: 'admin_123',
      connectionId: 'conn_456',
      queryCount: 3,
    },
    async () => {
      // Simulate transaction operations
      console.log('Starting user creation transaction');
      
      // Simulate multiple queries in transaction
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return crypto.randomUUID(); // Return new user ID
    }
  );
}

/**
 * Example: Record database connection pool stats
 */
export function recordDbPoolStatsExample(): void {
  recordConnectionPoolStats('main_pool', {
    totalConnections: 8,
    activeConnections: 5,
    idleConnections: 3,
    waitingRequests: 2,
    maxConnections: 10,
  });
}

// ============================================================================
// REDIS INSTRUMENTATION EXAMPLES
// ============================================================================

/**
 * Example: Instrument cache operation
 */
export async function getCachedUserExample(userId: string): Promise<any | null> {
  const context: CacheOperationContext = {
    operation: 'hit', // Will be determined by result
    cacheType: 'user',
    key: `user:${userId}`,
    userId,
    ttl: 1800, // 30 minutes
  };

  return await instrumentCacheOperation(context, async () => {
    // Simulate cache lookup
    console.log(`Looking up cached user ${userId}`);
    
    // Simulate Redis operation
    await new Promise(resolve => setTimeout(resolve, 5));
    
    // Simulate cache hit
    return {
      id: userId,
      email: 'user@example.com',
      role: 'host',
      cached_at: new Date().toISOString(),
    };
  });
}

/**
 * Example: Instrument session operation
 */
export async function createSessionExample(userId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  
  const context: SessionOperationContext = {
    operation: 'create',
    sessionId,
    userId,
    ttl: 86400, // 24 hours
    dataSize: 512, // 512 bytes
  };

  return await instrumentSessionOperation(context, async () => {
    // Simulate session creation
    console.log(`Creating session ${sessionId} for user ${userId}`);
    
    // Simulate Redis session storage
    await new Promise(resolve => setTimeout(resolve, 10));
    
    return sessionId;
  });
}

/**
 * Example: Record cache statistics
 */
export function recordCacheStatsExample(): void {
  recordCacheStats('user', {
    hitCount: 850,
    missCount: 150,
    setCount: 200,
    deleteCount: 50,
    totalSize: 1024000, // 1MB
    averageTtl: 1800, // 30 minutes
  });
}

// ============================================================================
// COMPREHENSIVE EXAMPLE: ROOM CREATION FLOW
// ============================================================================

/**
 * Example: Complete instrumented room creation flow
 * This demonstrates how multiple instrumentation types work together
 */
export async function completeRoomCreationFlow(hostId: string, roomName: string): Promise<{
  roomId: string;
  sessionId: string;
  connectionEstablished: boolean;
}> {
  // 1. Check user cache
  const cachedUser = await getCachedUserExample(hostId);
  
  // 2. Create room with database transaction
  const roomId = await createRoomExample(hostId, roomName);
  
  // 3. Create session for host
  const sessionId = await createSessionExample(hostId);
  
  // 4. Establish WebRTC connection
  await establishConnectionExample(roomId.id, hostId);
  
  // 5. Record initial room statistics
  recordRoomStatsExample(roomId.id);
  
  // 6. Record connection quality
  recordConnectionQualityExample(roomId.id, hostId);
  
  console.log(`Room creation flow completed for room ${roomId.id}`);
  
  return {
    roomId: roomId.id,
    sessionId,
    connectionEstablished: true,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Example: Periodic statistics recording
 * This function could be called periodically to record system statistics
 */
export function recordPeriodicStats(): void {
  // Record database pool stats
  recordDbPoolStatsExample();
  
  // Record cache stats for different cache types
  recordCacheStatsExample();
  
  // Record room stats for active rooms (this would iterate over actual rooms)
  recordRoomStatsExample('room_1');
  recordRoomStatsExample('room_2');
  
  console.log('Periodic statistics recorded');
}

/**
 * Example: Error handling with instrumentation
 */
export async function instrumentedOperationWithErrorHandling(): Promise<void> {
  try {
    await createRoomExample('invalid_host', 'Test Room');
  } catch (error) {
    // The instrumentation will automatically record the error
    // Additional error handling can be done here
    console.error('Room creation failed:', error);
    throw error;
  }
}

// ============================================================================
// INTEGRATION EXAMPLES
// ============================================================================

/**
 * Example: Integration with existing SimplyCaster services
 * This shows how to add instrumentation to existing service methods
 */
export class InstrumentedRoomService {
  async createRoom(hostId: string, roomName: string, maxParticipants: number = 10): Promise<any> {
    const roomId = crypto.randomUUID();
    
    return await instrumentRoomCreation(
      {
        roomId,
        roomName,
        hostId,
        operation: 'create',
        maxParticipants,
      },
      async () => {
        // Actual room creation logic would go here
        // This might involve database operations, cache updates, etc.
        
        // Database operation (also instrumented)
        const dbResult = await autoInstrumentQuery(
          'INSERT INTO rooms (id, name, host_id, max_participants) VALUES ($1, $2, $3, $4)',
          hostId,
          undefined,
          undefined,
          async () => {
            // Simulate database insert
            await new Promise(resolve => setTimeout(resolve, 50));
            return { insertId: roomId, affectedRows: 1 };
          }
        );
        
        // Cache the room data
        await instrumentCacheOperation(
          {
            operation: 'set',
            cacheType: 'room',
            key: `room:${roomId}`,
            userId: hostId,
            ttl: 3600,
          },
          async () => {
            // Simulate cache set
            await new Promise(resolve => setTimeout(resolve, 5));
            return true;
          }
        );
        
        return {
          id: roomId,
          name: roomName,
          hostId,
          maxParticipants,
          createdAt: new Date(),
        };
      }
    );
  }
}

// Export the instrumented service for use in the application
export const instrumentedRoomService = new InstrumentedRoomService();