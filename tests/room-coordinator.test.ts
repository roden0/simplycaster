/**
 * Room Coordinator Unit Tests
 * 
 * Tests for the room coordinator service including session management,
 * participant tracking, and WebSocket connection handling.
 */

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { RoomCoordinator, WebRTCSession, Participant } from "../lib/webrtc/room-coordinator.ts";
import { Result } from "../lib/domain/types/common.ts";

// Mock dependencies
class MockRedisService {
  private storage = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    const value = this.storage.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.storage.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    // Mock implementation - in real Redis this would set expiration
  }

  async keys(pattern: string): Promise<string[]> {
    const keys = Array.from(this.storage.keys());
    if (pattern === 'webrtc:session:*') {
      return keys.filter(key => key.startsWith('webrtc:session:'));
    }
    return keys;
  }

  clear(): void {
    this.storage.clear();
  }
}

class MockRoomRepository {
  private rooms = new Map<string, any>();

  constructor() {
    // Add a default active room for testing
    this.rooms.set('test-room-1', {
      id: 'test-room-1',
      name: 'Test Room 1',
      status: 'active',
      hostId: 'host-1',
      maxParticipants: 10,
      recordingStartedAt: null,
      closedAt: null
    });

    this.rooms.set('test-room-2', {
      id: 'test-room-2',
      name: 'Test Room 2',
      status: 'recording',
      hostId: 'host-2',
      maxParticipants: 5,
      recordingStartedAt: new Date(),
      closedAt: null
    });

    this.rooms.set('closed-room', {
      id: 'closed-room',
      name: 'Closed Room',
      status: 'closed',
      hostId: 'host-3',
      maxParticipants: 10,
      recordingStartedAt: null,
      closedAt: new Date()
    });
  }

  async findById(id: string): Promise<Result<any>> {
    const room = this.rooms.get(id);
    if (room) {
      return { success: true, data: room };
    }
    return { success: false, error: new Error('Room not found') };
  }

  addRoom(room: any): void {
    this.rooms.set(room.id, room);
  }
}

class MockGuestRepository {
  private guests = new Map<string, any>();

  constructor() {
    // Add test guests
    this.guests.set('guest-1', {
      id: 'guest-1',
      roomId: 'test-room-1',
      displayName: 'Test Guest 1',
      leftAt: null,
      kickedAt: null,
      tokenExpiresAt: new Date(Date.now() + 3600000) // 1 hour from now
    });
  }

  async findById(id: string): Promise<Result<any>> {
    const guest = this.guests.get(id);
    if (guest) {
      return { success: true, data: guest };
    }
    return { success: false, error: new Error('Guest not found') };
  }

  async update(id: string, updates: any): Promise<Result<any>> {
    const guest = this.guests.get(id);
    if (guest) {
      Object.assign(guest, updates);
      return { success: true, data: guest };
    }
    return { success: false, error: new Error('Guest not found') };
  }
}

class MockUserRepository {
  private users = new Map<string, any>();

  constructor() {
    // Add test users
    this.users.set('host-1', {
      id: 'host-1',
      email: 'host1@test.com',
      role: 'host',
      isActive: true
    });

    this.users.set('admin-1', {
      id: 'admin-1',
      email: 'admin1@test.com',
      role: 'admin',
      isActive: true
    });
  }

  async findById(id: string): Promise<Result<any>> {
    const user = this.users.get(id);
    if (user) {
      return { success: true, data: user };
    }
    return { success: false, error: new Error('User not found') };
  }
}

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  sentMessages: string[] = [];

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  getLastMessage(): string | null {
    return this.sentMessages.length > 0 ? this.sentMessages[this.sentMessages.length - 1] : null;
  }

  getAllMessages(): string[] {
    return [...this.sentMessages];
  }
}

// Mock service container
const mockServices = {
  redisService: new MockRedisService(),
  roomRepository: new MockRoomRepository(),
  guestRepository: new MockGuestRepository(),
  userRepository: new MockUserRepository()
};

