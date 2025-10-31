/**
 * User Flow Tracing - End-to-end tracing for key SimplyCaster user flows
 * 
 * This module provides specialized tracing for:
 * - Room creation and management flows
 * - Recording operation flows
 * - Authentication flows
 * - User journey correlation
 */

import { SpanKind, SpanStatusCode } from "npm:@opentelemetry/api@1.7.0";
import type { Span } from "npm:@opentelemetry/api@1.7.0";
import { startActiveSpan, addCommonAttributes } from "../observability-service.ts";
import { traceAsyncOperation } from "./async-tracing.ts";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Room creation flow context
 */
export interface RoomCreationFlowContext {
  /** User ID creating the room */
  userId: string;
  /** Room name */
  roomName?: string;
  /** Room configuration */
  roomConfig?: {
    maxParticipants?: number;
    allowVideo?: boolean;
  };
  /** Flow start time */
  startTime: Date;
  /** Flow ID for correlation */
  flowId: string;
}

/**
 * Recording operation flow context
 */
export interface RecordingFlowContext {
  /** Room ID */
  roomId: string;
  /** Host user ID */
  hostId: string;
  /** Recording operation type */
  operation: 'start' | 'stop' | 'upload' | 'process';
  /** Participant count */
  participantCount?: number;
  /** Flow start time */
  startTime: Date;
  /** Flow ID for correlation */
  flowId: string;
}

/**
 * Authentication flow context
 */
export interface AuthFlowContext {
  /** Authentication type */
  authType: 'login' | 'logout' | 'register' | 'invite_accept' | 'token_refresh';
  /** User email */
  email?: string;
  /** User role */
  role?: string;
  /** Client IP */
  clientIP?: string;
  /** User agent */
  userAgent?: string;
  /** Flow start time */
  startTime: Date;
  /** Flow ID for correlation */
  flowId: string;
}

// ============================================================================
// ROOM CREATION FLOW TRACING
// ============================================================================

/**
 * Trace complete room creation flow
 */
export async function traceRoomCreationFlow<T>(
  context: RoomCreationFlowContext,
  operation: () => Promise<T>
): Promise<T> {
  return startActiveSpan(
    'room_creation_flow',
    async (span) => {
      // Add flow attributes
      span.setAttributes({
        'flow.type': 'room_creation',
        'flow.id': context.flowId,
        'flow.start_time': context.startTime.toISOString(),
        'room.name': context.roomName || '',
        'room.max_participants': context.roomConfig?.maxParticipants || 10,
        'room.allow_video': context.roomConfig?.allowVideo || true,
      });

      // Add common attributes
      addCommonAttributes(span, {
        userId: context.userId,
        operation: 'room_creation',
        component: 'room_service',
      });

      try {
        const result = await operation();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'flow.type': 'room_creation',
        'flow.id': context.flowId,
      },
    }
  );
}/**

 * Trace room join operation
 */
