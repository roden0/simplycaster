/**
 * WebRTC Operations Instrumentation
 * 
 * Provides OpenTelemetry instrumentation for WebRTC operations including:
 * - Signaling exchange and ICE candidate processing
 * - Connection establishment and quality monitoring
 * - Media stream management tracing
 */

import { SpanKind, SpanStatusCode } from "npm:@opentelemetry/api@1.7.0";
import type { Span } from "npm:@opentelemetry/api@1.7.0";
import { startActiveSpan, recordCounter, recordHistogram, recordGauge, addCommonAttributes } from "../observability-service.ts";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * WebRTC signaling context
 */
export interface SignalingContext {
  roomId: string;
  participantId: string;
  participantType: 'host' | 'guest';
  operation: 'offer' | 'answer' | 'ice-candidate' | 'renegotiation';
  messageType?: string;
  sdpType?: 'offer' | 'answer';
}

/**
 * WebRTC connection context
 */
export interface ConnectionContext {
  roomId: string;
  participantId: string;
  participantType: 'host' | 'guest';
  connectionId: string;
  operation: 'establish' | 'close' | 'reconnect' | 'failed';
  iceConnectionState?: string;
  connectionState?: string;
}

/**
 * Media stream context
 */
export interface MediaStreamContext {
  roomId: string;
  participantId: string;
  participantType: 'host' | 'guest';
  streamId: string;
  operation: 'add' | 'remove' | 'mute' | 'unmute';
  mediaType: 'audio' | 'video' | 'screen';
  trackCount?: number;
}

/**
 * Connection quality metrics
 */
export interface ConnectionQualityMetrics {
  roomId: string;
  participantId: string;
  connectionId: string;
  rtt?: number; // Round-trip time in ms
  packetsLost?: number;
  packetsSent?: number;
  packetsReceived?: number;
  bytesReceived?: number;
  bytesSent?: number;
  jitter?: number;
  audioLevel?: number;
  videoFrameRate?: number;
  videoBitrate?: number;
  audioBitrate?: number;
}

// ============================================================================
// WEBRTC INSTRUMENTATION CLASS
// ============================================================================

/**
 * WebRTC operations instrumentation service
 */
export class WebRTCInstrumentation {
  private static readonly COMPONENT_NAME = 'webrtc';

