/**
 * Example usage of StructuredLogger with OpenTelemetry trace correlation
 * 
 * This example demonstrates:
 * - Basic logging with trace correlation
 * - Context-aware logging
 * - Child loggers with inherited context
 * - Integration with OpenTelemetry spans
 * - Error logging with stack traces
 */

import { 
  initializeObservability, 
  startActiveSpan, 
  createSpan
} from "../observability-service.ts";
import { SpanStatusCode } from "npm:@opentelemetry/api@1.7.0";
import { 
  initializeLogger,
  createLogger,
  createComponentLogger,
  createUserLogger,
  createRoomLogger,
  logger,
  logged,
  type LogContext 
} from "../logging/index.ts";

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize observability and logging
 */
async function initializeExample(): Promise<void> {
  // Initialize OpenTelemetry observability
  await initializeObservability({
    otel: {
      enabled: true,
      serviceName: 'structured-logging-example',
      serviceVersion: '1.0.0',
      serviceNamespace: 'examples',
      environment: 'development',
    },
    exporter: {
      endpoint: 'http://localhost:4318',
      protocol: 'http/protobuf',
      timeout: 10000,
    },
    sampling: {
      tracesSampler: 'always_on',
      tracesSamplerArg: 1.0,
      metricsExemplarFilter: 'always_on',
    },
    performance: {
      sdkDisabled: false,
      propagators: ['tracecontext', 'baggage'],
      attributeValueLengthLimit: 4096,
      attributeCountLimit: 128,
      spanAttributeValueLengthLimit: 4096,
      spanAttributeCountLimit: 128,
      spanEventCountLimit: 128,
      spanLinkCountLimit: 128,
      eventAttributeCountLimit: 128,
      linkAttributeCountLimit: 128,
    },
    simplycast: {
      webrtcInstrumentation: true,
      recordingInstrumentation: true,
      databaseInstrumentation: true,
      redisInstrumentation: true,
      authInstrumentation: true,
      slowQueryThreshold: 1000,
      slowRequestThreshold: 2000,
      cacheMissAlertThreshold: 0.8,
    },
    lgtm: {
      grafana: {
        adminUser: 'admin',
        adminPassword: 'admin',
        httpPort: 3000,
      },
      retention: {
        lokiPeriod: '24h',
        tempoPeriod: '24h',
        mimirPeriod: '168h',
      },
      storage: {
        dataPath: '/tmp/otel-lgtm',
        configPath: '/tmp/otel-lgtm-config',
      },
    },
  });

  // Initialize structured logging
  initializeLogger();
  
  console.log('Observability and logging initialized successfully');
}

// ============================================================================
// BASIC LOGGING EXAMPLES
// ============================================================================

/**
 * Example of basic logging functionality
 */
function basicLoggingExample(): void {
  console.log('\n=== Basic Logging Example ===');
  
  // Basic log messages
  logger.debug('Debug message for troubleshooting');
  logger.info('Application started successfully');
  logger.warn('Configuration value missing, using default');
  
  // Error logging with stack trace
  try {
    throw new Error('Something went wrong');
  } catch (error) {
    logger.error('Failed to process request', error as Error);
  }
}

/**
 * Example of logging with context
 */
function contextLoggingExample(): void {
  console.log('\n=== Context Logging Example ===');
  
  const context: LogContext = {
    userId: 'user-123',
    roomId: 'room-456',
    operation: 'join-room',
    component: 'room-service',
    requestId: 'req-789',
    sessionId: 'session-abc',
    metadata: {
      userAgent: 'Mozilla/5.0...',
      ipAddress: '192.168.1.100',
      timestamp: new Date().toISOString(),
    },
  };
  
  logger.info('User joining room', context);
  logger.warn('Room is near capacity', context);
}

// ============================================================================
// CHILD LOGGER EXAMPLES
// ============================================================================

/**
 * Example of child loggers with inherited context
 */
function childLoggerExample(): void {
  console.log('\n=== Child Logger Example ===');
  
  // Create component logger
  const roomServiceLogger = createComponentLogger('room-service', {
    operation: 'room-management',
  });
  
  roomServiceLogger.info('Room service initialized');
  
  // Create user-specific logger
  const userLogger = createUserLogger('user-123', {
    component: 'user-service',
  });
  
  userLogger.info('User authenticated successfully');
  
  // Create room-specific logger
  const roomLogger = createRoomLogger('room-456', {
    component: 'room-service',
    userId: 'user-123',
  });
  
  roomLogger.info('User joined room');
  
  // Create child logger with additional context
  const operationLogger = roomLogger.child({
    operation: 'start-recording',
    metadata: {
      recordingFormat: 'webm',
      quality: 'high',
    },
  });
  
  operationLogger.info('Starting recording session');
  operationLogger.warn('Storage space is low');
}

// ============================================================================
// TRACE CORRELATION EXAMPLES
// ============================================================================

/**
 * Example of logging with OpenTelemetry trace correlation
 */
