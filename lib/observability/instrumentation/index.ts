/**
 * Observability Instrumentation Module
 * 
 * Provides comprehensive OpenTelemetry instrumentation for SimplyCaster components:
 * - Room management operations
 * - WebRTC operations
 * - Database operations
 * - Redis cache operations
 */

import { recordProviderHealth } from "./email-instrumentation.ts";

import { recordTemplateMetrics } from "./email-instrumentation.ts";

import { recordQueueMetrics } from "./email-instrumentation.ts";

import { recordEmailMetrics } from "./email-instrumentation.ts";

import { instrumentTemplateOperation } from "./email-instrumentation.ts";

import { instrumentQueueOperation } from "./email-instrumentation.ts";

import { instrumentEmailOperation } from "./email-instrumentation.ts";

import { initializeEmailInstrumentation } from "./email-instrumentation.ts";

import { emailInstrumentation } from "./email-instrumentation.ts";

import { EmailInstrumentation } from "./email-instrumentation.ts";

// ============================================================================
// ROOM MANAGEMENT INSTRUMENTATION
// ============================================================================

export {
  RoomInstrumentation,
  instrumentRoomCreation,
  instrumentRoomJoin,
  instrumentRoomLeave,
  instrumentParticipantKick,
  instrumentRecordingStart,
  instrumentRecordingStop,
  instrumentRoomClose,
  recordRoomStatistics,
} from './room-instrumentation.ts';

export type {
  RoomOperationContext,
  RecordingOperationContext,
  ParticipantOperationContext,
} from './room-instrumentation.ts';

// ============================================================================
// WEBRTC INSTRUMENTATION
// ============================================================================

export {
  WebRTCInstrumentation,
  instrumentSignaling,
  instrumentICECandidate,
  instrumentConnectionEstablishment,
  instrumentMediaStream,
  recordConnectionQuality,
  recordConnectionStateChange,
  recordICEConnectionStateChange,
} from './webrtc-instrumentation.ts';

export type {
  SignalingContext,
  ConnectionContext,
  MediaStreamContext,
  ConnectionQualityMetrics,
} from './webrtc-instrumentation.ts';

// ============================================================================
// DATABASE INSTRUMENTATION
// ============================================================================

export {
  DatabaseInstrumentation,
  instrumentQuery,
  instrumentTransaction,
  instrumentConnectionPool,
  recordConnectionPoolStats,
  recordQueryPerformanceStats,
  extractTableName,
  getQueryOperation,
  autoInstrumentQuery,
} from './database-instrumentation.ts';

export type {
  QueryContext,
  TransactionContext,
  ConnectionPoolContext,
  QueryResult,
} from './database-instrumentation.ts';

// ============================================================================
// REDIS INSTRUMENTATION
// ============================================================================

export {
  RedisInstrumentation,
  instrumentRedisOperation,
  instrumentCacheOperation,
  instrumentSessionOperation,
  instrumentRateLimit,
  recordRedisConnectionPoolStats,
  recordCacheStats,
  recordSessionStats,
  recordRateLimitStats,
} from './redis-instrumentation.ts';

export type {
  RedisOperationContext,
  CacheOperationContext,
  SessionOperationContext,
  RateLimitContext,
  RedisOperationResult,
} from './redis-instrumentation.ts';

// ============================================================================
// EMAIL INSTRUMENTATION
// ============================================================================

export {
  EmailInstrumentation,
  emailInstrumentation,
  initializeEmailInstrumentation,
  instrumentEmailOperation,
  instrumentQueueOperation,
  instrumentTemplateOperation,
  recordEmailMetrics,
  recordQueueMetrics,
  recordTemplateMetrics,
  recordProviderHealth,
  getEmailInstrumentationHealth,
  shutdownEmailInstrumentation,
} from './email-instrumentation.ts';

export type {
  EmailOperationContext,
  EmailQueueOperationContext,
  EmailTemplateOperationContext,
  EmailProviderHealthContext,
  IEmailInstrumentation,
} from './email-instrumentation.ts';

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Initialize all instrumentation modules
 * This function can be called during application startup to ensure
 * all instrumentation is properly configured
 */
export function initializeInstrumentation(): void {
  // Currently no initialization is required for the instrumentation modules
  // This function is provided for future extensibility
  console.log('Observability instrumentation modules initialized');
}

/**
 * Get instrumentation health status
 * Returns information about the health and status of all instrumentation modules
 */
export function getInstrumentationHealth(): {
  room: boolean;
  webrtc: boolean;
  database: boolean;
  redis: boolean;
  overall: boolean;
} {
  // For now, all modules are considered healthy if they can be imported
  // In the future, this could include more sophisticated health checks
  return {
    room: true,
    webrtc: true,
    database: true,
    redis: true,
    overall: true,
  };
}

/**
 * Common instrumentation utilities
 */
export const InstrumentationUtils = {
  /**
   * Generate a unique operation ID for correlation across spans
   */
  generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Extract user context from request headers or session
   */
  extractUserContext(headers?: Headers, session?: any): { userId?: string; userRole?: string } {
    // This is a placeholder implementation
    // In practice, this would extract user information from authentication headers or session
    return {
      userId: session?.userId || headers?.get('x-user-id') || undefined,
      userRole: session?.role || headers?.get('x-user-role') || undefined,
    };
  },

  /**
   * Sanitize sensitive data from attributes
   */
  sanitizeAttributes(attributes: Record<string, any>): Record<string, any> {
    const sanitized = { ...attributes };
    
    // Remove or mask sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    
    for (const [key, value] of Object.entries(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '***';
      } else if (typeof value === 'string' && value.length > 1000) {
        // Truncate very long strings
        sanitized[key] = value.substring(0, 1000) + '... [truncated]';
      }
    }
    
    return sanitized;
  },

  /**
   * Create standardized error attributes
   */
  createErrorAttributes(error: Error | unknown): Record<string, string> {
    if (error instanceof Error) {
      return {
        'error.type': error.constructor.name,
        'error.message': error.message,
        'error.stack': error.stack?.substring(0, 2000) || '', // Limit stack trace length
      };
    }
    
    return {
      'error.type': 'unknown',
      'error.message': String(error),
    };
  },

  /**
   * Create standardized timing attributes
   */
  createTimingAttributes(startTime: number, endTime?: number): Record<string, number> {
    const end = endTime || Date.now();
    const duration = end - startTime;
    
    return {
      'timing.start_time': startTime,
      'timing.end_time': end,
      'timing.duration_ms': duration,
    };
  },
};

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Common instrumentation context that can be used across all modules
 */
export interface CommonInstrumentationContext {
  operationId?: string;
  userId?: string;
  userRole?: string;
  roomId?: string;
  sessionId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
}

/**
 * Instrumentation configuration options
 */
export interface InstrumentationConfig {
  enableRoomInstrumentation: boolean;
  enableWebRTCInstrumentation: boolean;
  enableDatabaseInstrumentation: boolean;
  enableRedisInstrumentation: boolean;
  sanitizeSensitiveData: boolean;
  maxAttributeLength: number;
  maxStackTraceLength: number;
}

/**
 * Default instrumentation configuration
 */
export const DEFAULT_INSTRUMENTATION_CONFIG: InstrumentationConfig = {
  enableRoomInstrumentation: true,
  enableWebRTCInstrumentation: true,
  enableDatabaseInstrumentation: true,
  enableRedisInstrumentation: true,
  sanitizeSensitiveData: true,
  maxAttributeLength: 1000,
  maxStackTraceLength: 2000,
};