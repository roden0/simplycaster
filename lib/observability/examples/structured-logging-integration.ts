#!/usr/bin/env -S deno run -A

/**
 * Structured Logging Integration Example
 * 
 * This example demonstrates how structured logging is integrated across
 * different application components with trace correlation.
 */

import { 
  initializeLogger,
  createComponentLogger,
  createUserLogger,
  createRoomLogger,
  createOperationLogger,
  logger,
  type LogContext
} from "../logging/structured-logger.ts";
import { logExporter } from "../logging/log-exporter.ts";
import { initializeObservability, startActiveSpan } from "../observability-service.ts";

/**
 * Example: Authentication Flow with Structured Logging
 */
async function demonstrateAuthenticationLogging(): Promise<void> {
  console.log("=== Authentication Flow Logging ===\n");

  const authLogger = createComponentLogger('authentication');
  const requestId = crypto.randomUUID();
  
  // Simulate authentication request
  startActiveSpan('user-authentication', (span) => {
    span.setAttributes({
      'auth.method': 'email-password',
      'request.id': requestId
    });

    const logContext: LogContext = {
      requestId,
      operation: 'user-login',
      metadata: {
        authMethod: 'email-password',
        clientIP: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      }
    };

    authLogger.info('Authentication request received', logContext);

    // Simulate database lookup
    startActiveSpan('database-user-lookup', (dbSpan) => {
      dbSpan.setAttributes({
        'db.operation': 'SELECT',
        'db.table': 'users'
      });

      authLogger.debug('Looking up user in database', {
        ...logContext,
        operation: 'database-lookup',
        metadata: { table: 'users', query: 'SELECT by email' }
      });

      // Simulate successful authentication
      const userId = 'user-123';
      const userLogger = createUserLogger(userId, logContext);
      
      userLogger.info('User authenticated successfully', {
        userRole: 'host',
        emailVerified: true,
        metadata: { loginMethod: 'password', sessionDuration: '24h' }
      });

      dbSpan.end();
    });

    span.end();
  });
}

/**
 * Example: Room Management with Structured Logging
 */
async function demonstrateRoomManagementLogging(): Promise<void> {
  console.log("\n=== Room Management Logging ===\n");

  const roomService = createComponentLogger('room-service');
  const userId = 'user-123';
  const roomId = 'room-456';

  // Room creation flow
  startActiveSpan('room-creation', (span) => {
    span.setAttributes({
      'room.operation': 'create',
      'user.id': userId
    });

    const logContext: LogContext = {
      userId,
      operation: 'create-room',
      metadata: {
        maxParticipants: 10,
        allowVideo: true,
        roomType: 'meeting'
      }
    };

    roomService.info('Starting room creation', logContext);

    // Simulate room creation steps
    startActiveSpan('validate-room-data', (validationSpan) => {
      roomService.debug('Validating room creation data', {
        ...logContext,
        operation: 'validate-data'
      });
      validationSpan.end();
    });

    startActiveSpan('database-room-insert', (dbSpan) => {
      dbSpan.setAttributes({
        'db.operation': 'INSERT',
        'db.table': 'rooms'
      });

      const roomLogger = createRoomLogger(roomId, logContext);
      roomLogger.info('Room created in database', {
        roomName: 'Weekly Team Meeting',
        status: 'waiting',
        metadata: { dbOperation: 'INSERT', executionTime: '23ms' }
      });

      dbSpan.end();
    });

    // WebRTC initialization
    startActiveSpan('webrtc-initialization', (webrtcSpan) => {
      const webrtcLogger = createComponentLogger('webrtc-service', { roomId });
      
      webrtcLogger.info('Initializing WebRTC for room', {
        roomId,
        metadata: {
          iceServers: 2,
          stunServers: 1,
          turnServers: 1
        }
      });

      webrtcSpan.end();
    });

    roomService.info('Room creation completed successfully', {
      ...logContext,
      roomId,
      metadata: { totalTime: '150ms', status: 'success' }
    });

    span.end();
  });
}

/**
 * Example: WebRTC Operations with Structured Logging
 */
