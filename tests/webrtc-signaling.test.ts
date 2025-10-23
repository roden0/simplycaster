/**
 * WebRTC Signaling Integration Tests
 * 
 * Integration tests for WebRTC signaling components working together
 */

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { RoomCoordinator } from "../lib/webrtc/room-coordinator.ts";
import { WebRTCClient } from "../lib/webrtc/webrtc-client.ts";
import { RecordingEngine } from "../lib/webrtc/recording-engine.ts";
import { MediaManager } from "../lib/webrtc/media-manager.ts";
import { SignalingErrorCode } from "../lib/webrtc/types.ts";

Deno.test("WebRTC Integration - All components should be importable", async () => {
  // Test that core WebRTC modules can be imported
  const validatorModule = await import("../lib/webrtc/message-validator.ts");
  assertExists(validatorModule.validateSignalingMessage);
  assertExists(validatorModule.createErrorMessage);
  assertExists(validatorModule.MessageRateLimiter);

  const typesModule = await import("../lib/webrtc/types.ts");
  assertExists(typesModule.SignalingErrorCode);
});

Deno.test("WebRTC Integration - Message validation flow", async () => {
  const { validateSignalingMessage } = await import("../lib/webrtc/message-validator.ts");
  
  const validJoinMessage = {
    type: 'join',
    roomId: 'test-room',
    participantId: 'test-participant',
    data: {
      participant: {
        id: 'test-participant',
        name: 'Test User',
        type: 'guest',
        joinedAt: new Date()
      },
      capabilities: {
        audio: true,
        video: false,
        screen: false
      }
    }
  };
  
  const result = validateSignalingMessage(validJoinMessage);
  assertEquals(result.isValid, true);
  assertEquals(result.errors.length, 0);
  assertExists(result.sanitizedMessage);
  
  // Verify sanitized message has required fields
  const sanitized = result.sanitizedMessage!;
  assertEquals(sanitized.type, 'join');
  assertEquals(sanitized.roomId, 'test-room');
  assertEquals(sanitized.participantId, 'test-participant');
  assertExists(sanitized.timestamp);
  assertExists(sanitized.messageId);
});

Deno.test("WebRTC Integration - Error handling flow", async () => {
  const { validateSignalingMessage, createErrorMessage } = await import("../lib/webrtc/message-validator.ts");
  const { SignalingErrorCode } = await import("../lib/webrtc/types.ts");
  
  // Test invalid message validation
  const invalidMessage = {
    type: 'invalid-type',
    roomId: '', // Invalid empty room ID
    participantId: 'test-participant'
  };
  
  const result = validateSignalingMessage(invalidMessage);
  assertEquals(result.isValid, false);
  assert(result.errors.length > 0);
  
  // Test error message creation
  const errorMessage = createErrorMessage(
    'test-room',
    'test-participant',
    SignalingErrorCode.INVALID_MESSAGE,
    'Invalid message format'
  );
  
  assertEquals(errorMessage.type, 'error');
  assertEquals(errorMessage.data.code, SignalingErrorCode.INVALID_MESSAGE);
  assertEquals(errorMessage.data.message, 'Invalid message format');
  assertExists(errorMessage.timestamp);
  assertExists(errorMessage.messageId);
});

Deno.test("WebRTC Integration - Rate limiting integration", async () => {
  const { MessageRateLimiter } = await import("../lib/webrtc/message-validator.ts");
  
  const rateLimiter = new MessageRateLimiter(3, 1000); // 3 messages per second
  
  // Test rate limiting works
  assert(rateLimiter.canSendMessage('participant-1'));
  assert(rateLimiter.canSendMessage('participant-1'));
  assert(rateLimiter.canSendMessage('participant-1'));
  assert(!rateLimiter.canSendMessage('participant-1')); // Should be blocked
  
  // Different participant should have separate limit
  assert(rateLimiter.canSendMessage('participant-2'));
});

