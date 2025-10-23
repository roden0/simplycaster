/**
 * WebRTC Module Exports
 * 
 * Exports WebRTC-related services and types for use throughout the application.
 */

// Server-side components
export { RoomCoordinator } from './room-coordinator.ts';
export type { 
  WebRTCSession, 
  Participant 
} from './room-coordinator.ts';

export { 
  WebRTCServiceManager,
  getWebRTCServiceManager,
  initializeWebRTCServices,
  shutdownWebRTCServices
} from './webrtc-service-manager.ts';

// Client-side components
export { WebRTCClient } from './webrtc-client.ts';
export type { 
  WebRTCClientConfig,
  PeerConnectionInfo,
  WebRTCClientEvents
} from './webrtc-client.ts';

export { MediaManager } from './media-manager.ts';
export type {
  MediaManagerConfig,
  MediaDeviceInfo,
  MediaManagerEvents
} from './media-manager.ts';

export { ConnectionManager } from './connection-manager.ts';
export type {
  ConnectionManagerConfig,
  ConnectionManagerEvents,
  ConnectionQuality
} from './connection-manager.ts';

// Export comprehensive WebRTC types
export type {
  SignalingMessage,
  SignalingConnection,
  ParticipantInfo,
  JoinRoomMessage,
  LeaveRoomMessage,
  OfferMessage,
  AnswerMessage,
  IceCandidateMessage,
  RecordingStatusMessage,
  ParticipantUpdateMessage,
  ConnectionStatusMessage,
  MediaStatusMessage,
  ErrorMessage,
  HeartbeatMessage,
  RoomSession,
  WebRTCConnectionState,
  MediaStreamInfo,
  RecordingSession,
  WebRTCConfig,
  MediaConstraints,
  SignalingServerConfig,
  MessageValidationResult,
  ConnectionStats
} from './types.ts';

// Export validation utilities
export {
  validateSignalingMessage,
  createErrorMessage,
  createHeartbeatMessage,
  sanitizeMessageData,
  MessageRateLimiter
} from './message-validator.ts';

// Export error codes
export { SignalingErrorCode } from './types.ts';// A
dditional client-side components
export { MediaStreamManager } from './media-stream-manager.ts';
export type {
  AudioProcessingOptions,
  VideoProcessingOptions,
  StreamConfig,
  MediaStreamManagerEvents
} from './media-stream-manager.ts';

export { WebRTCRoomClient } from './webrtc-room-client.ts';
export type {
  WebRTCRoomClientConfig,
  WebRTCRoomClientEvents,
  ParticipantInfo as RoomParticipantInfo
} from './webrtc-room-client.ts';export { 
AudioProcessor } from './audio-processor.ts';
export type {
  AudioProcessingConfig,
  ProcessingProgress,
  AudioProcessingResult,
  AudioProcessorEvents
} from './audio-processor.ts';expor
t { UploadManager } from './upload-manager.ts';
export type {
  UploadConfig,
  UploadProgress,
  UploadResult,
  UploadManagerEvents
} from './upload-manager.ts';expo
rt { WebRTCErrorHandler, WebRTCError } from './error-handler.ts';
export type {
  ErrorRecoveryStrategy,
  ErrorContext,
  RecoveryAction,
  ErrorHandlerEvents
} from './error-handler.ts';e
xport { WebRTCMetricsCollector } from './metrics-collector.ts';
export type {
  ConnectionMetrics,
  SignalingMetrics,
  SessionMetrics,
  AggregatedMetrics,
  MetricsCollectorEvents
} from './metrics-collector.ts';