async function demonstrateWebRTCLogging(): Promise<void> {
  console.log("\n=== WebRTC Operations Logging ===\n");

  const webrtcLogger = createComponentLogger('webrtc-signaling');
  const roomId = 'room-456';
  const participantId = 'participant-789';

  // Participant joining flow
  startActiveSpan('participant-joining', (span) => {
    span.setAttributes({
      'webrtc.operation': 'participant-join',
      'room.id': roomId,
      'participant.id': participantId
    });

    const logContext: LogContext = {
      roomId,
      operation: 'participant-join',
      metadata: {
        participantType: 'guest',
        connectionType: 'webrtc'
      }
    };

    webrtcLogger.info('Participant joining room', {
      ...logContext,
      metadata: {
        ...logContext.metadata,
        participantId,
        participantName: 'John Doe'
      }
    });

    // ICE candidate exchange
    startActiveSpan('ice-candidate-exchange', (iceSpan) => {
      webrtcLogger.debug('Processing ICE candidates', {
        ...logContext,
        operation: 'ice-exchange',
        metadata: {
          candidateType: 'relay',
          protocol: 'udp',
          priority: 100
        }
      });
      iceSpan.end();
    });

    // Connection establishment
    startActiveSpan('connection-establishment', (connSpan) => {
      webrtcLogger.info('WebRTC connection established', {
        ...logContext,
        operation: 'connection-established',
        metadata: {
          connectionState: 'connected',
          iceConnectionState: 'connected',
          signalingState: 'stable',
          connectionTime: '800ms'
        }
      });
      connSpan.end();
    });

    span.end();
  });
}

/**
 * Example: Error Handling with Structured Logging
 */
async function demonstrateErrorLogging(): Promise<void> {
  console.log("\n=== Error Handling Logging ===\n");

  const errorLogger = createComponentLogger('error-handler');
  const userId = 'user-123';
  const roomId = 'room-456';

  // Simulate various error scenarios
  startActiveSpan('error-scenarios', (span) => {
    const logContext: LogContext = {
      userId,
      roomId,
      operation: 'error-demonstration'
    };

    // Validation error
    try {
      throw new Error('Invalid room configuration: maxParticipants must be between 1 and 100');
    } catch (error) {
      errorLogger.error('Room validation failed', error as Error, {
        ...logContext,
        operation: 'room-validation',
        metadata: {
          errorType: 'validation',
          field: 'maxParticipants',
          providedValue: 150,
          allowedRange: '1-100'
        }
      });
    }

    // Database error
    try {
      throw new Error('Connection timeout: Unable to connect to database after 5 attempts');
    } catch (error) {
      errorLogger.error('Database operation failed', error as Error, {
        ...logContext,
        operation: 'database-query',
        metadata: {
          errorType: 'connection-timeout',
          query: 'SELECT * FROM rooms WHERE id = ?',
          retryAttempts: 5,
          timeout: '30s'
        }
      });
    }

    // WebRTC error
    try {
      throw new Error('ICE connection failed: No valid candidates found');
    } catch (error) {
      errorLogger.error('WebRTC connection failed', error as Error, {
        ...logContext,
        operation: 'webrtc-connection',
        metadata: {
          errorType: 'ice-connection-failed',
          iceServers: ['stun:stun.l.google.com:19302'],
          candidatesGathered: 0,
          connectionAttempts: 3
        }
      });
    }

    span.end();
  });
}

/**
 * Example: Performance Monitoring with Structured Logging
 */