Deno.test("WebRTC Integration - WebRTC message types validation", async () => {
  const { validateSignalingMessage } = await import("../lib/webrtc/message-validator.ts");
  
  // Test offer message
  const offerMessage = {
    type: 'offer',
    roomId: 'test-room',
    participantId: 'participant-1',
    data: {
      to: 'participant-2',
      from: 'participant-1',
      sdp: {
        type: 'offer',
        sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\n...'
      }
    }
  };
  
  const offerResult = validateSignalingMessage(offerMessage);
  assert(offerResult.isValid, 'Offer message should be valid');
  
  // Test answer message
  const answerMessage = {
    type: 'answer',
    roomId: 'test-room',
    participantId: 'participant-2',
    data: {
      to: 'participant-1',
      from: 'participant-2',
      sdp: {
        type: 'answer',
        sdp: 'v=0\r\no=- 987654321 2 IN IP4 127.0.0.1\r\n...'
      }
    }
  };
  
  const answerResult = validateSignalingMessage(answerMessage);
  assert(answerResult.isValid, 'Answer message should be valid');
  
  // Test ICE candidate message
  const iceCandidateMessage = {
    type: 'ice-candidate',
    roomId: 'test-room',
    participantId: 'participant-1',
    data: {
      to: 'participant-2',
      from: 'participant-1',
      candidate: {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.100 54400 typ host',
        sdpMLineIndex: 0,
        sdpMid: '0'
      }
    }
  };
  
  const iceResult = validateSignalingMessage(iceCandidateMessage);
  assert(iceResult.isValid, 'ICE candidate message should be valid');
});

Deno.test("WebRTC Integration - Recording status messages", async () => {
  const { validateSignalingMessage } = await import("../lib/webrtc/message-validator.ts");
  
  const recordingStatusMessage = {
    type: 'recording-status',
    roomId: 'test-room',
    participantId: 'host-123',
    data: {
      isRecording: true,
      recordingId: 'recording-456',
      startedAt: new Date(),
      duration: 120
    }
  };
  
  const result = validateSignalingMessage(recordingStatusMessage);
  assert(result.isValid, 'Recording status message should be valid');
  
  const sanitized = result.sanitizedMessage!;
  assertEquals(sanitized.data.isRecording, true);
  assertEquals(sanitized.data.recordingId, 'recording-456');
  assertExists(sanitized.data.startedAt);
});

Deno.test("WebRTC Integration - Heartbeat messages", async () => {
  const { validateSignalingMessage, createHeartbeatMessage } = await import("../lib/webrtc/message-validator.ts");
  
  // Test heartbeat message creation
  const heartbeatMessage = createHeartbeatMessage('test-room', 'test-participant', true);
  
  assertEquals(heartbeatMessage.type, 'heartbeat');
  assertEquals(heartbeatMessage.data.ping, true);
  assertEquals(heartbeatMessage.data.pong, false);
  
  // Test heartbeat message validation
  const result = validateSignalingMessage(heartbeatMessage);
  assert(result.isValid, 'Heartbeat message should be valid');
});

Deno.test("WebRTC Integration - Data sanitization", async () => {
  const { sanitizeMessageData } = await import("../lib/webrtc/message-validator.ts");
  
  const maliciousData = {
    name: '<script>alert("xss")</script>John Doe',
    message: '<img src="x" onerror="alert(1)">Hello',
    __proto__: 'dangerous',
    script: 'malicious',
    validField: 'safe data'
  };
  
  const sanitized = sanitizeMessageData(maliciousData);
  
  assertEquals(sanitized.name, 'alert("xss")John Doe');
  assertEquals(sanitized.message, 'Hello');
  assertEquals(sanitized.validField, 'safe data');
  assertEquals(sanitized.__proto__, undefined);
  assertEquals(sanitized.script, undefined);
});

Deno.test("WebRTC Integration - Component compatibility", () => {
  // Test that components can be imported without service container dependencies
  // const roomCoordinator = new RoomCoordinator();
  // assertExists(roomCoordinator);
  
  // Test that types are available
  assertExists(SignalingErrorCode);
  assertExists(SignalingErrorCode.ROOM_FULL);
});

Deno.test("WebRTC Integration - Type definitions", async () => {
  const typesModule = await import("../lib/webrtc/types.ts");
  
  // Test that SignalingErrorCode enum exists and has expected values
  assertExists(typesModule.SignalingErrorCode);
  assertExists(typesModule.SignalingErrorCode.AUTHENTICATION_FAILED);
  assertExists(typesModule.SignalingErrorCode.ROOM_NOT_FOUND);
  assertExists(typesModule.SignalingErrorCode.ROOM_FULL);
  assertExists(typesModule.SignalingErrorCode.INVALID_MESSAGE);
  assertExists(typesModule.SignalingErrorCode.NETWORK_ERROR);
});