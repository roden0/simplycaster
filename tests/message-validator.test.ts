/**
 * Message Validator Unit Tests
 * 
 * Tests for WebRTC signaling message validation, sanitization,
 * and rate limiting functionality.
 */

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { 
  validateSignalingMessage, 
  createErrorMessage, 
  createHeartbeatMessage,
  sanitizeMessageData,
  MessageRateLimiter
} from "../lib/webrtc/message-validator.ts";
import { SignalingErrorCode } from "../lib/webrtc/types.ts";

Deno.test("Message Validator - Valid join message", () => {
  const validJoinMessage = {
    type: 'join',
    roomId: 'test-room-123',
    participantId: 'participant-456',
    timestamp: new Date().toISOString(),
    data: {
      participant: {
        id: 'participant-456',
        name: 'Test User',
        type: 'guest',
        joinedAt: new Date().toISOString()
      },
      capabilities: {
        audio: true,
        video: false,
        screen: false
      }
    }
  };

  const result = validateSignalingMessage(validJoinMessage);
  
  assert(result.isValid, 'Valid join message should pass validation');
  assertEquals(result.errors.length, 0);
  assertExists(result.sanitizedMessage);
  assertEquals(result.sanitizedMessage!.type, 'join');
  assertEquals(result.sanitizedMessage!.roomId, 'test-room-123');
  assertEquals(result.sanitizedMessage!.participantId, 'participant-456');
});

Deno.test("Message Validator - Valid leave message", () => {
  const validLeaveMessage = {
    type: 'leave',
    roomId: 'test-room-123',
    participantId: 'participant-456',
    data: {
      participant: {
        id: 'participant-456',
        name: 'Test User',
        type: 'guest',
        joinedAt: new Date().toISOString()
      },
      reason: 'voluntary'
    }
  };

  const result = validateSignalingMessage(validLeaveMessage);
  
  assert(result.isValid, 'Valid leave message should pass validation');
  assertEquals(result.errors.length, 0);
  assertExists(result.sanitizedMessage);
  assertEquals(result.sanitizedMessage!.type, 'leave');
});

Deno.test("Message Validator - Valid WebRTC offer message", () => {
  const validOfferMessage = {
    type: 'offer',
    roomId: 'test-room-123',
    participantId: 'participant-456',
    data: {
      to: 'participant-789',
      from: 'participant-456',
      sdp: {
        type: 'offer',
        sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\n...'
      },
      mediaConstraints: {
        audio: true,
        video: false
      }
    }
  };

  const result = validateSignalingMessage(validOfferMessage);
  
  assert(result.isValid, 'Valid offer message should pass validation');
  assertEquals(result.errors.length, 0);
  assertExists(result.sanitizedMessage);
  assertEquals(result.sanitizedMessage!.type, 'offer');
});

Deno.test("Message Validator - Valid WebRTC answer message", () => {
  const validAnswerMessage = {
    type: 'answer',
    roomId: 'test-room-123',
    participantId: 'participant-789',
    data: {
      to: 'participant-456',
      from: 'participant-789',
      sdp: {
        type: 'answer',
        sdp: 'v=0\r\no=- 987654321 2 IN IP4 127.0.0.1\r\n...'
      }
    }
  };

  const result = validateSignalingMessage(validAnswerMessage);
  
  assert(result.isValid, 'Valid answer message should pass validation');
  assertEquals(result.errors.length, 0);
  assertExists(result.sanitizedMessage);
  assertEquals(result.sanitizedMessage!.type, 'answer');
});

Deno.test("Message Validator - Valid ICE candidate message", () => {
  const validIceCandidateMessage = {
    type: 'ice-candidate',
    roomId: 'test-room-123',
    participantId: 'participant-456',
    data: {
      to: 'participant-789',
      from: 'participant-456',
      candidate: {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.100 54400 typ host',
        sdpMLineIndex: 0,
        sdpMid: '0'
      }
    }
  };

  const result = validateSignalingMessage(validIceCandidateMessage);
  
  assert(result.isValid, 'Valid ICE candidate message should pass validation');
  assertEquals(result.errors.length, 0);
  assertExists(result.sanitizedMessage);
  assertEquals(result.sanitizedMessage!.type, 'ice-candidate');
});

