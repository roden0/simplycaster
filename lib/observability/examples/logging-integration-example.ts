/**
 * Logging Integration Example
 * 
 * This example demonstrates the complete integration of structured logging
 * with existing application components including:
 * - Authentication flows with structured logging
 * - WebRTC operations with trace correlation
 * - Room management with context propagation
 * - Error logging with stack trace capture
 */

import { 
  initializeObservability, 
  startActiveSpan
} from "../observability-service.ts";
import { SpanStatusCode } from "npm:@opentelemetry/api@1.7.0";
import { 
  initializeLogger,
  createComponentLogger,
  createUserLogger,
  createRoomLogger,
  logExporter,
  type LogContext 
} from "../logging/index.ts";

// ============================================================================
// MOCK SERVICES FOR DEMONSTRATION
// ============================================================================

/**
 * Mock authentication service with structured logging
 */
class AuthenticationService {
  private logger = createComponentLogger('auth-service');

  async authenticateUser(email: string, password: string, ipAddress?: string): Promise<{ success: boolean; userId?: string; error?: string }> {
    const logContext: LogContext = {
      operation: 'authenticate-user',
      component: 'auth-service',
      metadata: {
        email,
        ipAddress,
      },
    };

    return startActiveSpan('authenticate-user', async (span) => {
      this.logger.info('Starting user authentication', logContext);
      
      span.setAttributes({
        'auth.method': 'password',
        'user.email': email,
        'client.ip': ipAddress || 'unknown',
      });

      try {
        // Simulate authentication logic
        await new Promise(resolve => setTimeout(resolve, 100));

        if (email === 'test@example.com' && password === 'password') {
          const userId = 'user-123';
          const userLogContext = { ...logContext, userId };
          
          this.logger.info('User authentication successful', userLogContext);
          span.setAttributes({ 'user.id': userId });
          span.setStatus({ code: SpanStatusCode.OK });
          
          return { success: true, userId };
        } else {
          this.logger.warn('Authentication failed - invalid credentials', logContext);
          span.setStatus({ 
            code: SpanStatusCode.ERROR, 
            message: 'Invalid credentials' 
          });
          
          return { success: false, error: 'Invalid credentials' };
        }
      } catch (error) {
        this.logger.error('Authentication failed with error', error as Error, logContext);
        span.recordException(error as Error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: (error as Error).message 
        });
        
        return { success: false, error: 'Authentication error' };
      }
    });
  }

  async logoutUser(userId: string): Promise<void> {
    const logContext: LogContext = {
      userId,
      operation: 'logout-user',
      component: 'auth-service',
    };

    return startActiveSpan('logout-user', async (span) => {
      this.logger.info('Starting user logout', logContext);
      
      span.setAttributes({
        'user.id': userId,
        'auth.action': 'logout',
      });

      try {
        // Simulate logout logic
        await new Promise(resolve => setTimeout(resolve, 50));
        
        this.logger.info('User logout completed successfully', logContext);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        this.logger.error('Logout failed', error as Error, logContext);
        span.recordException(error as Error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: (error as Error).message 
        });
        throw error;
      }
    });
  }
}

/**
 * Mock room service with structured logging
 */
class RoomService {
  private logger = createComponentLogger('room-service');

  async createRoom(hostId: string, roomName: string): Promise<{ roomId: string }> {
    const logContext: LogContext = {
      userId: hostId,
      operation: 'create-room',
      component: 'room-service',
      metadata: {
        roomName,
      },
    };

    return startActiveSpan('create-room', async (span) => {
      this.logger.info('Starting room creation', logContext);
      
      span.setAttributes({
        'room.name': roomName,
        'room.host_id': hostId,
        'room.type': 'podcast',
      });

      try {
        // Simulate room creation
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const roomId = `room-${Date.now()}`;
        const roomLogContext = { ...logContext, roomId };
        
        this.logger.info('Room created successfully', roomLogContext);
        span.setAttributes({ 'room.id': roomId });
        span.setStatus({ code: SpanStatusCode.OK });
        
        return { roomId };
      } catch (error) {
        this.logger.error('Room creation failed', error as Error, logContext);
        span.recordException(error as Error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: (error as Error).message 
        });
        throw error;
      }
    });
  }

  async joinRoom(roomId: string, userId: string, userType: 'host' | 'guest'): Promise<void> {
    const logContext: LogContext = {
      userId,
      roomId,
      operation: 'join-room',
      component: 'room-service',
      metadata: {
        userType,
      },
    };

    return startActiveSpan('join-room', async (span) => {
      this.logger.info('User joining room', logContext);
      
      span.setAttributes({
        'room.id': roomId,
        'user.id': userId,
        'user.type': userType,
      });

      try {
        // Simulate room join logic
        await new Promise(resolve => setTimeout(resolve, 100));
        
        this.logger.info('User joined room successfully', logContext);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        this.logger.error('Failed to join room', error as Error, logContext);
        span.recordException(error as Error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: (error as Error).message 
        });
        throw error;
      }
    });
  }
}

