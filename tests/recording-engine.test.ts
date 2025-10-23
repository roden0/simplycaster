/**
 * Recording Engine Unit Tests
 * 
 * Tests for the recording engine including MediaRecorder integration,
 * IndexedDB storage, and recording session management.
 */

import { assertEquals, assertExists, assert, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { RecordingEngine, RecordingConfig, RecordingChunk, RecordingSession } from "../lib/webrtc/recording-engine.ts";

// Mock MediaRecorder
class MockMediaRecorder {
  static isTypeSupported(mimeType: string): boolean {
    const supportedTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    return supportedTypes.includes(mimeType);
  }

  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  stream: MediaStream;
  
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstart: (() => void) | null = null;

  private chunks: Blob[] = [];
  private timeslice: number = 1000;
  private intervalId: number | null = null;

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    this.stream = stream;
    this.mimeType = options?.mimeType || 'audio/webm;codecs=opus';
  }

  start(timeslice?: number): void {
    if (this.state !== 'inactive') {
      throw new Error('MediaRecorder is not inactive');
    }
    
    this.state = 'recording';
    this.timeslice = timeslice || 1000;
    
    if (this.onstart) {
      this.onstart();
    }

    // Simulate data available events
    this.intervalId = setInterval(() => {
      if (this.state === 'recording' && this.ondataavailable) {
        const mockBlob = new Blob(['mock-audio-data'], { type: this.mimeType });
        this.ondataavailable({ data: mockBlob } as BlobEvent);
      }
    }, this.timeslice);
  }

  stop(): void {
    if (this.state === 'inactive') {
      return;
    }

    this.state = 'inactive';
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.onstop) {
      this.onstop();
    }
  }

  pause(): void {
    if (this.state === 'recording') {
      this.state = 'paused';
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'recording';
    }
  }

  requestData(): void {
    if (this.ondataavailable) {
      const mockBlob = new Blob(['mock-audio-data'], { type: this.mimeType });
      this.ondataavailable({ data: mockBlob } as BlobEvent);
    }
  }
}

// Mock MediaStream
class MockMediaStream {
  id = 'mock-stream-id';
  active = true;
  private tracks: MediaStreamTrack[] = [];

  constructor() {
    // Add a mock audio track
    this.tracks.push(new MockMediaStreamTrack('audio'));
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter(track => track.kind === 'audio');
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter(track => track.kind === 'video');
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

// Mock IndexedDB
class MockIDBDatabase {
  name: string;
  version: number;
  objectStoreNames: string[] = ['chunks', 'sessions'];

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
  }

  transaction(storeNames: string[], mode: IDBTransactionMode = 'readonly'): MockIDBTransaction {
    return new MockIDBTransaction(storeNames, mode);
  }

  close(): void {
    // Mock implementation
  }
}

class MockIDBTransaction {
  mode: IDBTransactionMode;
  objectStoreNames: string[];
  
  oncomplete: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(storeNames: string[], mode: IDBTransactionMode) {
    this.objectStoreNames = storeNames;
    this.mode = mode;
  }

  objectStore(name: string): MockIDBObjectStore {
    return new MockIDBObjectStore(name);
  }
}

class MockIDBObjectStore {
  name: string;
  private storage = new Map<string, any>();

  constructor(name: string) {
    this.name = name;
  }

  add(value: any): MockIDBRequest {
    const key = value.id || crypto.randomUUID();
    this.storage.set(key, value);
    return new MockIDBRequest(key);
  }

  put(value: any): MockIDBRequest {
    const key = value.id || crypto.randomUUID();
    this.storage.set(key, value);
    return new MockIDBRequest(key);
  }

  get(key: string): MockIDBRequest {
    const value = this.storage.get(key);
    return new MockIDBRequest(value);
  }

  getAll(query?: any): MockIDBRequest {
    const values = Array.from(this.storage.values());
    return new MockIDBRequest(values);
  }

  delete(key: string): MockIDBRequest {
    this.storage.delete(key);
    return new MockIDBRequest(undefined);
  }

  index(name: string): MockIDBIndex {
    return new MockIDBIndex(name, this.storage);
  }

  createIndex(name: string, keyPath: string, options?: IDBIndexParameters): MockIDBIndex {
    return new MockIDBIndex(name, this.storage);
  }
}

class MockIDBIndex {
  name: string;
  private storage: Map<string, any>;

  constructor(name: string, storage: Map<string, any>) {
    this.name = name;
    this.storage = storage;
  }

  get(key: any): MockIDBRequest {
    // Simple mock implementation
    const values = Array.from(this.storage.values());
    const found = values.find(v => v[this.name] === key);
    return new MockIDBRequest(found);
  }