Deno.test("Message Validator - Valid recording status message", () => {
  const validRecordingMessage = {
    type: 'recording-status',
    roomId: 'test-room-123',
    participantId: 'host-456',
    data: {
      isRecording: true,
      recordingId: 'recording-789',
      startedAt: new Date().toISOString(),
      duration: 120
    }
  };

  const result = validateSignalingMessage(validRecordingMessage);
  
  assert(result.isValid, 'Valid recording status message should pass validation');
  assertEquals(result.errors.length, 0);
  assertExists(result.sanitizedMessage);
  assertEquals(result.sanitizedMessage!.type, 'recording-status');
});

Deno.test("Message Validator - Invalid message type", () => {
  const invalidMessage = {
    type: 'invalid-type',
    roomId: 'test-room-123',
    participantId: 'participant-456',
    data: {}
  };

  const result = validateSignalingMessage(invalidMessage);
  
  assert(!result.isValid, 'Invalid message type should fail validation');
  assert(result.errors.length > 0);
  assert(result.errors.some(error => error.includes('Invalid message type')));
});

Deno.test("Message Validator - Missing required fields", () => {
  const invalidMessage = {
    type: 'join',
    // Missing roomId and participantId
    data: {}
  };

  const result = validateSignalingMessage(invalidMessage);
  
  assert(!result.isValid, 'Message with missing fields should fail validation');
  assert(result.errors.length > 0);
  assert(result.errors.some(error => error.includes('Room ID is required')));
  assert(result.errors.some(error => error.includes('Participant ID is required')));
});

Deno.test("Message Validator - Invalid room ID length", () => {
  const invalidMessage = {
    type: 'join',
    roomId: 'a'.repeat(256), // Too long
    participantId: 'participant-456',
    data: {
      participant: {
        id: 'participant-456',
        name: 'Test User',
        type: 'guest',
        joinedAt: new Date().toISOString()
      }
    }
  };

  const result = validateSignalingMessage(invalidMessage);
  
  assert(!result.isValid, 'Message with too long room ID should fail validation');
  assert(result.errors.some(error => error.includes('Room ID must be less than 255 characters')));
});

Deno.test("Message Validator - Invalid participant info", () => {
  const invalidMessage = {
    type: 'join',
    roomId: 'test-room-123',
    participantId: 'participant-456',
    data: {
      participant: {
        // Missing required fields
        type: 'invalid-type'
      }
    }
  };

  const result = validateSignalingMessage(invalidMessage);
  
  assert(!result.isValid, 'Message with invalid participant info should fail validation');
  assert(result.errors.some(error => error.includes('Participant ID is required')));
  assert(result.errors.some(error => error.includes('Participant name is required')));
  assert(result.errors.some(error => error.includes('Participant type must be either "host" or "guest"')));
});

Deno.test("Message Validator - Invalid SDP structure", () => {
  const invalidMessage = {
    type: 'offer',
    roomId: 'test-room-123',
    participantId: 'participant-456',
    data: {
      to: 'participant-789',
      from: 'participant-456',
      sdp: {
        // Missing type and sdp fields
      }
    }
  };

  const result = validateSignalingMessage(invalidMessage);
  
  assert(!result.isValid, 'Message with invalid SDP should fail validation');
  assert(result.errors.some(error => error.includes('SDP type is required')));
  assert(result.errors.some(error => error.includes('SDP content is required')));
});

Deno.test("Message Validator - Invalid ICE candidate structure", () => {
  const invalidMessage = {
    type: 'ice-candidate',
    roomId: 'test-room-123',
    participantId: 'participant-456',
    data: {
      to: 'participant-789',
      from: 'participant-456',
      candidate: {
        // Invalid candidate structure
        candidate: 123, // Should be string or null
        sdpMLineIndex: 'invalid' // Should be number or null
      }
    }
  };

  const result = validateSignalingMessage(invalidMessage);
  
  assert(!result.isValid, 'Message with invalid ICE candidate should fail validation');
  assert(result.errors.some(error => error.includes('ICE candidate must be a string or null')));
  assert(result.errors.some(error => error.includes('SDP M-line index must be a number or null')));
});

Deno.test("Message Validator - Invalid timestamp", () => {
  const invalidMessage = {
    type: 'join',
    roomId: 'test-room-123',
    participantId: 'participant-456',
    timestamp: 'invalid-timestamp',
    data: {
      participant: {
        id: 'participant-456',
        name: 'Test User',
        type: 'guest',
        joinedAt: new Date().toISOString()
      }
    }
  };

  const result = validateSignalingMessage(invalidMessage);
  
  assert(!result.isValid, 'Message with invalid timestamp should fail validation');
  assert(result.errors.some(error => error.includes('Invalid timestamp format')));
});

