/**
 * Room Management Instrumentation
 * 
 * Provides OpenTelemetry instrumentation for room operations including:
 * - Room creation, joining, and leaving operations
 * - Participant management tracing
 * - Recording start/stop operations
 */

import { SpanKind, SpanStatusCode } from "npm:@opentelemetry/api@1.7.0";
import type { Span } from "npm:@opentelemetry/api@1.7.0";
import { startActiveSpan, recordCounter, recordHistogram, recordGauge, addCommonAttributes } from "../observability-service.ts";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Room operation context
 */
export interface RoomOperationContext {
  roomId: string;
  roomName?: string;
  hostId: string;
  operation: string;
  userId?: string;
  participantCount?: number;
  maxParticipants?: number;
}

/**
 * Recording operation context
 */
export interface RecordingOperationContext {
  roomId: string;
  recordingId?: string;
  hostId: string;
  operation: 'start' | 'stop' | 'pause' | 'resume';
  participantCount?: number;
  duration?: number;
}

/**
 * Participant operation context
 */
export interface ParticipantOperationContext {
  roomId: string;
  participantId: string;
  participantName?: string;
  participantType: 'host' | 'guest';
  operation: 'join' | 'leave' | 'kick';
  hostId?: string;
}

// ============================================================================
// ROOM INSTRUMENTATION CLASS
// ============================================================================

/**
 * Room management instrumentation service
 */
export class RoomInstrumentation {
  private static readonly COMPONENT_NAME = 'room-management';