  getAll(query?: any): MockIDBRequest {
    if (query) {
      const values = Array.from(this.storage.values());
      const filtered = values.filter(v => v[this.name] === query);
      return new MockIDBRequest(filtered);
    }
    return new MockIDBRequest(Array.from(this.storage.values()));
  }

  openCursor(query?: any): MockIDBRequest {
    // Simple cursor implementation
    const values = Array.from(this.storage.values());
    const filtered = query ? values.filter(v => v[this.name] === query) : values;
    return new MockIDBRequest(filtered.length > 0 ? new MockIDBCursor(filtered) : null);
  }
}

class MockIDBCursor {
  private values: any[];
  private index = 0;

  constructor(values: any[]) {
    this.values = values;
  }

  get value(): any {
    return this.values[this.index];
  }

  continue(): void {
    this.index++;
  }

  delete(): MockIDBRequest {
    return new MockIDBRequest(undefined);
  }
}

class MockIDBRequest {
  result: any;
  error: Error | null = null;
  readyState: 'pending' | 'done' = 'done';
  
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(result: any) {
    this.result = result;
    
    // Simulate async behavior
    setTimeout(() => {
      if (this.onsuccess) {
        this.onsuccess(new Event('success'));
      }
    }, 0);
  }
}

class MockIDBOpenDBRequest extends MockIDBRequest {
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null = null;

  constructor(db: MockIDBDatabase, needsUpgrade: boolean = false) {
    super(db);
    
    if (needsUpgrade) {
      setTimeout(() => {
        if (this.onupgradeneeded) {
          this.onupgradeneeded({
            target: this,
            oldVersion: 0,
            newVersion: 1
          } as IDBVersionChangeEvent);
        }
      }, 0);
    }
  }
}

// Mock navigator.storage
const mockStorage = {
  estimate: async (): Promise<StorageEstimate> => ({
    usage: 1024 * 1024, // 1MB used
    quota: 100 * 1024 * 1024 // 100MB quota
  })
};

// Setup global mocks
function setupMocks() {
  // @ts-ignore
  globalThis.MediaRecorder = MockMediaRecorder;
  // @ts-ignore
  globalThis.MediaStream = MockMediaStream;
  
  // Mock IndexedDB
  // @ts-ignore
  globalThis.indexedDB = {
    open: (name: string, version?: number): MockIDBOpenDBRequest => {
      const db = new MockIDBDatabase(name, version || 1);
      return new MockIDBOpenDBRequest(db, version === 1);
    }
  };

  // Mock navigator.storage
  // @ts-ignore
  globalThis.navigator = {
    storage: mockStorage
  };

  // Mock crypto.randomUUID
  if (!globalThis.crypto) {
    // @ts-ignore
    globalThis.crypto = {
      randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)
    };
  }
}

// Test configuration
const testConfig: Partial<RecordingConfig> = {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 128000,
  timeslice: 100, // Short timeslice for faster tests
  maxChunkSize: 1024 * 1024,
  enableVideo: false,
  audioChannels: 1,
  audioSampleRate: 48000
};

Deno.test("RecordingEngine - Constructor and initialization", async () => {
  setupMocks();
  
  const engine = new RecordingEngine(testConfig);
  assertExists(engine);
  
  await engine.initialize();
  
  const stats = await engine.getStorageStats();
  assertExists(stats);
  assertEquals(stats.used, 1024 * 1024);
  assertEquals(stats.quota, 100 * 1024 * 1024);
});

Deno.test("RecordingEngine - Check recording support", () => {
  setupMocks();
  
  const isSupported = RecordingEngine.isRecordingSupported();
  assert(isSupported, 'Recording should be supported with mocks');
});

Deno.test("RecordingEngine - Get supported MIME types", () => {
  setupMocks();
  
  const supportedTypes = RecordingEngine.getSupportedMimeTypes();
  assert(supportedTypes.length > 0, 'Should have supported MIME types');
  assert(supportedTypes.includes('audio/webm;codecs=opus'), 'Should support opus codec');
});

Deno.test("RecordingEngine - Start recording", async () => {
  setupMocks();
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  let recordingStartedEventFired = false;
  let chunkAvailableEventFired = false;
  
  engine.on('recording-started', (sessionId) => {
    recordingStartedEventFired = true;
    assertExists(sessionId);
  });
  
  engine.on('chunk-available', (chunk) => {
    chunkAvailableEventFired = true;
    assertExists(chunk);
    assertEquals(chunk.participantId, 'test-participant');
    assertEquals(chunk.participantName, 'Test User');
  });
  
  const stream = new MockMediaStream() as unknown as MediaStream;
  const sessionId = await engine.startRecording(stream, 'test-participant', 'Test User', 'test-room');
  
  assertExists(sessionId);
  assert(recordingStartedEventFired, 'Recording started event should be fired');
  
  // Wait for chunks to be generated
  await new Promise(resolve => setTimeout(resolve, 150));
  
  assert(chunkAvailableEventFired, 'Chunk available event should be fired');
  
  const activeRecordings = engine.getActiveRecordings();
  assertEquals(activeRecordings.size, 1);
  
  const session = activeRecordings.get(sessionId);
  assertExists(session);
  assertEquals(session.participantId, 'test-participant');
  assertEquals(session.status, 'recording');
  
  await engine.stopRecording('test-participant');
});