Deno.test("Message Validator - Sanitize message adds timestamp and messageId", () => {
  const validMessage = {
    type: 'heartbeat',
    roomId: 'test-room-123',
    participantId: 'participant-456',
    data: {
      ping: true
    }
  };

  const result = validateSignalingMessage(validMessage);
  
  assert(result.isValid, 'Valid message should pass validation');
  assertExists(result.sanitizedMessage);
  assertExists(result.sanitizedMessage!.timestamp);
  assertExists(result.sanitizedMessage!.messageId);
});

Deno.test("Message Validator - Create error message", () => {
  const errorMessage = createErrorMessage(
    'test-room-123',
    'participant-456',
    SignalingErrorCode.ROOM_FULL,
    'Room has reached maximum capacity',
    { maxParticipants: 10, currentCount: 10 }
  );

  assertEquals(errorMessage.type, 'error');
  assertEquals(errorMessage.roomId, 'test-room-123');
  assertEquals(errorMessage.participantId, 'participant-456');
  assertEquals(errorMessage.data.code, SignalingErrorCode.ROOM_FULL);
  assertEquals(errorMessage.data.message, 'Room has reached maximum capacity');
  assertExists(errorMessage.data.details);
  assertEquals(errorMessage.data.recoverable, true); // ROOM_FULL is recoverable
  assertExists(errorMessage.timestamp);
  assertExists(errorMessage.messageId);
});

Deno.test("Message Validator - Create non-recoverable error message", () => {
  const errorMessage = createErrorMessage(
    'test-room-123',
    'participant-456',
    SignalingErrorCode.AUTHENTICATION_FAILED,
    'Invalid authentication token'
  );

  assertEquals(errorMessage.data.recoverable, false); // AUTHENTICATION_FAILED is not recoverable
});

Deno.test("Message Validator - Create heartbeat message", () => {
  const heartbeatMessage = createHeartbeatMessage('test-room-123', 'participant-456', true);

  assertEquals(heartbeatMessage.type, 'heartbeat');
  assertEquals(heartbeatMessage.roomId, 'test-room-123');
  assertEquals(heartbeatMessage.participantId, 'participant-456');
  assertEquals(heartbeatMessage.data.ping, true);
  assertEquals(heartbeatMessage.data.pong, false);
  assertExists(heartbeatMessage.timestamp);
  assertExists(heartbeatMessage.messageId);
});

Deno.test("Message Validator - Create pong heartbeat message", () => {
  const pongMessage = createHeartbeatMessage('test-room-123', 'participant-456', false);

  assertEquals(pongMessage.data.ping, false);
  assertEquals(pongMessage.data.pong, true);
});

Deno.test("Message Validator - Sanitize string data", () => {
  const maliciousString = '<script>alert("xss")</script>Hello World';
  const sanitized = sanitizeMessageData(maliciousString);
  
  // The sanitization removes HTML tags but keeps the content
  assertEquals(sanitized, 'alert("xss")Hello World');
});

Deno.test("Message Validator - Sanitize object data", () => {
  const maliciousObject = {
    name: '<script>alert("xss")</script>John Doe',
    __proto__: 'dangerous',
    script: 'malicious',
    eval: 'dangerous',
    validField: 'safe data'
  };
  
  const sanitized = sanitizeMessageData(maliciousObject);
  
  // The sanitization removes HTML tags but keeps the content, and filters dangerous keys
  assertEquals(sanitized.name, 'alert("xss")John Doe');
  assertEquals(sanitized.validField, 'safe data');
  assertEquals(sanitized.__proto__, undefined);
  assertEquals(sanitized.script, undefined);
  assertEquals(sanitized.eval, undefined);
});

Deno.test("Message Validator - Sanitize array data", () => {
  const maliciousArray = [
    '<script>alert("xss")</script>Item 1',
    'Safe Item 2',
    { name: '<b>Bold Name</b>', value: 'safe' }
  ];
  
  const sanitized = sanitizeMessageData(maliciousArray);
  
  assertEquals(sanitized[0], 'alert("xss")Item 1');
  assertEquals(sanitized[1], 'Safe Item 2');
  assertEquals(sanitized[2].name, 'Bold Name');
  assertEquals(sanitized[2].value, 'safe');
});

Deno.test("Message Validator - Sanitize nested data", () => {
  const nestedData = {
    user: {
      name: '<script>alert("xss")</script>John',
      profile: {
        bio: '<img src="x" onerror="alert(1)">Developer',
        tags: ['<b>tag1</b>', 'tag2']
      }
    }
  };
  
  const sanitized = sanitizeMessageData(nestedData);
  
  assertEquals(sanitized.user.name, 'alert("xss")John');
  assertEquals(sanitized.user.profile.bio, 'Developer');
  assertEquals(sanitized.user.profile.tags[0], 'tag1');
  assertEquals(sanitized.user.profile.tags[1], 'tag2');
});

