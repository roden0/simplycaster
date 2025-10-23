/**
 * WebRTC Client Unit Tests
 * 
 * Tests for the WebRTC client core functionality including connection management,
 * signaling, and peer connection handling.
 */

import { assertEquals, assertExists, assertRejects, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { WebRTCClient, WebRTCClientConfig } from "../lib/webrtc/webrtc-client.ts";
import { SignalingMessage, SignalingErrorCode } from "../lib/webrtc/types.ts";

// Mock WebSocket implementation for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private messageQueue: string[] = [];

  constructor(url: string) {
    this.url = url;
    // Simulate connection opening after a short delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.messageQueue.push(data);
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
    return this.messageQueue.length > 0 ? this.messageQueue[this.messageQueue.length - 1] : null;
  }

  getAllMessages(): string[] {
    return [...this.messageQueue];
  }

  clearMessages(): void {
    this.messageQueue = [];
  }
}

// Mock RTCPeerConnection
class MockRTCPeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  signalingState: RTCSignalingState = 'stable';
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;

  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;

  private tracks: MediaStreamTrack[] = [];

  constructor(_config?: RTCConfiguration) {}

  addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender {
    this.tracks.push(track);
    return {} as RTCRtpSender;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'offer',
      sdp: 'mock-offer-sdp'
    };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'answer',
      sdp: 'mock-answer-sdp'
    };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description as RTCSessionDescription;
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description as RTCSessionDescription;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    // Mock implementation
  }

  close(): void {
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
  }

  // Test helper methods
  simulateIceCandidate(): void {
    if (this.onicecandidate) {
      const mockCandidate = {
        candidate: 'candidate:mock',
        sdpMLineIndex: 0,
        sdpMid: '0'
      } as RTCIceCandidate;
      
      this.onicecandidate({
        candidate: mockCandidate
      } as RTCPeerConnectionIceEvent);
    }
  }

  simulateRemoteStream(): void {
    if (this.ontrack) {
      const mockStream = new MediaStream();
      this.ontrack({
        streams: [mockStream],
        receiver: {} as RTCRtpReceiver,
        track: {} as MediaStreamTrack,
        transceiver: {} as RTCRtpTransceiver
      } as RTCTrackEvent);
    }
  }

  simulateConnectionStateChange(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    if (this.onconnectionstatechange) {
      this.onconnectionstatechange();
    }
  }
}

// Mock MediaStream
class MockMediaStream {
  id = 'mock-stream-id';
  active = true;
  private tracks: MediaStreamTrack[] = [];

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter(track => track.kind === 'audio');
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter(track => track.kind === 'video');
  }

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track);
  }

  removeTrack(track: MediaStreamTrack): void {
    const index = this.tracks.indexOf(track);
    if (index > -1) {
      this.tracks.splice(index, 1);
    }
  }
}

// Mock MediaStreamTrack
class MockMediaStreamTrack {
  kind: string;
  id = 'mock-track-id';
  enabled = true;
  muted = false;
  readyState: MediaStreamTrackState = 'live';

  constructor(kind: 'audio' | 'video') {
    this.kind = kind;
  }

  stop(): void {
    this.readyState = 'ended';
  }
}

// Setup global mocks
function setupMocks() {
  // @ts-ignore - Mock global objects
  globalThis.WebSocket = MockWebSocket;
  // @ts-ignore
  globalThis.RTCPeerConnection = MockRTCPeerConnection;
  // @ts-ignore
  globalThis.MediaStream = MockMediaStream;

  // Mock navigator.mediaDevices.getUserMedia
  // @ts-ignore
  globalThis.navigator = {
    mediaDevices: {
      getUserMedia: async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
        const stream = new MockMediaStream();
        if (constraints.audio) {
          stream.addTrack(new MockMediaStreamTrack('audio') as unknown as MediaStreamTrack);
        }
        if (constraints.video) {
          stream.addTrack(new MockMediaStreamTrack('video') as unknown as MediaStreamTrack);
        }
        return stream as unknown as MediaStream;
      }
    } as unknown as MediaDevices
  };
}

// Test configuration
const testConfig: WebRTCClientConfig = {
  signalingUrl: 'ws://localhost:8080/api/signaling/ws',
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  mediaConstraints: {
    audio: true,
    video: false
  },
  reconnectAttempts: 3,
  reconnectDelay: 1000,
  heartbeatInterval: 30000
};

