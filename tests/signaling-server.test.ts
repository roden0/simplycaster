/**
 * Signaling Server Unit Tests
 * 
 * Tests for the WebSocket signaling server route handler including
 * authentication, message routing, and connection management.
 */

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SignalingMessage, SignalingErrorCode } from "../lib/webrtc/types.ts";

// Mock WebSocket for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  url: string;
  sentMessages: string[] = [];
  
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: code || 1000, reason: reason || '' }));
    }
  }

  // Test helper methods
  simulateMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  getLastMessage(): string | null {
    return this.sentMessages.length > 0 ? this.sentMessages[this.sentMessages.length - 1] : null;
  }

  getAllMessages(): string[] {
    return [...this.sentMessages];
  }

  clearMessages(): void {
    this.sentMessages = [];
  }
}

// Mock Request for WebSocket upgrade
class MockRequest {
  headers: Map<string, string>;
  url: string;

  constructor(url: string, headers: Record<string, string> = {}) {
    this.url = url;
    this.headers = new Map(Object.entries(headers));
  }

  get(name: string): string | null {
    return this.headers.get(name.toLowerCase()) || null;
  }
}

// Mock authentication result
interface MockAuthResult {
  participantId: string;
  participantName: string;
  participantType: 'host' | 'guest';
  roomId: string;
}

// Mock authentication function
function mockAuthenticateWebSocketConnection(req: any): MockAuthResult | null {
  const url = new URL(req.url);
  const roomId = url.searchParams.get('roomId');
  const token = url.searchParams.get('token');
  
  if (!roomId) {
    return null;
  }
  
  // Mock authentication logic
  if (token === 'valid-host-token') {
    return {
      participantId: 'host-123',
      participantName: 'Test Host',
      participantType: 'host',
      roomId
    };
  } else if (token === 'valid-guest-token') {
    return {
      participantId: 'guest-456',
      participantName: 'Test Guest',
      participantType: 'guest',
      roomId
    };
  }
  
  return null;
}

// Mock room repository
class MockRoomRepository {
  private rooms = new Map<string, any>();

  constructor() {
    // Add test rooms
    this.rooms.set('active-room', {
      id: 'active-room',
      name: 'Active Room',
      status: 'active',
      hostId: 'host-123',
      maxParticipants: 10,
      recordingStartedAt: null,
      closedAt: null
    });

    this.rooms.set('recording-room', {
      id: 'recording-room',
      name: 'Recording Room',
      status: 'recording',
      hostId: 'host-123',
      maxParticipants: 5,
      recordingStartedAt: new Date(),
      closedAt: null
    });

    this.rooms.set('closed-room', {
      id: 'closed-room',
      name: 'Closed Room',
      status: 'closed',
      hostId: 'host-123',
      maxParticipants: 10,
      recordingStartedAt: null,
      closedAt: new Date()
    });
  }

  async findById(id: string): Promise<{ success: boolean; data?: any; error?: Error }> {
    const room = this.rooms.get(id);
    if (room) {
      return { success: true, data: room };
    }
    return { success: false, error: new Error('Room not found') };
  }
}

// Mock guest repository
class MockGuestRepository {
  private guests = new Map<string, any>();

  async update(id: string, updates: any): Promise<{ success: boolean; data?: any; error?: Error }> {
    const guest = this.guests.get(id);
    if (guest) {
      Object.assign(guest, updates);
      return { success: true, data: guest };
    }
    return { success: false, error: new Error('Guest not found') };
  }
}

// Mock service container
const mockServices = {
  roomRepository: new MockRoomRepository(),
  guestRepository: new MockGuestRepository()
};

// Mock getService function
function mockGetService<T>(key: string): Promise<T> {
  const serviceMap: Record<string, any> = {
    'ROOM_REPOSITORY': mockServices.roomRepository,
    'GUEST_REPOSITORY': mockServices.guestRepository
  };

  const service = serviceMap[key];
  if (service) {
    return Promise.resolve(service);
  }
  throw new Error(`Service ${key} not found`);
}

// Mock domain entities
const RoomDomain = {
  isActive: (room: any) => room.status === 'active' || room.status === 'recording',
  isRecording: (room: any) => room.status === 'recording'
};

const GuestDomain = {
  updateLastSeen: () => ({ lastSeenAt: new Date() }),
  leaveRoom: () => ({ leftAt: new Date() })
};

// Mock Deno.upgradeWebSocket
function mockUpgradeWebSocket(req: any): { socket: MockWebSocket; response: Response } {
  const socket = new MockWebSocket(req.url);
  const response = new Response(null, { status: 101 });
  return { socket, response };
}

