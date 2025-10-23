/**
 * WebRTC Signaling Message Validation
 * 
 * Provides validation schemas and utilities for WebRTC signaling messages
 * to ensure message integrity and security.
 */

import {
  SignalingMessage,
  MessageValidationResult,
  SignalingErrorCode,
  ParticipantInfo,
  BaseSignalingMessage
} from './types.ts';

/**
 * Message type validation rules
 */
const MESSAGE_TYPES = [
  'join',
  'leave', 
  'offer',
  'answer',
  'ice-candidate',
  'recording-status',
  'participant-update',
  'connection-status',
  'media-status',
  'error',
  'heartbeat'
] as const;

/**
 * Participant type validation
 */
const PARTICIPANT_TYPES = ['host', 'guest'] as const;

/**
 * Connection status validation
 */
const CONNECTION_STATUSES = [
  'connected',
  'connecting', 
  'disconnected',
  'failed',
  'closed'
] as const;

/**
 * Validate base message structure
 */
function validateBaseMessage(message: any): string[] {
  const errors: string[] = [];

  if (!message || typeof message !== 'object') {
    errors.push('Message must be an object');
    return errors;
  }

  if (!message.type || typeof message.type !== 'string') {
    errors.push('Message type is required and must be a string');
  } else if (!MESSAGE_TYPES.includes(message.type as any)) {
    errors.push(`Invalid message type: ${message.type}`);
  }

  if (!message.roomId || typeof message.roomId !== 'string') {
    errors.push('Room ID is required and must be a string');
  } else if (message.roomId.length > 255) {
    errors.push('Room ID must be less than 255 characters');
  }

  if (!message.participantId || typeof message.participantId !== 'string') {
    errors.push('Participant ID is required and must be a string');
  } else if (message.participantId.length > 255) {
    errors.push('Participant ID must be less than 255 characters');
  }

  if (message.timestamp) {
    const timestamp = new Date(message.timestamp);
    if (isNaN(timestamp.getTime())) {
      errors.push('Invalid timestamp format');
    }
  }

  if (message.messageId && typeof message.messageId !== 'string') {
    errors.push('Message ID must be a string');
  }

  return errors;
}

/**
 * Validate participant info structure
 */
function validateParticipantInfo(participant: any): string[] {
  const errors: string[] = [];

  if (!participant || typeof participant !== 'object') {
    errors.push('Participant info must be an object');
    return errors;
  }

  if (!participant.id || typeof participant.id !== 'string') {
    errors.push('Participant ID is required and must be a string');
  }

  if (!participant.name || typeof participant.name !== 'string') {
    errors.push('Participant name is required and must be a string');
  } else if (participant.name.length > 100) {
    errors.push('Participant name must be less than 100 characters');
  }

  if (!participant.type || !PARTICIPANT_TYPES.includes(participant.type)) {
    errors.push('Participant type must be either "host" or "guest"');
  }

  if (participant.joinedAt) {
    const joinedAt = new Date(participant.joinedAt);
    if (isNaN(joinedAt.getTime())) {
      errors.push('Invalid joinedAt timestamp format');
    }
  }

  return errors;
}

/**
 * Validate SDP (Session Description Protocol) structure
 */
function validateSDP(sdp: any): string[] {
  const errors: string[] = [];

  if (!sdp || typeof sdp !== 'object') {
    errors.push('SDP must be an object');
    return errors;
  }

  if (!sdp.type || typeof sdp.type !== 'string') {
    errors.push('SDP type is required and must be a string');
  } else if (!['offer', 'answer', 'pranswer', 'rollback'].includes(sdp.type)) {
    errors.push('Invalid SDP type');
  }

  if (!sdp.sdp || typeof sdp.sdp !== 'string') {
    errors.push('SDP content is required and must be a string');
  } else if (sdp.sdp.length > 50000) {
    errors.push('SDP content is too large');
  }

  return errors;
}

/**
 * Validate ICE candidate structure
 */
function validateIceCandidate(candidate: any): string[] {
  const errors: string[] = [];

  if (!candidate || typeof candidate !== 'object') {
    errors.push('ICE candidate must be an object');
    return errors;
  }

  if (candidate.candidate !== null && typeof candidate.candidate !== 'string') {
    errors.push('ICE candidate must be a string or null');
  }

  if (candidate.sdpMLineIndex !== null && typeof candidate.sdpMLineIndex !== 'number') {
    errors.push('SDP M-line index must be a number or null');
  }

  if (candidate.sdpMid !== null && typeof candidate.sdpMid !== 'string') {
    errors.push('SDP MID must be a string or null');
  }

  return errors;
}