export async function traceRoomJoinFlow<T>(
  roomId: string,
  participantId: string,
  participantType: 'host' | 'guest',
  operation: () => Promise<T>
): Promise<T> {
  const flowId = crypto.randomUUID();
  
  return startActiveSpan(
    'room_join_flow',
    async (span) => {
      span.setAttributes({
        'flow.type': 'room_join',
        'flow.id': flowId,
        'room.id': roomId,
        'participant.id': participantId,
        'participant.type': participantType,
      });

      addCommonAttributes(span, {
        userId: participantType === 'host' ? participantId : undefined,
        roomId,
        operation: 'room_join',
        component: 'room_service',
      });

      try {
        const result = await operation();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    { kind: SpanKind.INTERNAL }
  );
}

// ============================================================================
// RECORDING FLOW TRACING
// ============================================================================

/**
 * Trace complete recording operation flow
 */
export async function traceRecordingFlow<T>(
  context: RecordingFlowContext,
  operation: () => Promise<T>
): Promise<T> {
  return startActiveSpan(
    `recording_${context.operation}_flow`,
    async (span) => {
      span.setAttributes({
        'flow.type': 'recording_operation',
        'flow.id': context.flowId,
        'flow.start_time': context.startTime.toISOString(),
        'recording.operation': context.operation,
        'recording.participant_count': context.participantCount || 0,
      });

      addCommonAttributes(span, {
        userId: context.hostId,
        roomId: context.roomId,
        operation: `recording_${context.operation}`,
        component: 'recording_service',
      });

      try {
        const result = await operation();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'flow.type': 'recording_operation',
        'recording.operation': context.operation,
      },
    }
  );
}

/**
 * Trace recording start flow
 */
export async function traceRecordingStartFlow<T>(
  roomId: string,
  hostId: string,
  participantCount: number,
  operation: () => Promise<T>
): Promise<T> {
  const context: RecordingFlowContext = {
    roomId,
    hostId,
    operation: 'start',
    participantCount,
    startTime: new Date(),
    flowId: crypto.randomUUID(),
  };

  return traceRecordingFlow(context, operation);
}

/**
 * Trace recording stop flow
 */
export async function traceRecordingStopFlow<T>(
  roomId: string,
  hostId: string,
  operation: () => Promise<T>
): Promise<T> {
  const context: RecordingFlowContext = {
    roomId,
    hostId,
    operation: 'stop',
    startTime: new Date(),
    flowId: crypto.randomUUID(),
  };

  return traceRecordingFlow(context, operation);
}

// ============================================================================
// AUTHENTICATION FLOW TRACING
// ============================================================================

/**
 * Trace complete authentication flow
 */
export async function traceAuthFlow<T>(
  context: AuthFlowContext,
  operation: () => Promise<T>
): Promise<T> {
  return startActiveSpan(
    `auth_${context.authType}_flow`,
    async (span) => {
      span.setAttributes({
        'flow.type': 'authentication',
        'flow.id': context.flowId,
        'flow.start_time': context.startTime.toISOString(),
        'auth.type': context.authType,
        'auth.email': context.email || '',
        'auth.role': context.role || '',
        'auth.client_ip': context.clientIP || '',
        'auth.user_agent': context.userAgent || '',
      });

      addCommonAttributes(span, {
        operation: `auth_${context.authType}`,
        component: 'auth_service',
      });

      try {
        const result = await operation();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'flow.type': 'authentication',
        'auth.type': context.authType,
      },
    }
  );
}

/**
 * Trace login flow
 */
export async function traceLoginFlow<T>(
  email: string,
  clientIP: string,
  userAgent: string,
  operation: () => Promise<T>
): Promise<T> {
  const context: AuthFlowContext = {
    authType: 'login',
    email,
    clientIP,
    userAgent,
    startTime: new Date(),
    flowId: crypto.randomUUID(),
  };

  return traceAuthFlow(context, operation);
}

/**
 * Trace logout flow
 */
export async function traceLogoutFlow<T>(
  userId: string,
  operation: () => Promise<T>
): Promise<T> {
  const context: AuthFlowContext = {
    authType: 'logout',
    startTime: new Date(),
    flowId: crypto.randomUUID(),
  };

  return traceAuthFlow(context, operation);
}

// ============================================================================
// END-TO-END USER JOURNEY TRACING
// ============================================================================

/**
 * Trace complete user journey from login to room creation to recording
 */
export async function traceCompleteUserJourney<T>(
  userId: string,
  journeyType: 'host_session' | 'guest_session',
  operation: () => Promise<T>
): Promise<T> {
  const journeyId = crypto.randomUUID();
  
  return startActiveSpan(
    `user_journey_${journeyType}`,
    async (span) => {
      span.setAttributes({
        'journey.type': journeyType,
        'journey.id': journeyId,
        'journey.start_time': new Date().toISOString(),
        'journey.user_id': userId,
      });

      addCommonAttributes(span, {
        userId,
        operation: `user_journey_${journeyType}`,
        component: 'user_journey_service',
      });

      try {
        const result = await operation();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'journey.type': journeyType,
        'journey.id': journeyId,
      },
    }
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create flow context for room operations
 */
export function createRoomFlowContext(
  userId: string,
  roomName?: string,
  roomConfig?: { maxParticipants?: number; allowVideo?: boolean }
): RoomCreationFlowContext {
  return {
    userId,
    roomName,
    roomConfig,
    startTime: new Date(),
    flowId: crypto.randomUUID(),
  };
}

/**
 * Create flow context for recording operations
 */
export function createRecordingFlowContext(
  roomId: string,
  hostId: string,
  operation: 'start' | 'stop' | 'upload' | 'process',
  participantCount?: number
): RecordingFlowContext {
  return {
    roomId,
    hostId,
    operation,
    participantCount,
    startTime: new Date(),
    flowId: crypto.randomUUID(),
  };
}

/**
 * Create flow context for authentication operations
 */
export function createAuthFlowContext(
  authType: 'login' | 'logout' | 'register' | 'invite_accept' | 'token_refresh',
  email?: string,
  role?: string,
  clientIP?: string,
  userAgent?: string
): AuthFlowContext {
  return {
    authType,
    email,
    role,
    clientIP,
    userAgent,
    startTime: new Date(),
    flowId: crypto.randomUUID(),
  };
}

/**
 * Decorator for room flow tracing
 */
export function withRoomFlowTracing(
  userId: string,
  roomName?: string,
  roomConfig?: { maxParticipants?: number; allowVideo?: boolean }
) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return descriptor;

    descriptor.value = (async function (this: any, ...args: any[]) {
      const context = createRoomFlowContext(userId, roomName, roomConfig);
      return traceRoomCreationFlow(context, () => originalMethod.apply(this, args));
    }) as T;

    return descriptor;
  };
}

/**
 * Decorator for recording flow tracing
 */
export function withRecordingFlowTracing(
  roomId: string,
  hostId: string,
  operation: 'start' | 'stop' | 'upload' | 'process'
) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return descriptor;

    descriptor.value = (async function (this: any, ...args: any[]) {
      const context = createRecordingFlowContext(roomId, hostId, operation);
      return traceRecordingFlow(context, () => originalMethod.apply(this, args));
    }) as T;

    return descriptor;
  };
}

/**
 * Decorator for auth flow tracing
 */
export function withAuthFlowTracing(
  authType: 'login' | 'logout' | 'register' | 'invite_accept' | 'token_refresh'
) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return descriptor;

    descriptor.value = (async function (this: any, ...args: any[]) {
      const context = createAuthFlowContext(authType);
      return traceAuthFlow(context, () => originalMethod.apply(this, args));
    }) as T;

    return descriptor;
  };
}