Deno.test("MessageRateLimiter - Allow messages within limit", () => {
  const rateLimiter = new MessageRateLimiter(5, 1000); // 5 messages per second
  
  // Should allow first 5 messages
  for (let i = 0; i < 5; i++) {
    const canSend = rateLimiter.canSendMessage('participant-1');
    assert(canSend, `Message ${i + 1} should be allowed`);
  }
});

Deno.test("MessageRateLimiter - Block messages over limit", () => {
  const rateLimiter = new MessageRateLimiter(3, 1000); // 3 messages per second
  
  // Allow first 3 messages
  for (let i = 0; i < 3; i++) {
    const canSend = rateLimiter.canSendMessage('participant-1');
    assert(canSend, `Message ${i + 1} should be allowed`);
  }
  
  // Block 4th message
  const canSend = rateLimiter.canSendMessage('participant-1');
  assert(!canSend, 'Message over limit should be blocked');
});

Deno.test("MessageRateLimiter - Reset after time window", async () => {
  const rateLimiter = new MessageRateLimiter(2, 100); // 2 messages per 100ms
  
  // Use up the limit
  assert(rateLimiter.canSendMessage('participant-1'));
  assert(rateLimiter.canSendMessage('participant-1'));
  assert(!rateLimiter.canSendMessage('participant-1'));
  
  // Wait for time window to reset
  await new Promise(resolve => setTimeout(resolve, 150));
  
  // Should be able to send messages again
  assert(rateLimiter.canSendMessage('participant-1'));
  assert(rateLimiter.canSendMessage('participant-1'));
});

Deno.test("MessageRateLimiter - Separate limits per participant", () => {
  const rateLimiter = new MessageRateLimiter(2, 1000); // 2 messages per second
  
  // Participant 1 uses up their limit
  assert(rateLimiter.canSendMessage('participant-1'));
  assert(rateLimiter.canSendMessage('participant-1'));
  assert(!rateLimiter.canSendMessage('participant-1'));
  
  // Participant 2 should still be able to send messages
  assert(rateLimiter.canSendMessage('participant-2'));
  assert(rateLimiter.canSendMessage('participant-2'));
  assert(!rateLimiter.canSendMessage('participant-2'));
});

Deno.test("MessageRateLimiter - Cleanup expired records", async () => {
  const rateLimiter = new MessageRateLimiter(2, 100); // 2 messages per 100ms
  
  // Create some rate limit records
  rateLimiter.canSendMessage('participant-1');
  rateLimiter.canSendMessage('participant-2');
  rateLimiter.canSendMessage('participant-3');
  
  // Wait for records to expire
  await new Promise(resolve => setTimeout(resolve, 150));
  
  // Cleanup should remove expired records
  rateLimiter.cleanup();
  
  // All participants should be able to send messages again
  assert(rateLimiter.canSendMessage('participant-1'));
  assert(rateLimiter.canSendMessage('participant-2'));
  assert(rateLimiter.canSendMessage('participant-3'));
});

Deno.test("Message Validator - Handle null and undefined values", () => {
  const result1 = validateSignalingMessage(null);
  assert(!result1.isValid);
  assert(result1.errors.some(error => error.includes('Message must be an object')));
  
  const result2 = validateSignalingMessage(undefined);
  assert(!result2.isValid);
  assert(result2.errors.some(error => error.includes('Message must be an object')));
  
  const result3 = validateSignalingMessage('string');
  assert(!result3.isValid);
  assert(result3.errors.some(error => error.includes('Message must be an object')));
});

Deno.test("Message Validator - Handle edge cases in sanitization", () => {
  // Test with null and undefined
  assertEquals(sanitizeMessageData(null), null);
  assertEquals(sanitizeMessageData(undefined), undefined);
  
  // Test with numbers and booleans
  assertEquals(sanitizeMessageData(123), 123);
  assertEquals(sanitizeMessageData(true), true);
  assertEquals(sanitizeMessageData(false), false);
  
  // Test with empty objects and arrays
  const emptyObj = sanitizeMessageData({});
  assertEquals(Object.keys(emptyObj).length, 0);
  
  const emptyArr = sanitizeMessageData([]);
  assertEquals(emptyArr.length, 0);
});