// Mock getService function
function mockGetService<T>(key: string): Promise<T> {
  const serviceMap: Record<string, any> = {
    'REDIS_SERVICE': mockServices.redisService,
    'ROOM_REPOSITORY': mockServices.roomRepository,
    'GUEST_REPOSITORY': mockServices.guestRepository,
    'USER_REPOSITORY': mockServices.userRepository
  };

  const service = serviceMap[key];
  if (service) {
    return Promise.resolve(service);
  }
  throw new Error(`Service ${key} not found`);
}

// Mock the service container
const originalGetService = (globalThis as any).getService;
(globalThis as any).getService = mockGetService;

// Mock domain entities
const RoomDomain = {
  isActive: (room: any) => room.status === 'active' || room.status === 'recording',
  isRecording: (room: any) => room.status === 'recording'
};

const GuestDomain = {
  isActive: (guest: any) => !guest.leftAt && !guest.kickedAt && guest.tokenExpiresAt > new Date(),
  updateLastSeen: () => ({ lastSeenAt: new Date() }),
  leaveRoom: () => ({ leftAt: new Date() })
};

// Mock domain imports
(globalThis as any).RoomDomain = RoomDomain;
(globalThis as any).GuestDomain = GuestDomain;

Deno.test("RoomCoordinator - Constructor", () => {
  const coordinator = new RoomCoordinator();
  assertExists(coordinator);
});

Deno.test("RoomCoordinator - Create room session", async () => {
  const coordinator = new RoomCoordinator();
  
  const result = await coordinator.createRoomSession('test-room-1');
  
  assert(result.success, 'Should successfully create room session');
  assertExists(result.data);
  
  const session = result.data!;
  assertEquals(session.roomId, 'test-room-1');
  assertEquals(Object.keys(session.participants).length, 0);
  assertEquals(session.isRecording, false);
  assertExists(session.createdAt);
});

Deno.test("RoomCoordinator - Create session for recording room", async () => {
  const coordinator = new RoomCoordinator();
  
  const result = await coordinator.createRoomSession('test-room-2');
  
  assert(result.success, 'Should successfully create room session');
  assertExists(result.data);
  
  const session = result.data!;
  assertEquals(session.roomId, 'test-room-2');
  assertEquals(session.isRecording, true);
  assertExists(session.recordingStartedAt);
});

Deno.test("RoomCoordinator - Fail to create session for non-existent room", async () => {
  const coordinator = new RoomCoordinator();
  
  const result = await coordinator.createRoomSession('non-existent-room');
  
  assert(!result.success, 'Should fail to create session for non-existent room');
  assertEquals(result.error.message, 'Room not found');
});

Deno.test("RoomCoordinator - Fail to create session for closed room", async () => {
  const coordinator = new RoomCoordinator();
  
  const result = await coordinator.createRoomSession('closed-room');
  
  assert(!result.success, 'Should fail to create session for closed room');
  assertEquals(result.error.message, 'Room is not active');
});

Deno.test("RoomCoordinator - Add participant to session", async () => {
  const coordinator = new RoomCoordinator();
  
  // Create session first
  const sessionResult = await coordinator.createRoomSession('test-room-1');
  assert(sessionResult.success);
  
  const participant: Participant = {
    id: 'participant-1',
    name: 'Test Participant',
    type: 'guest',
    connectionId: 'conn-1',
    joinedAt: new Date(),
    lastSeen: new Date()
  };
  
  const result = await coordinator.addParticipant('test-room-1', participant);
  
  assert(result.success, 'Should successfully add participant');
  
  // Verify participant was added
  const updatedSessionResult = await coordinator.getRoomSession('test-room-1');
  assert(updatedSessionResult.success);
  
  const session = updatedSessionResult.data!;
  assertExists(session.participants['participant-1']);
  assertEquals(session.participants['participant-1'].name, 'Test Participant');
});