Deno.test("WebRTC Client - Constructor", () => {
  setupMocks();
  
  const client = new WebRTCClient(testConfig);
  assertExists(client);
  
  const stats = client.getConnectionStats();
  assertEquals(stats.isConnected, false);
  assertEquals(stats.peerConnectionCount, 0);
  assertEquals(stats.localStreamActive, false);
  assertEquals(stats.reconnectAttempts, 0);
});

Deno.test("WebRTC Client - Connect to signaling server", async () => {
  setupMocks();
  
  const client = new WebRTCClient(testConfig);
  let connectedEventFired = false;
  let localStreamReceived = false;

  client.on('connected', () => {
    connectedEventFired = true;
  });

  client.on('local-stream', (stream) => {
    localStreamReceived = true;
    assertExists(stream);
  });

  await client.connect('test-room', 'test-participant', 'Test User', 'test-token');

  // Wait for async operations
  await new Promise(resolve => setTimeout(resolve, 50));

  assert(connectedEventFired, 'Connected event should be fired');
  assert(localStreamReceived, 'Local stream event should be fired');

  const stats = client.getConnectionStats();
  assertEquals(stats.isConnected, true);
  assertEquals(stats.localStreamActive, true);

  await client.disconnect();
});

Deno.test("WebRTC Client - Handle participant joined", async () => {
  setupMocks();
  
  const client = new WebRTCClient(testConfig);
  let participantJoinedEventFired = false;
  let joinedParticipantId = '';
  let joinedParticipantName = '';

  client.on('participant-joined', (participantId, participantName) => {
    participantJoinedEventFired = true;
    joinedParticipantId = participantId;
    joinedParticipantName = participantName;
  });

  await client.connect('test-room', 'test-participant', 'Test User');

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 50));

  // Simulate participant joined message
  const participantUpdateMessage: SignalingMessage = {
    type: 'participant-update',
    roomId: 'test-room',
    participantId: 'system',
    timestamp: new Date(),
    data: {
      action: 'joined',
      participant: {
        id: 'new-participant',
        name: 'New User',
        type: 'guest',
        joinedAt: new Date()
      }
    }
  };

  // Get the mock WebSocket and simulate message
  const mockSocket = (client as any).socket as MockWebSocket;
  mockSocket.simulateMessage(JSON.stringify(participantUpdateMessage));

  // Wait for message processing
  await new Promise(resolve => setTimeout(resolve, 50));

  assert(participantJoinedEventFired, 'Participant joined event should be fired');
  assertEquals(joinedParticipantId, 'new-participant');
  assertEquals(joinedParticipantName, 'New User');

  const stats = client.getConnectionStats();
  assertEquals(stats.peerConnectionCount, 1);

  await client.disconnect();
});

Deno.test("WebRTC Client - Handle WebRTC offer", async () => {
  setupMocks();
  
  const client = new WebRTCClient(testConfig);
  await client.connect('test-room', 'test-participant', 'Test User');

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 50));

  // First add a participant
  const participantUpdateMessage: SignalingMessage = {
    type: 'participant-update',
    roomId: 'test-room',
    participantId: 'system',
    timestamp: new Date(),
    data: {
      action: 'joined',
      participant: {
        id: 'other-participant',
        name: 'Other User',
        type: 'host',
        joinedAt: new Date()
      }
    }
  };

  const mockSocket = (client as any).socket as MockWebSocket;
  mockSocket.simulateMessage(JSON.stringify(participantUpdateMessage));

  // Wait for participant processing
  await new Promise(resolve => setTimeout(resolve, 50));

  // Now simulate receiving an offer
  const offerMessage: SignalingMessage = {
    type: 'offer',
    roomId: 'test-room',
    participantId: 'other-participant',
    timestamp: new Date(),
    data: {
      from: 'other-participant',
      to: 'test-participant',
      sdp: {
        type: 'offer',
        sdp: 'mock-offer-sdp'
      }
    }
  };

  mockSocket.simulateMessage(JSON.stringify(offerMessage));

  // Wait for offer processing
  await new Promise(resolve => setTimeout(resolve, 50));

  // Check that an answer was sent
  const messages = mockSocket.getAllMessages();
  const answerMessage = messages.find(msg => {
    const parsed = JSON.parse(msg);
    return parsed.type === 'answer';
  });

  assertExists(answerMessage, 'Answer message should be sent');

  const parsedAnswer = JSON.parse(answerMessage);
  assertEquals(parsedAnswer.data.from, 'test-participant');
  assertEquals(parsedAnswer.data.to, 'other-participant');
  assertExists(parsedAnswer.data.sdp);

  await client.disconnect();
});

