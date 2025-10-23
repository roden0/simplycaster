/**
 * WebRTC Signaling Message Types and Interfaces
 * 
 * Comprehensive type definitions for WebRTC signaling messages,
 * participant management, and room coordination.
 */

/**
 * Base signaling message interface
 */
export interface BaseSignalingMessage {
  type: string;
  roomId: string;
  participantId: string;
  timestamp: Date;
  messageId?: string;
}

/**
 * Participant information
 */
export interface ParticipantInfo {
  id: string;
  name: string;
  type: 'host' | 'guest';
  connectionId?: string;
  joinedAt: Date;
  lastSeen?: Date;
  isConnected?: boolean;
}

/**
 * Room join message
 */
export interface JoinRoomMessage extends BaseSignalingMessage {
  type: 'join';
  data: {
    participant: ParticipantInfo;
    capabilities?: {
      audio: boolean;
      video: boolean;
      screen: boolean;
    };
  };
}

/**
 * Room leave message
 */
export interface LeaveRoomMessage extends BaseSignalingMessage {
  type: 'leave';
  data: {
    reason?: 'voluntary' | 'kicked' | 'timeout' | 'error';
    participant: ParticipantInfo;
  };
}

/**
 * WebRTC SDP offer message
 */
export interface OfferMessage extends BaseSignalingMessage {
  type: 'offer';
  data: {
    to: string; // Target participant ID
    from: string; // Source participant ID
    sdp: RTCSessionDescriptionInit;
    mediaConstraints?: {
      audio: boolean;
      video: boolean;
    };
  };
}

/**
 * WebRTC SDP answer message
 */
export interface AnswerMessage extends BaseSignalingMessage {
  type: 'answer';
  data: {
    to: string; // Target participant ID
    from: string; // Source participant ID
    sdp: RTCSessionDescriptionInit;
  };
}

/**
 * WebRTC ICE candidate message
 */
export interface IceCandidateMessage extends BaseSignalingMessage {
  type: 'ice-candidate';
  data: {
    to: string; // Target participant ID
    from: string; // Source participant ID
    candidate: RTCIceCandidateInit;
  };
}

/**
 * Recording status update message
 */
export interface RecordingStatusMessage extends BaseSignalingMessage {
  type: 'recording-status';
  data: {
    isRecording: boolean;
    recordingId?: string;
    startedAt?: Date;
    stoppedAt?: Date;
    duration?: number; // seconds
  };
}

/**
 * Participant update message (join/leave notifications)
 */
export interface ParticipantUpdateMessage extends BaseSignalingMessage {
  type: 'participant-update';
  data: {
    action: 'joined' | 'left' | 'disconnected' | 'participants-list';
    participant?: ParticipantInfo;
    participants?: ParticipantInfo[];
  };
}

/**
 * Connection status message
 */
export interface ConnectionStatusMessage extends BaseSignalingMessage {
  type: 'connection-status';
  data: {
    status: 'connected' | 'connecting' | 'disconnected' | 'failed' | 'closed';
    participantId: string;
    connectionState?: RTCPeerConnectionState;
    iceConnectionState?: RTCIceConnectionState;
    error?: string;
  };
}

/**
 * Media status message
 */
export interface MediaStatusMessage extends BaseSignalingMessage {
  type: 'media-status';
  data: {
    participantId: string;
    audio: {
      enabled: boolean;
      muted?: boolean;
      deviceId?: string;
    };
    video: {
      enabled: boolean;
      muted?: boolean;
      deviceId?: string;
    };
    screen?: {
      enabled: boolean;
    };
  };
}

/**
 * Error message
 */
export interface ErrorMessage extends BaseSignalingMessage {
  type: 'error';
  data: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    recoverable?: boolean;
  };
}

/**
 * Heartbeat/ping message for connection health
 */
export interface HeartbeatMessage extends BaseSignalingMessage {
  type: 'heartbeat';
  data: {
    ping?: boolean;
    pong?: boolean;
    latency?: number;
  };
}

/**
 * Union type for all signaling messages
 */
export type SignalingMessage =
  | JoinRoomMessage
  | LeaveRoomMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | RecordingStatusMessage
  | ParticipantUpdateMessage
  | ConnectionStatusMessage
  | MediaStatusMessage
  | ErrorMessage
  | HeartbeatMessage;

/**
 * WebSocket connection information
 */
export interface SignalingConnection {
  id: string;
  roomId: string;
  participantId: string;
  participantName: string;
  participantType: 'host' | 'guest';
  socket: WebSocket;
  lastSeen: Date;
  isAuthenticated: boolean;
  capabilities?: {
    audio: boolean;
    video: boolean;
    screen: boolean;
  };
}

/**
 * Room session state
 */
export interface RoomSession {
  roomId: string;
  participants: Map<string, SignalingConnection>;
  isRecording: boolean;
  recordingStartedAt?: Date;
  recordingId?: string;
  createdAt: Date;
  lastActivity: Date;
}

/**
 * Message validation result
 */
export interface MessageValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedMessage?: SignalingMessage;
}

/**
 * Connection statistics
 */
export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  connectionsByRoom: Record<string, number>;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  uptime: number;
}

/**
 * WebRTC connection state
 */
export interface WebRTCConnectionState {
  participantId: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
  localDescription?: RTCSessionDescription;
  remoteDescription?: RTCSessionDescription;
  connectedAt?: Date;
  lastActivity: Date;
}

/**
 * Media stream information
 */
export interface MediaStreamInfo {
  streamId: string;
  participantId: string;
  type: 'audio' | 'video' | 'screen';
  enabled: boolean;
  muted: boolean;
  deviceId?: string;
  constraints?: MediaTrackConstraints;
}

/**
 * Recording session information
 */
export interface RecordingSession {
  recordingId: string;
  roomId: string;
  startedAt: Date;
  stoppedAt?: Date;
  duration?: number;
  participants: string[];
  status: 'recording' | 'processing' | 'completed' | 'failed';
  files?: {
    participantId: string;
    fileName: string;
    size: number;
    duration: number;
  }[];
}

/**
 * Error codes for signaling operations
 */
export enum SignalingErrorCode {
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  ROOM_FULL = 'ROOM_FULL',
  PARTICIPANT_NOT_FOUND = 'PARTICIPANT_NOT_FOUND',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  MEDIA_PERMISSION_DENIED = 'MEDIA_PERMISSION_DENIED',
  RECORDING_FAILED = 'RECORDING_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * WebRTC configuration
 */
export interface WebRTCConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  bundlePolicy?: RTCBundlePolicy;
  rtcpMuxPolicy?: RTCRtcpMuxPolicy;
  iceCandidatePoolSize?: number;
}

/**
 * Media constraints for WebRTC
 */
export interface MediaConstraints {
  audio: boolean | MediaTrackConstraints;
  video: boolean | MediaTrackConstraints;
  screen?: boolean | MediaTrackConstraints;
}

/**
 * Signaling server configuration
 */
export interface SignalingServerConfig {
  maxConnections: number;
  maxRooms: number;
  maxParticipantsPerRoom: number;
  heartbeatInterval: number;
  connectionTimeout: number;
  messageRateLimit: number;
  enableLogging: boolean;
  enableMetrics: boolean;
}