Deno.test("RoomCoordinator - Remove participant from session", async () => {
  const coordinator = new RoomCoordinator();
  
  // Create session and add participant
  await coordinator.createRoomSession('test-room-1');
  
  const participant: Participant = {
    id: 'participant-1',
    name: 'Test Participant',
    type: 'guest',
    connectionId: 'conn-1',
    joinedAt: new Date(),
    lastSeen: new Date()
  };
  
  await coordinator.addParticipant('test-room-1', participant);
  
  // Remove participant
  const result = await coordinator.removeParticipant('test-room-1', 'participant-1');
  
  assert(result.success, 'Should successfully remove participant');
  
  // Verify participant was removed
  const updatedSessionResult = await coordinator.getRoomSession('test-room-1');
  assert(updatedSessionResult.success);
  
  const session = updatedSessionResult.data!;
  assertEquals(session.participants['participant-1'], undefined);
});

Deno.test("RoomCoordinator - Update recording status", async () => {
  const coordinator = new RoomCoordinator();
  
  // Create session
  await coordinator.createRoomSession('test-room-1');
  
  // Update recording status
  const result = await coordinator.updateRecordingStatus('test-room-1', true);
  
  assert(result.success, 'Should successfully update recording status');
  
  // Verify recording status was updated
  const sessionResult = await coordinator.getRoomSession('test-room-1');
  assert(sessionResult.success);
  
  const session = sessionResult.data!;
  assertEquals(session.isRecording, true);
  assertExists(session.recordingStartedAt);
});

Deno.test("RoomCoordinator - Get active participants", async () => {
  const coordinator = new RoomCoordinator();
  
  // Create session and add participants
  await coordinator.createRoomSession('test-room-1');
  
  const participant1: Participant = {
    id: 'participant-1',
    name: 'Test Participant 1',
    type: 'guest',
    connectionId: 'conn-1',
    joinedAt: new Date(),
    lastSeen: new Date()
  };
  
  const participant2: Participant = {
    id: 'participant-2',
    name: 'Test Participant 2',
    type: 'host',
    connectionId: 'conn-2',
    joinedAt: new Date(),
    lastSeen: new Date()
  };
  
  await coordinator.addParticipant('test-room-1', participant1);
  await coordinator.addParticipant('test-room-1', participant2);
  
  // Get active participants
  const result = await coordinator.getActiveParticipants('test-room-1');
  
  assert(result.success, 'Should successfully get active participants');
  assertEquals(result.data!.length, 2);
  
  const participants = result.data!;
  const names = participants.map(p => p.name).sort();
  assertEquals(names, ['Test Participant 1', 'Test Participant 2']);
});

Deno.test("RoomCoordinator - Validate host access", async () => {
  const coordinator = new RoomCoordinator();
  
  // Test valid host access
  const validResult = await coordinator.validateParticipantAccess('host-1', 'host', 'test-room-1');
  assert(validResult.success);
  assertEquals(validResult.data, true);
  
  // Test admin access
  const adminResult = await coordinator.validateParticipantAccess('admin-1', 'host', 'test-room-1');
  assert(adminResult.success);
  assertEquals(adminResult.data, true);
  
  // Test invalid host access (non-existent user)
  const invalidResult = await coordinator.validateParticipantAccess('non-existent', 'host', 'test-room-1');
  assert(invalidResult.success);
  assertEquals(invalidResult.data, false);
});

Deno.test("RoomCoordinator - Validate guest access", async () => {
  const coordinator = new RoomCoordinator();
  
  // Test valid guest access
  const validResult = await coordinator.validateParticipantAccess('guest-1', 'guest', 'test-room-1');
  assert(validResult.success);
  assertEquals(validResult.data, true);
  
  // Test invalid guest access (non-existent guest)
  const invalidResult = await coordinator.validateParticipantAccess('non-existent', 'guest', 'test-room-1');
  assert(invalidResult.success);
  assertEquals(invalidResult.data, false);
});