Deno.test("WebRTC Client - Handle ICE candidate", async () => {
  setupMocks();
  
  const client = new WebRTCClient(testConfig);
  await client.connect('test-room', 'test-participant', 'Test User');

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 50));

  // Add a participant first
  const participantUpdateMessage: SignalingMessage = {
    type: 'participant-update',
    roomId: 'test-room',
    participantId: 'system',
    timestamp: new Date(),
    data: {
      action: 'joined',
      participant: {
        id: 'other-participant',
        name: 'Other User',
        type: 'host',
        joinedAt: new Date()
      }
    }
  };

  const mockSocket = (client as any).socket as MockWebSocket;
  mockSocket.simulateMessage(JSON.stringify(participantUpdateMessage));

  // Wait for participant processing
  await new Promise(resolve => setTimeout(resolve, 50));

  // Simulate ICE candidate message
  const iceCandidateMessage: SignalingMessage = {
    type: 'ice-candidate',
    roomId: 'test-room',
    participantId: 'other-participant',
    timestamp: new Date(),
    data: {
      from: 'other-participant',
      to: 'test-participant',
      candidate: {
        candidate: 'candidate:mock',
        sdpMLineIndex: 0,
        sdpMid: '0'
      }
    }
  };

  mockSocket.simulateMessage(JSON.stringify(iceCandidateMessage));

  // Wait for ICE candidate processing
  await new Promise(resolve => setTimeout(resolve, 50));

  // The ICE candidate should be processed without errors
  // (In a real implementation, this would be added to the peer connection)
  const peerConnections = client.getPeerConnections();
  assertEquals(peerConnections.size, 1);

  await client.disconnect();
});

Deno.test("WebRTC Client - Handle recording status", async () => {
  setupMocks();
  
  const client = new WebRTCClient(testConfig);
  let recordingStatusReceived = false;
  let isRecording = false;
  let recordingId = '';

  client.on('recording-status', (recording, id) => {
    recordingStatusReceived = true;
    isRecording = recording;
    recordingId = id || '';
  });

  await client.connect('test-room', 'test-participant', 'Test User');

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 50));

  // Simulate recording status message
  const recordingStatusMessage: SignalingMessage = {
    type: 'recording-status',
    roomId: 'test-room',
    participantId: 'system',
    timestamp: new Date(),
    data: {
      isRecording: true,
      recordingId: 'test-recording-123'
    }
  };

  const mockSocket = (client as any).socket as MockWebSocket;
  mockSocket.simulateMessage(JSON.stringify(recordingStatusMessage));

  // Wait for message processing
  await new Promise(resolve => setTimeout(resolve, 50));

  assert(recordingStatusReceived, 'Recording status event should be fired');
  assertEquals(isRecording, true);
  assertEquals(recordingId, 'test-recording-123');

  await client.disconnect();
});

Deno.test("WebRTC Client - Handle heartbeat", async () => {
  setupMocks();
  
  const client = new WebRTCClient(testConfig);
  await client.connect('test-room', 'test-participant', 'Test User');

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 50));

  const mockSocket = (client as any).socket as MockWebSocket;
  mockSocket.clearMessages();

  // Simulate heartbeat ping
  const heartbeatMessage: SignalingMessage = {
    type: 'heartbeat',
    roomId: 'test-room',
    participantId: 'system',
    timestamp: new Date(),
    data: {
      ping: true
    }
  };

  mockSocket.simulateMessage(JSON.stringify(heartbeatMessage));

  // Wait for message processing
  await new Promise(resolve => setTimeout(resolve, 50));

  // Check that a pong was sent
  const messages = mockSocket.getAllMessages();
  const pongMessage = messages.find(msg => {
    const parsed = JSON.parse(msg);
    return parsed.type === 'heartbeat' && parsed.data.pong === true;
  });

  assertExists(pongMessage, 'Pong message should be sent');

  await client.disconnect();
});