Deno.test("RecordingEngine - Stop recording", async () => {
  setupMocks();
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  let recordingStoppedEventFired = false;
  
  engine.on('recording-stopped', (sessionId) => {
    recordingStoppedEventFired = true;
    assertExists(sessionId);
  });
  
  const stream = new MockMediaStream() as unknown as MediaStream;
  const sessionId = await engine.startRecording(stream, 'test-participant', 'Test User', 'test-room');
  
  // Wait a bit for recording to start
  await new Promise(resolve => setTimeout(resolve, 50));
  
  await engine.stopRecording('test-participant');
  
  // Wait for stop event
  await new Promise(resolve => setTimeout(resolve, 50));
  
  assert(recordingStoppedEventFired, 'Recording stopped event should be fired');
  
  const activeRecordings = engine.getActiveRecordings();
  assertEquals(activeRecordings.size, 0);
});

Deno.test("RecordingEngine - Process recording chunks", async () => {
  setupMocks();
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  const stream = new MockMediaStream() as unknown as MediaStream;
  await engine.startRecording(stream, 'test-participant', 'Test User', 'test-room');
  
  // Wait for chunks to be generated
  await new Promise(resolve => setTimeout(resolve, 200));
  
  await engine.stopRecording('test-participant');
  
  // Wait for recording to stop
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Process the recording
  const processedBlob = await engine.processRecording('test-participant');
  
  assertExists(processedBlob);
  assert(processedBlob.size > 0, 'Processed blob should have content');
  assertEquals(processedBlob.type, 'audio/webm;codecs=opus');
});

Deno.test("RecordingEngine - Get recording chunks", async () => {
  setupMocks();
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  const stream = new MockMediaStream() as unknown as MediaStream;
  await engine.startRecording(stream, 'test-participant', 'Test User', 'test-room');
  
  // Wait for chunks to be generated
  await new Promise(resolve => setTimeout(resolve, 200));
  
  await engine.stopRecording('test-participant');
  
  // Wait for recording to stop
  await new Promise(resolve => setTimeout(resolve, 50));
  
  const chunks = await engine.getRecordingChunks('test-participant');
  
  assert(chunks.length > 0, 'Should have recording chunks');
  
  const firstChunk = chunks[0];
  assertEquals(firstChunk.participantId, 'test-participant');
  assertEquals(firstChunk.participantName, 'Test User');
  assertEquals(firstChunk.mimeType, 'audio/webm;codecs=opus');
  assertExists(firstChunk.data);
  assert(firstChunk.size > 0);
});

Deno.test("RecordingEngine - Clear recording data", async () => {
  setupMocks();
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  const stream = new MockMediaStream() as unknown as MediaStream;
  await engine.startRecording(stream, 'test-participant', 'Test User', 'test-room');
  
  // Wait for chunks to be generated
  await new Promise(resolve => setTimeout(resolve, 150));
  
  await engine.stopRecording('test-participant');
  
  // Wait for recording to stop
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Verify chunks exist
  let chunks = await engine.getRecordingChunks('test-participant');
  assert(chunks.length > 0, 'Should have chunks before clearing');
  
  // Clear recording data
  await engine.clearRecordingData('test-participant');
  
  // Verify chunks are cleared
  chunks = await engine.getRecordingChunks('test-participant');
  assertEquals(chunks.length, 0, 'Should have no chunks after clearing');
});

Deno.test("RecordingEngine - Handle storage full scenario", async () => {
  setupMocks();
  
  // Mock storage with very low quota
  // @ts-ignore
  globalThis.navigator = {
    storage: {
      estimate: async (): Promise<StorageEstimate> => ({
        usage: 99 * 1024 * 1024, // 99MB used
        quota: 100 * 1024 * 1024 // 100MB quota (only 1MB available)
      })
    }
  };
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  let storageFullEventFired = false;
  
  engine.on('storage-full', (sessionId) => {
    storageFullEventFired = true;
    assertEquals(sessionId, 'test-participant');
  });
  
  const stream = new MockMediaStream() as unknown as MediaStream;
  
  await assertRejects(
    () => engine.startRecording(stream, 'test-participant', 'Test User', 'test-room'),
    Error,
    'Insufficient storage space for recording'
  );
  
  assert(storageFullEventFired, 'Storage full event should be fired');
});