Deno.test("RoomCoordinator - Register and manage WebSocket connections", async () => {
  const coordinator = new RoomCoordinator();
  
  const mockSocket1 = new MockWebSocket();
  const mockSocket2 = new MockWebSocket();
  
  // Register connections
  coordinator.registerConnection('conn-1', 'participant-1', mockSocket1 as any);
  coordinator.registerConnection('conn-2', 'participant-2', mockSocket2 as any);
  
  // Test getting participant connection
  const socket1 = coordinator.getParticipantConnection('participant-1');
  assertEquals(socket1, mockSocket1);
  
  const socket2 = coordinator.getParticipantConnection('participant-2');
  assertEquals(socket2, mockSocket2);
  
  // Test connection stats
  const stats = coordinator.getConnectionStats();
  assertEquals(stats.totalConnections, 2);
  assertEquals(stats.participantConnections, 2);
  
  // Unregister connection
  coordinator.unregisterConnection('conn-1');
  
  const removedSocket = coordinator.getParticipantConnection('participant-1');
  assertEquals(removedSocket, null);
  
  const updatedStats = coordinator.getConnectionStats();
  assertEquals(updatedStats.totalConnections, 1);
  assertEquals(updatedStats.participantConnections, 1);
});

Deno.test("RoomCoordinator - Send message to participant", async () => {
  const coordinator = new RoomCoordinator();
  
  const mockSocket = new MockWebSocket();
  coordinator.registerConnection('conn-1', 'participant-1', mockSocket as any);
  
  const message = { type: 'test', data: 'hello' };
  const success = coordinator.sendToParticipant('participant-1', message);
  
  assert(success, 'Should successfully send message');
  
  const sentMessage = mockSocket.getLastMessage();
  assertExists(sentMessage);
  assertEquals(JSON.parse(sentMessage), message);
});

Deno.test("RoomCoordinator - Broadcast to room", async () => {
  const coordinator = new RoomCoordinator();
  
  // Create session and add participants
  await coordinator.createRoomSession('test-room-1');
  
  const participant1: Participant = {
    id: 'participant-1',
    name: 'Test Participant 1',
    type: 'guest',
    connectionId: 'conn-1',
    joinedAt: new Date(),
    lastSeen: new Date()
  };
  
  const participant2: Participant = {
    id: 'participant-2',
    name: 'Test Participant 2',
    type: 'host',
    connectionId: 'conn-2',
    joinedAt: new Date(),
    lastSeen: new Date()
  };
  
  await coordinator.addParticipant('test-room-1', participant1);
  await coordinator.addParticipant('test-room-1', participant2);
  
  // Register WebSocket connections
  const mockSocket1 = new MockWebSocket();
  const mockSocket2 = new MockWebSocket();
  
  coordinator.registerConnection('conn-1', 'participant-1', mockSocket1 as any);
  coordinator.registerConnection('conn-2', 'participant-2', mockSocket2 as any);
  
  // Broadcast message
  const message = { type: 'broadcast', data: 'hello everyone' };
  const result = await coordinator.broadcastToRoom('test-room-1', message);
  
  assert(result.success, 'Should successfully broadcast message');
  assertEquals(result.data, 2); // Should send to 2 participants
  
  // Verify both participants received the message
  const message1 = mockSocket1.getLastMessage();
  const message2 = mockSocket2.getLastMessage();
  
  assertExists(message1);
  assertExists(message2);
  assertEquals(JSON.parse(message1), message);
  assertEquals(JSON.parse(message2), message);
});