Deno.test("WebRTC Client - Handle connection errors", async () => {
  setupMocks();
  
  const client = new WebRTCClient(testConfig);
  let errorEventFired = false;
  let errorCode: SignalingErrorCode | undefined;

  client.on('error', (error, code) => {
    errorEventFired = true;
    errorCode = code;
  });

  await client.connect('test-room', 'test-participant', 'Test User');

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 50));

  // Simulate error message
  const errorMessage: SignalingMessage = {
    type: 'error',
    roomId: 'test-room',
    participantId: 'system',
    timestamp: new Date(),
    data: {
      code: SignalingErrorCode.ROOM_FULL,
      message: 'Room is full'
    }
  };

  const mockSocket = (client as any).socket as MockWebSocket;
  mockSocket.simulateMessage(JSON.stringify(errorMessage));

  // Wait for message processing
  await new Promise(resolve => setTimeout(resolve, 50));

  assert(errorEventFired, 'Error event should be fired');
  assertEquals(errorCode, SignalingErrorCode.ROOM_FULL);

  await client.disconnect();
});

Deno.test("WebRTC Client - Disconnect cleanup", async () => {
  setupMocks();
  
  const client = new WebRTCClient(testConfig);
  let disconnectedEventFired = false;

  client.on('disconnected', () => {
    disconnectedEventFired = true;
  });

  await client.connect('test-room', 'test-participant', 'Test User');

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 50));

  // Add a participant to create peer connection
  const participantUpdateMessage: SignalingMessage = {
    type: 'participant-update',
    roomId: 'test-room',
    participantId: 'system',
    timestamp: new Date(),
    data: {
      action: 'joined',
      participant: {
        id: 'other-participant',
        name: 'Other User',
        type: 'host',
        joinedAt: new Date()
      }
    }
  };

  const mockSocket = (client as any).socket as MockWebSocket;
  mockSocket.simulateMessage(JSON.stringify(participantUpdateMessage));

  // Wait for participant processing
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify peer connection was created
  let stats = client.getConnectionStats();
  assertEquals(stats.peerConnectionCount, 1);
  assertEquals(stats.isConnected, true);

  // Disconnect
  await client.disconnect();

  // Wait for cleanup
  await new Promise(resolve => setTimeout(resolve, 50));

  assert(disconnectedEventFired, 'Disconnected event should be fired');

  stats = client.getConnectionStats();
  assertEquals(stats.isConnected, false);
  assertEquals(stats.peerConnectionCount, 0);
  assertEquals(stats.localStreamActive, false);
});

Deno.test("WebRTC Client - Connection failure", async () => {
  setupMocks();
  
  // Mock WebSocket that fails to connect
  class FailingMockWebSocket extends MockWebSocket {
    constructor(url: string) {
      super(url);
      setTimeout(() => {
        if (this.onerror) {
          this.onerror(new Event('error'));
        }
      }, 10);
    }
  }

  // @ts-ignore
  globalThis.WebSocket = FailingMockWebSocket;

  const client = new WebRTCClient(testConfig);

  await assertRejects(
    () => client.connect('test-room', 'test-participant', 'Test User'),
    Error,
    'Failed to establish signaling connection'
  );
});

Deno.test("WebRTC Client - Media permission denied", async () => {
  setupMocks();
  
  // Mock getUserMedia that throws permission denied error
  // @ts-ignore
  globalThis.navigator = {
    mediaDevices: {
      getUserMedia: async (): Promise<MediaStream> => {
        const error = new Error('Permission denied');
        error.name = 'NotAllowedError';
        throw error;
      }
    } as unknown as MediaDevices
  };

  const client = new WebRTCClient(testConfig);
  let errorEventFired = false;
  let errorCode: SignalingErrorCode | undefined;

  client.on('error', (error, code) => {
    errorEventFired = true;
    errorCode = code;
  });

  await assertRejects(
    () => client.connect('test-room', 'test-participant', 'Test User'),
    Error,
    'Failed to access media devices'
  );

  assert(errorEventFired, 'Error event should be fired');
  assertEquals(errorCode, SignalingErrorCode.MEDIA_PERMISSION_DENIED);
});