async function demonstratePerformanceLogging(): Promise<void> {
  console.log("\n=== Performance Monitoring Logging ===\n");

  const perfLogger = createComponentLogger('performance-monitor');
  
  // Database query performance
  startActiveSpan('database-performance', (span) => {
    const startTime = Date.now();
    
    // Simulate database query
    setTimeout(() => {
      const duration = Date.now() - startTime;
      
      if (duration > 1000) {
        perfLogger.warn('Slow database query detected', {
          operation: 'database-query',
          metadata: {
            query: 'SELECT r.*, COUNT(g.id) as guest_count FROM rooms r LEFT JOIN guests g ON r.id = g.room_id GROUP BY r.id',
            duration: `${duration}ms`,
            threshold: '1000ms',
            table: 'rooms',
            recordsReturned: 25
          }
        });
      } else {
        perfLogger.debug('Database query completed', {
          operation: 'database-query',
          metadata: {
            duration: `${duration}ms`,
            recordsReturned: 25
          }
        });
      }
      
      span.end();
    }, 50);
  });

  // WebRTC connection performance
  const connectionStart = Date.now();
  startActiveSpan('webrtc-performance', (span) => {
    setTimeout(() => {
      const connectionTime = Date.now() - connectionStart;
      
      perfLogger.info('WebRTC connection performance metrics', {
        operation: 'webrtc-connection',
        metadata: {
          connectionTime: `${connectionTime}ms`,
          iceGatheringTime: '200ms',
          signalingTime: '50ms',
          mediaStreamTime: '100ms',
          totalParticipants: 5,
          bandwidth: '2.5 Mbps'
        }
      });
      
      span.end();
    }, 100);
  });
}

/**
 * Example: Log Export and Correlation
 */
async function demonstrateLogExport(): Promise<void> {
  console.log("\n=== Log Export and Correlation ===\n");

  const exportLogger = createComponentLogger('log-export');
  
  exportLogger.info('Starting log export demonstration', {
    operation: 'log-export-demo',
    metadata: {
      exportFormat: 'OTLP',
      destination: 'Loki',
      batchSize: 100
    }
  });

  // Start log exporter
  logExporter.start();
  
  // Generate some logs with trace correlation
  startActiveSpan('correlated-operations', (span) => {
    const traceId = span.spanContext().traceId;
    
    exportLogger.info('Operations with trace correlation', {
      operation: 'trace-correlation',
      metadata: {
        traceId,
        correlatedOperations: ['auth', 'room-create', 'webrtc-init'],
        totalSpans: 5
      }
    });

    // Create child operations
    for (let i = 1; i <= 3; i++) {
      startActiveSpan(`child-operation-${i}`, (childSpan) => {
        exportLogger.debug(`Child operation ${i} executed`, {
          operation: `child-operation-${i}`,
          metadata: {
            parentTraceId: traceId,
            operationIndex: i,
            duration: `${i * 10}ms`
          }
        });
        childSpan.end();
      });
    }

    span.end();
  });

  // Wait for export
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Get export statistics
  const stats = logExporter.getStats();
  exportLogger.info('Log export statistics', {
    operation: 'export-stats',
    metadata: {
      totalExported: stats.totalExported,
      totalFailed: stats.totalFailed,
      lastExportTime: stats.lastExportTime?.toISOString(),
      lastError: stats.lastError
    }
  });

  // Stop exporter
  logExporter.stop();
}

/**
 * Run all structured logging examples
 */
async function runStructuredLoggingExamples(): Promise<void> {
  console.log("🚀 Structured Logging Integration Examples");
  console.log("=" .repeat(50));

  try {
    // Initialize observability and logging
    await initializeObservability();
    initializeLogger();

    // Run examples
    await demonstrateAuthenticationLogging();
    await demonstrateRoomManagementLogging();
    await demonstrateWebRTCLogging();
    await demonstrateErrorLogging();
    await demonstratePerformanceLogging();
    await demonstrateLogExport();

    console.log("\n✅ All structured logging examples completed successfully!");
    console.log("\n📊 Key Features Demonstrated:");
    console.log("   - Trace correlation with OpenTelemetry");
    console.log("   - Component-specific loggers");
    console.log("   - User and room context propagation");
    console.log("   - Error logging with stack traces");
    console.log("   - Performance monitoring");
    console.log("   - Log export to OTLP/Loki");
    console.log("   - Structured JSON formatting");

  } catch (error) {
    logger.error('Structured logging examples failed', error instanceof Error ? error : new Error(String(error)), {
      operation: 'examples-execution',
      metadata: { errorType: 'example-failure' }
    });
  }
}

// Run examples if this script is executed directly
if (import.meta.main) {
  await runStructuredLoggingExamples();
}