Deno.test("RoomCoordinator - Broadcast to room excluding sender", async () => {
  const coordinator = new RoomCoordinator();
  
  // Create session and add participants
  await coordinator.createRoomSession('test-room-1');
  
  const participant1: Participant = {
    id: 'participant-1',
    name: 'Test Participant 1',
    type: 'guest',
    connectionId: 'conn-1',
    joinedAt: new Date(),
    lastSeen: new Date()
  };
  
  const participant2: Participant = {
    id: 'participant-2',
    name: 'Test Participant 2',
    type: 'host',
    connectionId: 'conn-2',
    joinedAt: new Date(),
    lastSeen: new Date()
  };
  
  await coordinator.addParticipant('test-room-1', participant1);
  await coordinator.addParticipant('test-room-1', participant2);
  
  // Register WebSocket connections
  const mockSocket1 = new MockWebSocket();
  const mockSocket2 = new MockWebSocket();
  
  coordinator.registerConnection('conn-1', 'participant-1', mockSocket1 as any);
  coordinator.registerConnection('conn-2', 'participant-2', mockSocket2 as any);
  
  // Broadcast message excluding participant-1
  const message = { type: 'broadcast', data: 'hello others' };
  const result = await coordinator.broadcastToRoom('test-room-1', message, 'participant-1');
  
  assert(result.success, 'Should successfully broadcast message');
  assertEquals(result.data, 1); // Should send to 1 participant (excluding sender)
  
  // Verify only participant-2 received the message
  const message1 = mockSocket1.getLastMessage();
  const message2 = mockSocket2.getLastMessage();
  
  assertEquals(message1, null); // participant-1 should not receive message
  assertExists(message2);
  assertEquals(JSON.parse(message2), message);
});

Deno.test("RoomCoordinator - Get room session stats", async () => {
  const coordinator = new RoomCoordinator();
  
  // Create session and add participants
  await coordinator.createRoomSession('test-room-1');
  
  const participant1: Participant = {
    id: 'participant-1',
    name: 'Test Participant 1',
    type: 'guest',
    connectionId: 'conn-1',
    joinedAt: new Date(),
    lastSeen: new Date()
  };
  
  await coordinator.addParticipant('test-room-1', participant1);
  await coordinator.updateRecordingStatus('test-room-1', true);
  
  // Get stats
  const result = await coordinator.getRoomSessionStats('test-room-1');
  
  assert(result.success, 'Should successfully get room stats');
  
  const stats = result.data!;
  assertEquals(stats.participantCount, 1);
  assertEquals(stats.isRecording, true);
  assertExists(stats.recordingDuration);
  assertExists(stats.createdAt);
});

Deno.test("RoomCoordinator - Cleanup room session", async () => {
  const coordinator = new RoomCoordinator();
  
  // Create session
  await coordinator.createRoomSession('test-room-1');
  
  // Verify session exists
  let sessionResult = await coordinator.getRoomSession('test-room-1');
  assert(sessionResult.success);
  assertExists(sessionResult.data);
  
  // Cleanup session
  const cleanupResult = await coordinator.cleanupRoomSession('test-room-1');
  assert(cleanupResult.success, 'Should successfully cleanup session');
  
  // Verify session was cleaned up (should create new one since room still exists)
  sessionResult = await coordinator.getRoomSession('test-room-1');
  assert(sessionResult.success);
  // Session should be recreated with empty participants
  assertEquals(Object.keys(sessionResult.data!.participants).length, 0);
});

Deno.test("RoomCoordinator - Clean up inactive connections", async () => {
  const coordinator = new RoomCoordinator();
  
  // Register connections
  const mockSocket1 = new MockWebSocket();
  const mockSocket2 = new MockWebSocket();
  
  coordinator.registerConnection('conn-1', 'participant-1', mockSocket1 as any);
  coordinator.registerConnection('conn-2', 'participant-2', mockSocket2 as any);
  
  // Close one socket to simulate inactive connection
  mockSocket1.close();
  
  // Clean up inactive connections
  const cleanedCount = coordinator.cleanupInactiveConnections();
  
  assertEquals(cleanedCount, 1); // Should clean up 1 inactive connection
  
  // Verify only active connection remains
  const stats = coordinator.getConnectionStats();
  assertEquals(stats.totalConnections, 1);
  
  const activeSocket = coordinator.getParticipantConnection('participant-2');
  assertEquals(activeSocket, mockSocket2);
  
  const inactiveSocket = coordinator.getParticipantConnection('participant-1');
  assertEquals(inactiveSocket, null);
});

// Cleanup after tests
Deno.test("Cleanup", () => {
  // Restore original getService if it existed
  if (originalGetService) {
    (globalThis as any).getService = originalGetService;
  } else {
    delete (globalThis as any).getService;
  }
  
  // Clear mock services
  mockServices.redisService.clear();
});