/**
 * Validate join room message
 */
function validateJoinMessage(message: any): string[] {
  const errors: string[] = [];

  if (!message.data || typeof message.data !== 'object') {
    errors.push('Join message data is required');
    return errors;
  }

  if (!message.data.participant) {
    errors.push('Participant info is required for join message');
  } else {
    errors.push(...validateParticipantInfo(message.data.participant));
  }

  if (message.data.capabilities) {
    const caps = message.data.capabilities;
    if (typeof caps !== 'object') {
      errors.push('Capabilities must be an object');
    } else {
      if (typeof caps.audio !== 'boolean') {
        errors.push('Audio capability must be a boolean');
      }
      if (typeof caps.video !== 'boolean') {
        errors.push('Video capability must be a boolean');
      }
      if (caps.screen !== undefined && typeof caps.screen !== 'boolean') {
        errors.push('Screen capability must be a boolean');
      }
    }
  }

  return errors;
}

/**
 * Validate leave room message
 */
function validateLeaveMessage(message: any): string[] {
  const errors: string[] = [];

  if (!message.data || typeof message.data !== 'object') {
    errors.push('Leave message data is required');
    return errors;
  }

  if (!message.data.participant) {
    errors.push('Participant info is required for leave message');
  } else {
    errors.push(...validateParticipantInfo(message.data.participant));
  }

  if (message.data.reason) {
    const validReasons = ['voluntary', 'kicked', 'timeout', 'error'];
    if (!validReasons.includes(message.data.reason)) {
      errors.push('Invalid leave reason');
    }
  }

  return errors;
}

/**
 * Validate WebRTC offer message
 */
function validateOfferMessage(message: any): string[] {
  const errors: string[] = [];

  if (!message.data || typeof message.data !== 'object') {
    errors.push('Offer message data is required');
    return errors;
  }

  if (!message.data.to || typeof message.data.to !== 'string') {
    errors.push('Target participant ID is required for offer message');
  }

  if (!message.data.from || typeof message.data.from !== 'string') {
    errors.push('Source participant ID is required for offer message');
  }

  if (!message.data.sdp) {
    errors.push('SDP is required for offer message');
  } else {
    errors.push(...validateSDP(message.data.sdp));
  }

  if (message.data.mediaConstraints) {
    const constraints = message.data.mediaConstraints;
    if (typeof constraints !== 'object') {
      errors.push('Media constraints must be an object');
    } else {
      if (typeof constraints.audio !== 'boolean') {
        errors.push('Audio constraint must be a boolean');
      }
      if (typeof constraints.video !== 'boolean') {
        errors.push('Video constraint must be a boolean');
      }
    }
  }

  return errors;
}

/**
 * Validate WebRTC answer message
 */
function validateAnswerMessage(message: any): string[] {
  const errors: string[] = [];

  if (!message.data || typeof message.data !== 'object') {
    errors.push('Answer message data is required');
    return errors;
  }

  if (!message.data.to || typeof message.data.to !== 'string') {
    errors.push('Target participant ID is required for answer message');
  }

  if (!message.data.from || typeof message.data.from !== 'string') {
    errors.push('Source participant ID is required for answer message');
  }

  if (!message.data.sdp) {
    errors.push('SDP is required for answer message');
  } else {
    errors.push(...validateSDP(message.data.sdp));
  }

  return errors;
}

/**
 * Validate ICE candidate message
 */
function validateIceCandidateMessage(message: any): string[] {
  const errors: string[] = [];

  if (!message.data || typeof message.data !== 'object') {
    errors.push('ICE candidate message data is required');
    return errors;
  }

  if (!message.data.to || typeof message.data.to !== 'string') {
    errors.push('Target participant ID is required for ICE candidate message');
  }

  if (!message.data.from || typeof message.data.from !== 'string') {
    errors.push('Source participant ID is required for ICE candidate message');
  }

  if (!message.data.candidate) {
    errors.push('ICE candidate is required');
  } else {
    errors.push(...validateIceCandidate(message.data.candidate));
  }

  return errors;
}

/**
 * Validate recording status message
 */