function traceCorrelationExample(): void {
  console.log('\n=== Trace Correlation Example ===');
  
  // Create a span and log within it
  startActiveSpan('user-authentication', (span) => {
    span.setAttributes({
      'user.id': 'user-123',
      'auth.method': 'password',
    });
    
    logger.info('Starting user authentication');
    
    // Simulate authentication steps
    startActiveSpan('validate-credentials', (credentialsSpan) => {
      credentialsSpan.setAttributes({
        'validation.type': 'password',
      });
      
      logger.debug('Validating user credentials');
      
      // Simulate some processing time
      setTimeout(() => {
        logger.info('Credentials validated successfully');
        credentialsSpan.setStatus({ code: SpanStatusCode.OK });
      }, 10);
    });
    
    startActiveSpan('create-session', (sessionSpan) => {
      sessionSpan.setAttributes({
        'session.type': 'jwt',
        'session.duration': '24h',
      });
      
      logger.info('Creating user session');
      
      // Log with additional context
      logger.info('Session created', {
        sessionId: 'session-abc-123',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      
      sessionSpan.setStatus({ code: SpanStatusCode.OK });
    });
    
    logger.info('User authentication completed');
    span.setStatus({ code: SpanStatusCode.OK });
  });
}

/**
 * Example of error handling with trace correlation
 */
function errorHandlingExample(): void {
  console.log('\n=== Error Handling Example ===');
  
  startActiveSpan('room-creation', (span) => {
    span.setAttributes({
      'room.name': 'My Podcast Room',
      'room.type': 'podcast',
      'user.id': 'user-123',
    });
    
    logger.info('Starting room creation');
    
    try {
      // Simulate an error
      throw new Error('Database connection failed');
    } catch (error) {
      logger.error('Failed to create room', error as Error, {
        roomName: 'My Podcast Room',
        userId: 'user-123',
        operation: 'create-room',
        metadata: {
          attemptNumber: 1,
          errorCode: 'DB_CONNECTION_FAILED',
        },
      });
      
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
    }
  });
}

// ============================================================================
// DECORATOR EXAMPLES
// ============================================================================

/**
 * Example class using logging decorators
 */
class RoomService {
  private roomLogger = createComponentLogger('room-service');
  
  @logged('info', true, false)
  async createRoom(roomName: string, userId: string): Promise<string> {
    this.roomLogger.info('Creating new room', {
      roomName,
      userId,
      operation: 'create-room',
    });
    
    // Simulate room creation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const roomId = `room-${Date.now()}`;
    
    this.roomLogger.info('Room created successfully', {
      roomId,
      roomName,
      userId,
    });
    
    return roomId;
  }
  
  @logged('debug', false, true)
  getRoomInfo(roomId: string): { id: string; name: string; participants: number } {
    this.roomLogger.debug('Fetching room information', {
      roomId,
      operation: 'get-room-info',
    });
    
    return {
      id: roomId,
      name: 'My Podcast Room',
      participants: 3,
    };
  }
  
  @logged('warn')
  async deleteRoom(roomId: string, userId: string): Promise<void> {
    this.roomLogger.warn('Deleting room', {
      roomId,
      userId,
      operation: 'delete-room',
    });
    
    // Simulate deletion
    await new Promise(resolve => setTimeout(resolve, 50));
    
    this.roomLogger.info('Room deleted successfully', {
      roomId,
      userId,
    });
  }
}

/**
 * Example of using decorated class methods
 */
async function decoratorExample(): Promise<void> {
  console.log('\n=== Decorator Example ===');
  
  const roomService = new RoomService();
  
  try {
    const roomId = await roomService.createRoom('My Podcast Room', 'user-123');
    const roomInfo = roomService.getRoomInfo(roomId);
    console.log('Room info:', roomInfo);
    await roomService.deleteRoom(roomId, 'user-123');
  } catch (error) {
    logger.error('Room service operation failed', error as Error);
  }
}

// ============================================================================
// INTEGRATION EXAMPLES
// ============================================================================

/**
 * Example of logging in different application scenarios
 */
function integrationExamples(): void {
  console.log('\n=== Integration Examples ===');
  
  // WebRTC connection logging
  const webrtcLogger = createComponentLogger('webrtc-service');
  webrtcLogger.info('WebRTC connection established', {
    userId: 'user-123',
    roomId: 'room-456',
    connectionType: 'peer-to-peer',
    metadata: {
      iceConnectionState: 'connected',
      signalingState: 'stable',
      connectionQuality: 'excellent',
    },
  });
  
  // Recording operation logging
  const recordingLogger = createComponentLogger('recording-service');
  recordingLogger.info('Recording started', {
    roomId: 'room-456',
    operation: 'start-recording',
    metadata: {
      format: 'webm',
      quality: 'high',
      participants: ['user-123', 'user-456'],
    },
  });
  
  // Database operation logging
  const dbLogger = createComponentLogger('database-service');
  dbLogger.debug('Executing database query', {
    operation: 'select-rooms',
    metadata: {
      query: 'SELECT * FROM rooms WHERE host_id = ?',
      parameters: ['user-123'],
      executionTime: 45,
    },
  });
  
  // Authentication logging
  const authLogger = createComponentLogger('auth-service');
  authLogger.info('User login attempt', {
    userId: 'user-123',
    operation: 'login',
    metadata: {
      method: 'password',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0...',
      success: true,
    },
  });
}

// ============================================================================
// MAIN EXAMPLE RUNNER
// ============================================================================

/**
 * Run all logging examples
 */
async function runExamples(): Promise<void> {
  try {
    await initializeExample();
    
    basicLoggingExample();
    contextLoggingExample();
    childLoggerExample();
    traceCorrelationExample();
    errorHandlingExample();
    await decoratorExample();
    integrationExamples();
    
    console.log('\n=== All examples completed successfully ===');
  } catch (error) {
    console.error('Example execution failed:', error);
  }
}

// Run examples if this file is executed directly
if (import.meta.main) {
  await runExamples();
}