  /**
   * Instrument room creation operation
   */
  static async instrumentRoomCreation<T>(
    context: RoomOperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      'room.create',
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'room.operation': 'create',
            'room.id': context.roomId,
            'room.host_id': context.hostId,
            'component.name': this.COMPONENT_NAME,
          });

          if (context.roomName) {
            span.setAttribute('room.name', context.roomName);
          }

          if (context.maxParticipants) {
            span.setAttribute('room.max_participants', context.maxParticipants);
          }

          // Add common attributes
          addCommonAttributes(span, {
            roomId: context.roomId,
            userId: context.hostId,
            operation: 'room.create',
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('room_operations_total', 1, {
            attributes: {
              operation: 'create',
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('room_operation_duration_ms', duration, {
            attributes: {
              operation: 'create',
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('room.creation_duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('room_operations_total', 1, {
            attributes: {
              operation: 'create',
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.SERVER }
    );
  }

  /**
   * Instrument room joining operation
   */
  static async instrumentRoomJoin<T>(
    context: ParticipantOperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      'room.participant.join',
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'room.operation': 'join',
            'room.id': context.roomId,
            'participant.id': context.participantId,
            'participant.type': context.participantType,
            'component.name': this.COMPONENT_NAME,
          });

          if (context.participantName) {
            span.setAttribute('participant.name', context.participantName);
          }

          if (context.hostId) {
            span.setAttribute('room.host_id', context.hostId);
          }

          // Add common attributes
          addCommonAttributes(span, {
            roomId: context.roomId,
            userId: context.participantId,
            operation: 'room.join',
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('room_participant_operations_total', 1, {
            attributes: {
              operation: 'join',
              participant_type: context.participantType,
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('room_participant_operation_duration_ms', duration, {
            attributes: {
              operation: 'join',
              participant_type: context.participantType,
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('participant.join_duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('room_participant_operations_total', 1, {
            attributes: {
              operation: 'join',
              participant_type: context.participantType,
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.SERVER }
    );
  }

  /**
   * Instrument room leaving operation
   */
  static async instrumentRoomLeave<T>(
    context: ParticipantOperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      'room.participant.leave',
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'room.operation': 'leave',
            'room.id': context.roomId,
            'participant.id': context.participantId,
            'participant.type': context.participantType,
            'component.name': this.COMPONENT_NAME,
          });

          if (context.participantName) {
            span.setAttribute('participant.name', context.participantName);
          }

          // Add common attributes
          addCommonAttributes(span, {
            roomId: context.roomId,
            userId: context.participantId,
            operation: 'room.leave',
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('room_participant_operations_total', 1, {
            attributes: {
              operation: 'leave',
              participant_type: context.participantType,
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('room_participant_operation_duration_ms', duration, {
            attributes: {
              operation: 'leave',
              participant_type: context.participantType,
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('participant.leave_duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('room_participant_operations_total', 1, {
            attributes: {
              operation: 'leave',
              participant_type: context.participantType,
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.SERVER }
    );
  }

  /**
   * Instrument participant kick operation
   */
  static async instrumentParticipantKick<T>(
    context: ParticipantOperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      'room.participant.kick',
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'room.operation': 'kick',
            'room.id': context.roomId,
            'participant.id': context.participantId,
            'participant.type': context.participantType,
            'component.name': this.COMPONENT_NAME,
          });

          if (context.participantName) {
            span.setAttribute('participant.name', context.participantName);
          }

          if (context.hostId) {
            span.setAttribute('kicked_by.host_id', context.hostId);
          }

          // Add common attributes
          addCommonAttributes(span, {
            roomId: context.roomId,
            userId: context.participantId,
            operation: 'room.kick',
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('room_participant_operations_total', 1, {
            attributes: {
              operation: 'kick',
              participant_type: context.participantType,
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('room_participant_operation_duration_ms', duration, {
            attributes: {
              operation: 'kick',
              participant_type: context.participantType,
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('participant.kick_duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('room_participant_operations_total', 1, {
            attributes: {
              operation: 'kick',
              participant_type: context.participantType,
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.SERVER }
    );
  }

  /**
   * Instrument recording start operation
   */
  static async instrumentRecordingStart<T>(
    context: RecordingOperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      'room.recording.start',
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'recording.operation': 'start',
            'room.id': context.roomId,
            'room.host_id': context.hostId,
            'component.name': this.COMPONENT_NAME,
          });

          if (context.recordingId) {
            span.setAttribute('recording.id', context.recordingId);
          }

          if (context.participantCount) {
            span.setAttribute('recording.participant_count', context.participantCount);
          }

          // Add common attributes
          addCommonAttributes(span, {
            roomId: context.roomId,
            userId: context.hostId,
            operation: 'recording.start',
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('recording_operations_total', 1, {
            attributes: {
              operation: 'start',
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('recording_operation_duration_ms', duration, {
            attributes: {
              operation: 'start',
              component: this.COMPONENT_NAME,
            },
          });

          // Record active recording gauge
          recordCounter('active_recordings_total', 1, {
            attributes: {
              room_id: context.roomId,
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('recording.start_duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('recording_operations_total', 1, {
            attributes: {
              operation: 'start',
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.SERVER }
    );
  }

  /**
   * Instrument recording stop operation
   */
  static async instrumentRecordingStop<T>(
    context: RecordingOperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      'room.recording.stop',
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'recording.operation': 'stop',
            'room.id': context.roomId,
            'room.host_id': context.hostId,
            'component.name': this.COMPONENT_NAME,
          });

          if (context.recordingId) {
            span.setAttribute('recording.id', context.recordingId);
          }

          if (context.duration) {
            span.setAttribute('recording.duration_seconds', context.duration);
          }

          if (context.participantCount) {
            span.setAttribute('recording.participant_count', context.participantCount);
          }

          // Add common attributes
          addCommonAttributes(span, {
            roomId: context.roomId,
            userId: context.hostId,
            operation: 'recording.stop',
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const operationDuration = Date.now() - startTime;

          // Record success metrics
          recordCounter('recording_operations_total', 1, {
            attributes: {
              operation: 'stop',
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('recording_operation_duration_ms', operationDuration, {
            attributes: {
              operation: 'stop',
              component: this.COMPONENT_NAME,
            },
          });

          // Record recording duration if available
          if (context.duration) {
            recordHistogram('recording_session_duration_seconds', context.duration, {
              attributes: {
                room_id: context.roomId,
                participant_count: context.participantCount?.toString() || 'unknown',
                component: this.COMPONENT_NAME,
              },
            });
          }

          // Decrement active recordings gauge
          recordCounter('active_recordings_total', -1, {
            attributes: {
              room_id: context.roomId,
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('recording.stop_duration_ms', operationDuration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('recording_operations_total', 1, {
            attributes: {
              operation: 'stop',
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.SERVER }
    );
  }

  /**
   * Instrument room closure operation
   */
  static async instrumentRoomClose<T>(
    context: RoomOperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      'room.close',
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'room.operation': 'close',
            'room.id': context.roomId,
            'room.host_id': context.hostId,
            'component.name': this.COMPONENT_NAME,
          });

          if (context.participantCount) {
            span.setAttribute('room.final_participant_count', context.participantCount);
          }

          // Add common attributes
          addCommonAttributes(span, {
            roomId: context.roomId,
            userId: context.hostId,
            operation: 'room.close',
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('room_operations_total', 1, {
            attributes: {
              operation: 'close',
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('room_operation_duration_ms', duration, {
            attributes: {
              operation: 'close',
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('room.close_duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('room_operations_total', 1, {
            attributes: {
              operation: 'close',
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.SERVER }
    );
  }

  /**
   * Record room statistics metrics
   */
  static recordRoomStatistics(roomId: string, stats: {
    participantCount: number;
    maxParticipants: number;
    isRecording: boolean;
    sessionDuration?: number;
  }): void {
    // Record current participant count
    recordGauge('room_participants_current', stats.participantCount, {
      attributes: {
        room_id: roomId,
        component: this.COMPONENT_NAME,
      },
    });

    // Record room utilization percentage
    const utilization = (stats.participantCount / stats.maxParticipants) * 100;
    recordGauge('room_utilization_percent', utilization, {
      attributes: {
        room_id: roomId,
        component: this.COMPONENT_NAME,
      },
    });

    // Record recording status
    recordGauge('room_recording_active', stats.isRecording ? 1 : 0, {
      attributes: {
        room_id: roomId,
        component: this.COMPONENT_NAME,
      },
    });

    // Record session duration if available
    if (stats.sessionDuration) {
      recordGauge('room_session_duration_seconds', stats.sessionDuration, {
        attributes: {
          room_id: roomId,
          component: this.COMPONENT_NAME,
        },
      });
    }
  }
}



// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Instrument room creation
 */
export async function instrumentRoomCreation<T>(
  context: RoomOperationContext,
  operation: () => Promise<T>
): Promise<T> {
  return RoomInstrumentation.instrumentRoomCreation(context, operation);
}

/**
 * Instrument room join
 */
export async function instrumentRoomJoin<T>(
  context: ParticipantOperationContext,
  operation: () => Promise<T>
): Promise<T> {
  return RoomInstrumentation.instrumentRoomJoin(context, operation);
}

/**
 * Instrument room leave
 */
export async function instrumentRoomLeave<T>(
  context: ParticipantOperationContext,
  operation: () => Promise<T>
): Promise<T> {
  return RoomInstrumentation.instrumentRoomLeave(context, operation);
}

/**
 * Instrument participant kick
 */
export async function instrumentParticipantKick<T>(
  context: ParticipantOperationContext,
  operation: () => Promise<T>
): Promise<T> {
  return RoomInstrumentation.instrumentParticipantKick(context, operation);
}

/**
 * Instrument recording start
 */
export async function instrumentRecordingStart<T>(
  context: RecordingOperationContext,
  operation: () => Promise<T>
): Promise<T> {
  return RoomInstrumentation.instrumentRecordingStart(context, operation);
}

/**
 * Instrument recording stop
 */
export async function instrumentRecordingStop<T>(
  context: RecordingOperationContext,
  operation: () => Promise<T>
): Promise<T> {
  return RoomInstrumentation.instrumentRecordingStop(context, operation);
}

/**
 * Instrument room close
 */
export async function instrumentRoomClose<T>(
  context: RoomOperationContext,
  operation: () => Promise<T>
): Promise<T> {
  return RoomInstrumentation.instrumentRoomClose(context, operation);
}

/**
 * Record room statistics
 */
export function recordRoomStatistics(roomId: string, stats: {
  participantCount: number;
  maxParticipants: number;
  isRecording: boolean;
  sessionDuration?: number;
}): void {
  RoomInstrumentation.recordRoomStatistics(roomId, stats);
}