/**
 * Mock WebRTC service with structured logging
 */
class WebRTCService {
  private logger = createComponentLogger('webrtc-service');

  async establishConnection(roomId: string, userId: string): Promise<{ connectionId: string }> {
    const logContext: LogContext = {
      userId,
      roomId,
      operation: 'establish-webrtc-connection',
      component: 'webrtc-service',
    };

    return startActiveSpan('establish-webrtc-connection', async (span) => {
      this.logger.info('Establishing WebRTC connection', logContext);
      
      span.setAttributes({
        'webrtc.room_id': roomId,
        'webrtc.user_id': userId,
        'webrtc.connection_type': 'peer-to-peer',
      });

      try {
        // Simulate WebRTC connection establishment
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const connectionId = `conn-${Date.now()}`;
        const connectionLogContext = { 
          ...logContext, 
          metadata: { 
            ...logContext.metadata, 
            connectionId 
          } 
        };
        
        this.logger.info('WebRTC connection established successfully', connectionLogContext);
        span.setAttributes({ 
          'webrtc.connection_id': connectionId,
          'webrtc.state': 'connected',
        });
        span.setStatus({ code: SpanStatusCode.OK });
        
        return { connectionId };
      } catch (error) {
        this.logger.error('WebRTC connection failed', error as Error, logContext);
        span.recordException(error as Error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: (error as Error).message 
        });
        throw error;
      }
    });
  }

  async startRecording(roomId: string, hostId: string): Promise<{ recordingId: string }> {
    const logContext: LogContext = {
      userId: hostId,
      roomId,
      operation: 'start-recording',
      component: 'webrtc-service',
    };

    return startActiveSpan('start-recording', async (span) => {
      this.logger.info('Starting recording session', logContext);
      
      span.setAttributes({
        'recording.room_id': roomId,
        'recording.host_id': hostId,
        'recording.format': 'webm',
      });

      try {
        // Simulate recording start
        await new Promise(resolve => setTimeout(resolve, 150));
        
        const recordingId = `rec-${Date.now()}`;
        const recordingLogContext = { 
          ...logContext, 
          metadata: { 
            ...logContext.metadata, 
            recordingId,
            format: 'webm',
            quality: 'high',
          } 
        };
        
        this.logger.info('Recording started successfully', recordingLogContext);
        span.setAttributes({ 
          'recording.id': recordingId,
          'recording.status': 'active',
        });
        span.setStatus({ code: SpanStatusCode.OK });
        
        return { recordingId };
      } catch (error) {
        this.logger.error('Failed to start recording', error as Error, logContext);
        span.recordException(error as Error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: (error as Error).message 
        });
        throw error;
      }
    });
  }
}

// ============================================================================
// INTEGRATION EXAMPLE
// ============================================================================

/**
 * Complete user flow with structured logging and trace correlation
 */