Deno.test("RecordingEngine - Handle duplicate recording attempt", async () => {
  setupMocks();
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  const stream = new MockMediaStream() as unknown as MediaStream;
  await engine.startRecording(stream, 'test-participant', 'Test User', 'test-room');
  
  // Try to start recording for the same participant again
  await assertRejects(
    () => engine.startRecording(stream, 'test-participant', 'Test User', 'test-room'),
    Error,
    'Already recording for participant test-participant'
  );
  
  await engine.stopRecording('test-participant');
});

Deno.test("RecordingEngine - Stop all recordings", async () => {
  setupMocks();
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  const stream1 = new MockMediaStream() as unknown as MediaStream;
  const stream2 = new MockMediaStream() as unknown as MediaStream;
  
  await engine.startRecording(stream1, 'participant-1', 'User 1', 'test-room');
  await engine.startRecording(stream2, 'participant-2', 'User 2', 'test-room');
  
  let activeRecordings = engine.getActiveRecordings();
  assertEquals(activeRecordings.size, 2);
  
  await engine.stopAllRecordings();
  
  // Wait for all recordings to stop
  await new Promise(resolve => setTimeout(resolve, 100));
  
  activeRecordings = engine.getActiveRecordings();
  assertEquals(activeRecordings.size, 0);
});

Deno.test("RecordingEngine - Get storage statistics", async () => {
  setupMocks();
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  const stats = await engine.getStorageStats();
  
  assertExists(stats);
  assertEquals(stats.used, 1024 * 1024);
  assertEquals(stats.quota, 100 * 1024 * 1024);
  assertEquals(stats.availableSpace, 99 * 1024 * 1024);
  assertEquals(stats.usagePercentage, 1);
});

Deno.test("RecordingEngine - Event listener management", async () => {
  setupMocks();
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  let eventCount = 0;
  
  const listener1 = () => { eventCount++; };
  const listener2 = () => { eventCount++; };
  
  // Add listeners
  engine.on('recording-started', listener1);
  engine.on('recording-started', listener2);
  
  const stream = new MockMediaStream() as unknown as MediaStream;
  await engine.startRecording(stream, 'test-participant', 'Test User', 'test-room');
  
  // Wait for event
  await new Promise(resolve => setTimeout(resolve, 50));
  
  assertEquals(eventCount, 2, 'Both listeners should be called');
  
  // Remove one listener
  engine.off('recording-started', listener1);
  
  await engine.stopRecording('test-participant');
  
  // Start recording again
  eventCount = 0;
  await engine.startRecording(stream, 'test-participant', 'Test User', 'test-room');
  
  // Wait for event
  await new Promise(resolve => setTimeout(resolve, 50));
  
  assertEquals(eventCount, 1, 'Only remaining listener should be called');
  
  await engine.stopRecording('test-participant');
});

Deno.test("RecordingEngine - Cleanup resources", async () => {
  setupMocks();
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  const stream1 = new MockMediaStream() as unknown as MediaStream;
  const stream2 = new MockMediaStream() as unknown as MediaStream;
  
  await engine.startRecording(stream1, 'participant-1', 'User 1', 'test-room');
  await engine.startRecording(stream2, 'participant-2', 'User 2', 'test-room');
  
  let activeRecordings = engine.getActiveRecordings();
  assertEquals(activeRecordings.size, 2);
  
  await engine.cleanup();
  
  // Wait for cleanup
  await new Promise(resolve => setTimeout(resolve, 100));
  
  activeRecordings = engine.getActiveRecordings();
  assertEquals(activeRecordings.size, 0);
});

Deno.test("RecordingEngine - Handle MediaRecorder errors", async () => {
  setupMocks();
  
  // Mock MediaRecorder that throws errors
  class ErrorMediaRecorder extends MockMediaRecorder {
    start(timeslice?: number): void {
      super.start(timeslice);
      
      // Simulate error after starting
      setTimeout(() => {
        if (this.onerror) {
          this.onerror(new Event('error'));
        }
      }, 50);
    }
  }
  
  // @ts-ignore
  globalThis.MediaRecorder = ErrorMediaRecorder;
  
  const engine = new RecordingEngine(testConfig);
  await engine.initialize();
  
  let errorEventFired = false;
  
  engine.on('recording-error', (error, sessionId) => {
    errorEventFired = true;
    assertExists(error);
  });
  
  const stream = new MockMediaStream() as unknown as MediaStream;
  await engine.startRecording(stream, 'test-participant', 'Test User', 'test-room');
  
  // Wait for error
  await new Promise(resolve => setTimeout(resolve, 100));
  
  assert(errorEventFired, 'Recording error event should be fired');
  
  await engine.stopRecording('test-participant');
});