  /**
   * Instrument signaling exchange operation
   */
  static async instrumentSignaling<T>(
    context: SignalingContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      `webrtc.signaling.${context.operation}`,
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'webrtc.operation': 'signaling',
            'webrtc.signaling.type': context.operation,
            'room.id': context.roomId,
            'participant.id': context.participantId,
            'participant.type': context.participantType,
            'component.name': this.COMPONENT_NAME,
          });

          if (context.messageType) {
            span.setAttribute('webrtc.message.type', context.messageType);
          }

          if (context.sdpType) {
            span.setAttribute('webrtc.sdp.type', context.sdpType);
          }

          // Add common attributes
          addCommonAttributes(span, {
            roomId: context.roomId,
            userId: context.participantId,
            operation: `webrtc.signaling.${context.operation}`,
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('webrtc_signaling_operations_total', 1, {
            attributes: {
              operation: context.operation,
              participant_type: context.participantType,
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('webrtc_signaling_duration_ms', duration, {
            attributes: {
              operation: context.operation,
              participant_type: context.participantType,
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('webrtc.signaling.duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('webrtc_signaling_operations_total', 1, {
            attributes: {
              operation: context.operation,
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
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Instrument ICE candidate processing
   */
  static async instrumentICECandidate<T>(
    context: SignalingContext,
    candidateInfo: { candidateType?: string; protocol?: string; address?: string },
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      'webrtc.ice.candidate',
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'webrtc.operation': 'ice_candidate',
            'room.id': context.roomId,
            'participant.id': context.participantId,
            'participant.type': context.participantType,
            'component.name': this.COMPONENT_NAME,
          });

          if (candidateInfo.candidateType) {
            span.setAttribute('webrtc.ice.candidate_type', candidateInfo.candidateType);
          }

          if (candidateInfo.protocol) {
            span.setAttribute('webrtc.ice.protocol', candidateInfo.protocol);
          }

          // Add common attributes
          addCommonAttributes(span, {
            roomId: context.roomId,
            userId: context.participantId,
            operation: 'webrtc.ice.candidate',
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('webrtc_ice_candidates_total', 1, {
            attributes: {
              candidate_type: candidateInfo.candidateType || 'unknown',
              participant_type: context.participantType,
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('webrtc_ice_candidate_processing_duration_ms', duration, {
            attributes: {
              candidate_type: candidateInfo.candidateType || 'unknown',
              participant_type: context.participantType,
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('webrtc.ice.processing_duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('webrtc_ice_candidates_total', 1, {
            attributes: {
              candidate_type: candidateInfo.candidateType || 'unknown',
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
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Instrument connection establishment
   */
  static async instrumentConnectionEstablishment<T>(
    context: ConnectionContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      `webrtc.connection.${context.operation}`,
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'webrtc.operation': 'connection',
            'webrtc.connection.operation': context.operation,
            'webrtc.connection.id': context.connectionId,
            'room.id': context.roomId,
            'participant.id': context.participantId,
            'participant.type': context.participantType,
            'component.name': this.COMPONENT_NAME,
          });

          if (context.iceConnectionState) {
            span.setAttribute('webrtc.ice.connection_state', context.iceConnectionState);
          }

          if (context.connectionState) {
            span.setAttribute('webrtc.connection.state', context.connectionState);
          }

          // Add common attributes
          addCommonAttributes(span, {
            roomId: context.roomId,
            userId: context.participantId,
            operation: `webrtc.connection.${context.operation}`,
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('webrtc_connection_operations_total', 1, {
            attributes: {
              operation: context.operation,
              participant_type: context.participantType,
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('webrtc_connection_operation_duration_ms', duration, {
            attributes: {
              operation: context.operation,
              participant_type: context.participantType,
              component: this.COMPONENT_NAME,
            },
          });

          // Record connection establishment time for successful connections
          if (context.operation === 'establish') {
            recordHistogram('webrtc_connection_establishment_duration_ms', duration, {
              attributes: {
                participant_type: context.participantType,
                ice_state: context.iceConnectionState || 'unknown',
                component: this.COMPONENT_NAME,
              },
            });
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('webrtc.connection.duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('webrtc_connection_operations_total', 1, {
            attributes: {
              operation: context.operation,
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
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Instrument media stream management
   */
  static async instrumentMediaStream<T>(
    context: MediaStreamContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      `webrtc.media.${context.operation}`,
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'webrtc.operation': 'media_stream',
            'webrtc.media.operation': context.operation,
            'webrtc.media.type': context.mediaType,
            'webrtc.stream.id': context.streamId,
            'room.id': context.roomId,
            'participant.id': context.participantId,
            'participant.type': context.participantType,
            'component.name': this.COMPONENT_NAME,
          });

          if (context.trackCount) {
            span.setAttribute('webrtc.media.track_count', context.trackCount);
          }

          // Add common attributes
          addCommonAttributes(span, {
            roomId: context.roomId,
            userId: context.participantId,
            operation: `webrtc.media.${context.operation}`,
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('webrtc_media_operations_total', 1, {
            attributes: {
              operation: context.operation,
              media_type: context.mediaType,
              participant_type: context.participantType,
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('webrtc_media_operation_duration_ms', duration, {
            attributes: {
              operation: context.operation,
              media_type: context.mediaType,
              participant_type: context.participantType,
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('webrtc.media.duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('webrtc_media_operations_total', 1, {
            attributes: {
              operation: context.operation,
              media_type: context.mediaType,
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
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Record connection quality metrics
   */
  static recordConnectionQuality(metrics: ConnectionQualityMetrics): void {
    const baseAttributes = {
      room_id: metrics.roomId,
      participant_id: metrics.participantId,
      connection_id: metrics.connectionId,
      component: this.COMPONENT_NAME,
    };

    // Record RTT (Round-trip time)
    if (metrics.rtt !== undefined) {
      recordGauge('webrtc_connection_rtt_ms', metrics.rtt, {
        attributes: baseAttributes,
      });
    }

    // Record packet loss
    if (metrics.packetsLost !== undefined && metrics.packetsSent !== undefined) {
      const lossRate = metrics.packetsSent > 0 ? (metrics.packetsLost / metrics.packetsSent) * 100 : 0;
      recordGauge('webrtc_connection_packet_loss_percent', lossRate, {
        attributes: baseAttributes,
      });
    }

    // Record packet counts
    if (metrics.packetsSent !== undefined) {
      recordGauge('webrtc_connection_packets_sent_total', metrics.packetsSent, {
        attributes: baseAttributes,
      });
    }

    if (metrics.packetsReceived !== undefined) {
      recordGauge('webrtc_connection_packets_received_total', metrics.packetsReceived, {
        attributes: baseAttributes,
      });
    }

    // Record byte counts
    if (metrics.bytesSent !== undefined) {
      recordGauge('webrtc_connection_bytes_sent_total', metrics.bytesSent, {
        attributes: baseAttributes,
      });
    }

    if (metrics.bytesReceived !== undefined) {
      recordGauge('webrtc_connection_bytes_received_total', metrics.bytesReceived, {
        attributes: baseAttributes,
      });
    }

    // Record jitter
    if (metrics.jitter !== undefined) {
      recordGauge('webrtc_connection_jitter_ms', metrics.jitter, {
        attributes: baseAttributes,
      });
    }

    // Record audio level
    if (metrics.audioLevel !== undefined) {
      recordGauge('webrtc_audio_level', metrics.audioLevel, {
        attributes: { ...baseAttributes, media_type: 'audio' },
      });
    }

    // Record video metrics
    if (metrics.videoFrameRate !== undefined) {
      recordGauge('webrtc_video_frame_rate_fps', metrics.videoFrameRate, {
        attributes: { ...baseAttributes, media_type: 'video' },
      });
    }

    if (metrics.videoBitrate !== undefined) {
      recordGauge('webrtc_video_bitrate_bps', metrics.videoBitrate, {
        attributes: { ...baseAttributes, media_type: 'video' },
      });
    }

    if (metrics.audioBitrate !== undefined) {
      recordGauge('webrtc_audio_bitrate_bps', metrics.audioBitrate, {
        attributes: { ...baseAttributes, media_type: 'audio' },
      });
    }
  }

  /**
   * Record connection state change
   */
  static recordConnectionStateChange(
    roomId: string,
    participantId: string,
    connectionId: string,
    oldState: string,
    newState: string
  ): void {
    recordCounter('webrtc_connection_state_changes_total', 1, {
      attributes: {
        room_id: roomId,
        participant_id: participantId,
        connection_id: connectionId,
        old_state: oldState,
        new_state: newState,
        component: this.COMPONENT_NAME,
      },
    });

    // Record current connection state as gauge
    const stateValue = this.getConnectionStateValue(newState);
    recordGauge('webrtc_connection_state', stateValue, {
      attributes: {
        room_id: roomId,
        participant_id: participantId,
        connection_id: connectionId,
        state: newState,
        component: this.COMPONENT_NAME,
      },
    });
  }

  /**
   * Record ICE connection state change
   */
  static recordICEConnectionStateChange(
    roomId: string,
    participantId: string,
    connectionId: string,
    oldState: string,
    newState: string
  ): void {
    recordCounter('webrtc_ice_connection_state_changes_total', 1, {
      attributes: {
        room_id: roomId,
        participant_id: participantId,
        connection_id: connectionId,
        old_state: oldState,
        new_state: newState,
        component: this.COMPONENT_NAME,
      },
    });

    // Record current ICE connection state as gauge
    const stateValue = this.getICEConnectionStateValue(newState);
    recordGauge('webrtc_ice_connection_state', stateValue, {
      attributes: {
        room_id: roomId,
        participant_id: participantId,
        connection_id: connectionId,
        state: newState,
        component: this.COMPONENT_NAME,
      },
    });
  }

  /**
   * Convert connection state to numeric value for gauge metrics
   */
  private static getConnectionStateValue(state: string): number {
    const stateMap: Record<string, number> = {
      'new': 0,
      'connecting': 1,
      'connected': 2,
      'disconnected': 3,
      'failed': 4,
      'closed': 5,
    };
    return stateMap[state] ?? -1;
  }

  /**
   * Convert ICE connection state to numeric value for gauge metrics
   */
  private static getICEConnectionStateValue(state: string): number {
    const stateMap: Record<string, number> = {
      'new': 0,
      'checking': 1,
      'connected': 2,
      'completed': 3,
      'failed': 4,
      'disconnected': 5,
      'closed': 6,
    };
    return stateMap[state] ?? -1;
  }
}



// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Instrument WebRTC signaling operation
 */
export async function instrumentSignaling<T>(
  context: SignalingContext,
  operation: () => Promise<T>
): Promise<T> {
  return WebRTCInstrumentation.instrumentSignaling(context, operation);
}

/**
 * Instrument ICE candidate processing
 */
export async function instrumentICECandidate<T>(
  context: SignalingContext,
  candidateInfo: { candidateType?: string; protocol?: string; address?: string },
  operation: () => Promise<T>
): Promise<T> {
  return WebRTCInstrumentation.instrumentICECandidate(context, candidateInfo, operation);
}

/**
 * Instrument connection establishment
 */
export async function instrumentConnectionEstablishment<T>(
  context: ConnectionContext,
  operation: () => Promise<T>
): Promise<T> {
  return WebRTCInstrumentation.instrumentConnectionEstablishment(context, operation);
}

/**
 * Instrument media stream management
 */
export async function instrumentMediaStream<T>(
  context: MediaStreamContext,
  operation: () => Promise<T>
): Promise<T> {
  return WebRTCInstrumentation.instrumentMediaStream(context, operation);
}

/**
 * Record connection quality metrics
 */
export function recordConnectionQuality(metrics: ConnectionQualityMetrics): void {
  WebRTCInstrumentation.recordConnectionQuality(metrics);
}

/**
 * Record connection state change
 */
export function recordConnectionStateChange(
  roomId: string,
  participantId: string,
  connectionId: string,
  oldState: string,
  newState: string
): void {
  WebRTCInstrumentation.recordConnectionStateChange(roomId, participantId, connectionId, oldState, newState);
}

/**
 * Record ICE connection state change
 */
export function recordICEConnectionStateChange(
  roomId: string,
  participantId: string,
  connectionId: string,
  oldState: string,
  newState: string
): void {
  WebRTCInstrumentation.recordICEConnectionStateChange(roomId, participantId, connectionId, oldState, newState);
}