async function demonstrateCompleteUserFlow(): Promise<void> {
  console.log('\n=== Complete User Flow with Structured Logging ===');
  
  const authService = new AuthenticationService();
  const roomService = new RoomService();
  const webrtcService = new WebRTCService();

  return startActiveSpan('complete-user-flow', async (span) => {
    span.setAttributes({
      'flow.type': 'podcast-recording-session',
      'flow.version': '1.0',
    });

    try {
      // 1. User Authentication
      const authResult = await authService.authenticateUser(
        'test@example.com', 
        'password', 
        '192.168.1.100'
      );

      if (!authResult.success) {
        throw new Error('Authentication failed');
      }

      const userId = authResult.userId!;
      const userLogger = createUserLogger(userId);
      userLogger.info('User authenticated, starting session');

      // 2. Room Creation
      const { roomId } = await roomService.createRoom(userId, 'My Podcast Room');
      const roomLogger = createRoomLogger(roomId, { userId });
      roomLogger.info('Room created, preparing for recording session');

      // 3. Room Join
      await roomService.joinRoom(roomId, userId, 'host');
      roomLogger.info('Host joined room successfully');

      // 4. WebRTC Connection
      const { connectionId } = await webrtcService.establishConnection(roomId, userId);
      roomLogger.info('WebRTC connection established', {
        metadata: { connectionId },
      });

      // 5. Start Recording
      const { recordingId } = await webrtcService.startRecording(roomId, userId);
      roomLogger.info('Recording session started', {
        metadata: { recordingId },
      });

      // 6. Simulate some recording time
      await new Promise(resolve => setTimeout(resolve, 1000));
      roomLogger.info('Recording session in progress', {
        metadata: { 
          recordingId,
          duration: '1s',
          status: 'active',
        },
      });

      // 7. User Logout
      await authService.logoutUser(userId);
      userLogger.info('User session completed successfully');

      span.setAttributes({
        'flow.status': 'completed',
        'flow.user_id': userId,
        'flow.room_id': roomId,
        'flow.recording_id': recordingId,
      });
      span.setStatus({ code: SpanStatusCode.OK });

      console.log('✅ Complete user flow completed successfully');

    } catch (error) {
      const errorLogger = createComponentLogger('user-flow');
      errorLogger.error('User flow failed', error as Error);
      
      span.recordException(error as Error);
      span.setStatus({ 
        code: SpanStatusCode.ERROR, 
        message: (error as Error).message 
      });
      
      console.log('❌ User flow failed:', (error as Error).message);
      throw error;
    }
  });
}

/**
 * Error handling demonstration
 */
async function demonstrateErrorHandling(): Promise<void> {
  console.log('\n=== Error Handling with Structured Logging ===');
  
  const authService = new AuthenticationService();
  
  return startActiveSpan('error-handling-demo', async (span) => {
    try {
      // Attempt authentication with invalid credentials
      const result = await authService.authenticateUser(
        'invalid@example.com', 
        'wrongpassword',
        '192.168.1.100'
      );

      if (!result.success) {
        console.log('✅ Authentication properly rejected invalid credentials');
      }

      // Simulate a service error
      throw new Error('Simulated service error for demonstration');

    } catch (error) {
      const errorLogger = createComponentLogger('error-demo');
      errorLogger.error('Demonstration error occurred', error as Error, {
        operation: 'error-handling-demo',
        metadata: {
          errorType: 'demonstration',
          expectedError: true,
        },
      });

      span.recordException(error as Error);
      span.setStatus({ 
        code: SpanStatusCode.ERROR, 
        message: (error as Error).message 
      });

      console.log('✅ Error handling demonstration completed');
    }
  });
}

// ============================================================================
// MAIN EXAMPLE RUNNER
// ============================================================================

/**
 * Initialize and run logging integration examples
 */
async function runLoggingIntegrationExamples(): Promise<void> {
  try {
    // Initialize observability
    await initializeObservability();
    
    // Initialize structured logging
    initializeLogger();
    
    // Start log exporter
    logExporter.start();
    
    console.log('🚀 Observability and logging initialized');

    // Run examples
    await demonstrateCompleteUserFlow();
    await demonstrateErrorHandling();

    // Show export statistics
    const exportStats = logExporter.getStats();
    console.log('\n=== Log Export Statistics ===');
    console.log(`Total exported: ${exportStats.totalExported}`);
    console.log(`Total failed: ${exportStats.totalFailed}`);
    console.log(`Last export: ${exportStats.lastExportTime?.toISOString() || 'Never'}`);
    if (exportStats.lastError) {
      console.log(`Last error: ${exportStats.lastError}`);
    }

    console.log('\n✅ All logging integration examples completed successfully');

  } catch (error) {
    console.error('❌ Example execution failed:', error);
  } finally {
    // Stop log exporter
    logExporter.stop();
  }
}

// Run examples if this file is executed directly
if (import.meta.main) {
  await runLoggingIntegrationExamples();
}