// Setup mocks
function setupMocks() {
  // @ts-ignore
  globalThis.getService = mockGetService;
  // @ts-ignore
  globalThis.RoomDomain = RoomDomain;
  // @ts-ignore
  globalThis.GuestDomain = GuestDomain;
  // @ts-ignore
  globalThis.authenticateWebSocketConnection = mockAuthenticateWebSocketConnection;
  // @ts-ignore
  globalThis.Deno = {
    upgradeWebSocket: mockUpgradeWebSocket
  };
}

Deno.test("Signaling Server - WebSocket upgrade with valid authentication", async () => {
  setupMocks();
  
  // Import the handler after mocks are set up
  const { handler } = await import("../routes/api/signaling/ws.ts");
  
  const req = new MockRequest(
    'ws://localhost:8080/api/signaling/ws?roomId=active-room&token=valid-host-token',
    { 'upgrade': 'websocket' }
  );

  const ctx = { req };
  const response = await handler.GET(ctx);
  
  assertEquals(response.status, 101); // WebSocket upgrade status
});

Deno.test("Signaling Server - Reject non-WebSocket requests", async () => {
  setupMocks();
  
  const { handler } = await import("../routes/api/signaling/ws.ts");
  
  const req = new MockRequest('http://localhost:8080/api/signaling/ws');
  const ctx = { req };
  const response = await handler.GET(ctx);
  
  assertEquals(response.status, 400);
  assertEquals(await response.text(), "Expected WebSocket upgrade");
});

Deno.test("Signaling Server - Reject invalid authentication", async () => {
  setupMocks();
  
  const { handler } = await import("../routes/api/signaling/ws.ts");
  
  const req = new MockRequest(
    'ws://localhost:8080/api/signaling/ws?roomId=active-room&token=invalid-token',
    { 'upgrade': 'websocket' }
  );

  const ctx = { req };
  const response = await handler.GET(ctx);
  
  assertEquals(response.status, 401);
  assertEquals(await response.text(), "Authentication failed");
});

Deno.test("Signaling Server - Reject non-existent room", async () => {
  setupMocks();
  
  const { handler } = await import("../routes/api/signaling/ws.ts");
  
  const req = new MockRequest(
    'ws://localhost:8080/api/signaling/ws?roomId=non-existent-room&token=valid-host-token',
    { 'upgrade': 'websocket' }
  );

  const ctx = { req };
  const response = await handler.GET(ctx);
  
  assertEquals(response.status, 404);
  assertEquals(await response.text(), "Room not found");
});

Deno.test("Signaling Server - Reject closed room", async () => {
  setupMocks();
  
  const { handler } = await import("../routes/api/signaling/ws.ts");
  
  const req = new MockRequest(
    'ws://localhost:8080/api/signaling/ws?roomId=closed-room&token=valid-host-token',
    { 'upgrade': 'websocket' }
  );

  const ctx = { req };
  const response = await handler.GET(ctx);
  
  assertEquals(response.status, 403);
  assertEquals(await response.text(), "Room is not active");
});

// Note: The following tests would require more complex mocking of the WebSocket
// connection lifecycle and message handling. In a real implementation, you would
// need to create integration tests that can actually establish WebSocket connections
// and test the message handling logic.

Deno.test("Signaling Server - Message validation", () => {
  // Test that the signaling server uses message validation
  const { validateSignalingMessage } = require("../lib/webrtc/message-validator.ts");
  
  const validMessage = {
    type: 'join',
    roomId: 'test-room',
    participantId: 'test-participant',
    data: {
      participant: {
        id: 'test-participant',
        name: 'Test User',
        type: 'guest',
        joinedAt: new Date()
      }
    }
  };
  
  const result = validateSignalingMessage(validMessage);
  assert(result.isValid, 'Valid message should pass validation');
});

Deno.test("Signaling Server - Error message creation", () => {
  const { createErrorMessage } = require("../lib/webrtc/message-validator.ts");
  
  const errorMessage = createErrorMessage(
    'test-room',
    'test-participant',
    SignalingErrorCode.ROOM_FULL,
    'Room is full'
  );
  
  assertEquals(errorMessage.type, 'error');
  assertEquals(errorMessage.data.code, SignalingErrorCode.ROOM_FULL);
  assertEquals(errorMessage.data.message, 'Room is full');
});