function validateRecordingStatusMessage(message: any): string[] {
  const errors: string[] = [];

  if (!message.data || typeof message.data !== 'object') {
    errors.push('Recording status message data is required');
    return errors;
  }

  if (typeof message.data.isRecording !== 'boolean') {
    errors.push('Recording status must be a boolean');
  }

  if (message.data.recordingId && typeof message.data.recordingId !== 'string') {
    errors.push('Recording ID must be a string');
  }

  if (message.data.startedAt) {
    const startedAt = new Date(message.data.startedAt);
    if (isNaN(startedAt.getTime())) {
      errors.push('Invalid startedAt timestamp format');
    }
  }

  if (message.data.stoppedAt) {
    const stoppedAt = new Date(message.data.stoppedAt);
    if (isNaN(stoppedAt.getTime())) {
      errors.push('Invalid stoppedAt timestamp format');
    }
  }

  if (message.data.duration && typeof message.data.duration !== 'number') {
    errors.push('Duration must be a number');
  }

  return errors;
}

/**
 * Main message validation function
 */
export function validateSignalingMessage(message: any): MessageValidationResult {
  const errors: string[] = [];

  // Validate base message structure
  errors.push(...validateBaseMessage(message));

  if (errors.length > 0) {
    return {
      isValid: false,
      errors
    };
  }

  // Validate message-specific data
  switch (message.type) {
    case 'join':
      errors.push(...validateJoinMessage(message));
      break;
    case 'leave':
      errors.push(...validateLeaveMessage(message));
      break;
    case 'offer':
      errors.push(...validateOfferMessage(message));
      break;
    case 'answer':
      errors.push(...validateAnswerMessage(message));
      break;
    case 'ice-candidate':
      errors.push(...validateIceCandidateMessage(message));
      break;
    case 'recording-status':
      errors.push(...validateRecordingStatusMessage(message));
      break;
    case 'participant-update':
    case 'connection-status':
    case 'media-status':
    case 'error':
    case 'heartbeat':
      // Basic validation already done, these can have flexible data structures
      break;
    default:
      errors.push(`Unknown message type: ${message.type}`);
  }

  // Sanitize the message if valid
  let sanitizedMessage: SignalingMessage | undefined;
  if (errors.length === 0) {
    sanitizedMessage = {
      ...message,
      timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
      messageId: message.messageId || crypto.randomUUID()
    } as SignalingMessage;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedMessage
  };
}

/**
 * Create error message
 */
export function createErrorMessage(
  roomId: string,
  participantId: string,
  code: SignalingErrorCode,
  message: string,
  details?: Record<string, unknown>
): SignalingMessage {
  return {
    type: 'error',
    roomId,
    participantId,
    timestamp: new Date(),
    messageId: crypto.randomUUID(),
    data: {
      code,
      message,
      details,
      recoverable: code !== SignalingErrorCode.AUTHENTICATION_FAILED
    }
  };
}

/**
 * Create heartbeat message
 */
export function createHeartbeatMessage(
  roomId: string,
  participantId: string,
  ping: boolean = true
): SignalingMessage {
  return {
    type: 'heartbeat',
    roomId,
    participantId,
    timestamp: new Date(),
    messageId: crypto.randomUUID(),
    data: {
      ping,
      pong: !ping
    }
  };
}

/**
 * Sanitize message data to prevent XSS and injection attacks
 */
export function sanitizeMessageData(data: any): any {
  if (typeof data === 'string') {
    // Basic HTML/script tag removal
    return data.replace(/<[^>]*>/g, '').trim();
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeMessageData(item));
  }
  
  if (data && typeof data === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Skip potentially dangerous keys
      if (key.startsWith('__') || key.includes('script') || key.includes('eval')) {
        continue;
      }
      sanitized[key] = sanitizeMessageData(value);
    }
    return sanitized;
  }
  
  return data;
}

/**
 * Rate limiting for message validation
 */
export class MessageRateLimiter {
  private messageCount = new Map<string, { count: number; resetTime: number }>();
  private readonly maxMessages: number;
  private readonly windowMs: number;

  constructor(maxMessages: number = 100, windowMs: number = 60000) {
    this.maxMessages = maxMessages;
    this.windowMs = windowMs;
  }

  /**
   * Check if participant can send message
   */
  canSendMessage(participantId: string): boolean {
    const now = Date.now();
    const record = this.messageCount.get(participantId);

    if (!record || now > record.resetTime) {
      this.messageCount.set(participantId, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }

    if (record.count >= this.maxMessages) {
      return false;
    }

    record.count++;
    return true;
  }

  /**
   * Clean up expired rate limit records
   */
  cleanup(): void {
    const now = Date.now();
    for (const [participantId, record] of this.messageCount.entries()) {
      if (now > record.resetTime) {
        this.messageCount.delete(participantId);
      }
    }
  }
}