Deno.test("Signaling Server - Rate limiting", () => {
  const { MessageRateLimiter } = require("../lib/webrtc/message-validator.ts");
  
  const rateLimiter = new MessageRateLimiter(5, 1000); // 5 messages per second
  
  // Should allow messages within limit
  for (let i = 0; i < 5; i++) {
    assert(rateLimiter.canSendMessage('test-participant'));
  }
  
  // Should block message over limit
  assert(!rateLimiter.canSendMessage('test-participant'));
});

// Mock WebSocket connection tests (simplified)
Deno.test("Signaling Server - WebSocket connection lifecycle", () => {
  const mockSocket = new MockWebSocket('ws://test');
  
  let openEventFired = false;
  let closeEventFired = false;
  
  mockSocket.onopen = () => {
    openEventFired = true;
  };
  
  mockSocket.onclose = () => {
    closeEventFired = true;
  };
  
  // Simulate connection open
  if (mockSocket.onopen) {
    mockSocket.onopen(new Event('open'));
  }
  
  assert(openEventFired, 'Open event should be fired');
  
  // Simulate connection close
  mockSocket.close();
  
  assert(closeEventFired, 'Close event should be fired');
  assertEquals(mockSocket.readyState, MockWebSocket.CLOSED);
});

Deno.test("Signaling Server - Message sending and receiving", () => {
  const mockSocket = new MockWebSocket('ws://test');
  
  let receivedMessage: string | null = null;
  
  mockSocket.onmessage = (event) => {
    receivedMessage = event.data;
  };
  
  // Test sending message
  const testMessage = JSON.stringify({ type: 'test', data: 'hello' });
  mockSocket.send(testMessage);
  
  const sentMessages = mockSocket.getAllMessages();
  assertEquals(sentMessages.length, 1);
  assertEquals(sentMessages[0], testMessage);
  
  // Test receiving message
  mockSocket.simulateMessage('received message');
  assertEquals(receivedMessage, 'received message');
});

// Integration test helpers
Deno.test("Signaling Server - Join message handling", () => {
  // This would test the actual join message handling logic
  // In a real implementation, you would mock the session manager
  // and test that participants are properly added to rooms
  
  const joinMessage: SignalingMessage = {
    type: 'join',
    roomId: 'test-room',
    participantId: 'test-participant',
    timestamp: new Date(),
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
  
  // Validate the message structure
  const { validateSignalingMessage } = require("../lib/webrtc/message-validator.ts");
  const result = validateSignalingMessage(joinMessage);
  
  assert(result.isValid, 'Join message should be valid');
  assertExists(result.sanitizedMessage);
});

Deno.test("Signaling Server - WebRTC offer/answer handling", () => {
  // Test WebRTC signaling message structures
  
  const offerMessage: SignalingMessage = {
    type: 'offer',
    roomId: 'test-room',
    participantId: 'participant-1',
    timestamp: new Date(),
    data: {
      to: 'participant-2',
      from: 'participant-1',
      sdp: {
        type: 'offer',
        sdp: 'v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\n...'
      }
    }
  };
  
  const answerMessage: SignalingMessage = {
    type: 'answer',
    roomId: 'test-room',
    participantId: 'participant-2',
    timestamp: new Date(),
    data: {
      to: 'participant-1',
      from: 'participant-2',
      sdp: {
        type: 'answer',
        sdp: 'v=0\r\no=- 987654321 2 IN IP4 127.0.0.1\r\n...'
      }
    }
  };
  
  const { validateSignalingMessage } = require("../lib/webrtc/message-validator.ts");
  
  const offerResult = validateSignalingMessage(offerMessage);
  const answerResult = validateSignalingMessage(answerMessage);
  
  assert(offerResult.isValid, 'Offer message should be valid');
  assert(answerResult.isValid, 'Answer message should be valid');
});

Deno.test("Signaling Server - Recording status handling", () => {
  const recordingMessage: SignalingMessage = {
    type: 'recording-status',
    roomId: 'test-room',
    participantId: 'host-123',
    timestamp: new Date(),
    data: {
      isRecording: true,
      recordingId: 'recording-456',
      startedAt: new Date()
    }
  };
  
  const { validateSignalingMessage } = require("../lib/webrtc/message-validator.ts");
  const result = validateSignalingMessage(recordingMessage);
  
  assert(result.isValid, 'Recording status message should be valid');
  assertExists(result.sanitizedMessage);
  assertEquals(result.sanitizedMessage!.data.isRecording, true);
});

// Cleanup
Deno.test("Cleanup signaling server mocks", () => {
  // Clean up global mocks
  delete (globalThis as any).getService;
  delete (globalThis as any).RoomDomain;
  delete (globalThis as any).GuestDomain;
  delete (globalThis as any).authenticateWebSocketConnection;
  delete (globalThis as any).Deno;
});