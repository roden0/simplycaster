/**
 * Recording Engine
 * 
 * Handles MediaRecorder-based audio/video recording, chunk buffering in IndexedDB,
 * and recording state management for WebRTC sessions.
 */

import { SignalingErrorCode } from './types.ts';

/**
 * Recording Configuration
 */
export interface RecordingConfig {
  mimeType: string;
  audioBitsPerSecond: number;
  videoBitsPerSecond?: number;
  timeslice: number; // Chunk duration in milliseconds
  maxChunkSize: number; // Maximum chunk size in bytes
  enableVideo: boolean;
  audioChannels: number;
  audioSampleRate: number;
}

/**
 * Recording Chunk
 */
export interface RecordingChunk {
  id: string;
  participantId: string;
  participantName: string;
  timestamp: Date;
  duration: number;
  size: number;
  mimeType: string;
  data: Blob;
  sequenceNumber: number;
}

/**
 * Recording Session
 */
export interface RecordingSession {
  id: string;
  roomId: string;
  participantId: string;
  participantName: string;
  startTime: Date;
  endTime?: Date;
  duration: number;
  totalSize: number;
  chunkCount: number;
  status: 'recording' | 'stopped' | 'processing' | 'completed' | 'failed';
  config: RecordingConfig;
}

/**
 * Recording Engine Events
 */
export interface RecordingEngineEvents {
  'recording-started': (sessionId: string) => void;
  'recording-stopped': (sessionId: string) => void;
  'chunk-available': (chunk: RecordingChunk) => void;
  'recording-error': (error: Error, sessionId?: string) => void;
  'storage-full': (sessionId: string) => void;
  'processing-complete': (sessionId: string, totalSize: number) => void;
}

/**
 * IndexedDB Storage Manager
 */
class RecordingStorageManager {
  private dbName = 'WebRTCRecordings';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create chunks store
        if (!db.objectStoreNames.contains('chunks')) {
          const chunksStore = db.createObjectStore('chunks', { keyPath: 'id' });
          chunksStore.createIndex('participantId', 'participantId', { unique: false });
          chunksStore.createIndex('timestamp', 'timestamp', { unique: false });
          chunksStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: false });
        }

        // Create sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionsStore.createIndex('participantId', 'participantId', { unique: false });
          sessionsStore.createIndex('roomId', 'roomId', { unique: false });
          sessionsStore.createIndex('startTime', 'startTime', { unique: false });
        }
      };
    });
  }

  async storeChunk(chunk: RecordingChunk): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['chunks'], 'readwrite');
      const store = transaction.objectStore('chunks');
      const request = store.add(chunk);

      request.onerror = () => reject(new Error('Failed to store chunk'));
      request.onsuccess = () => resolve();
    });
  }

  async getChunks(participantId: string): Promise<RecordingChunk[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      const index = store.index('participantId');
      const request = index.getAll(participantId);

      request.onerror = () => reject(new Error('Failed to get chunks'));
      request.onsuccess = () => {
        const chunks = request.result.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        resolve(chunks);
      };
    });
  }

  async storeSession(session: RecordingSession): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.put(session);

      request.onerror = () => reject(new Error('Failed to store session'));
      request.onsuccess = () => resolve();
    });
  }

  async getSession(sessionId: string): Promise<RecordingSession | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.get(sessionId);

      request.onerror = () => reject(new Error('Failed to get session'));
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async deleteChunks(participantId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['chunks'], 'readwrite');
      const store = transaction.objectStore('chunks');
      const index = store.index('participantId');
      const request = index.openCursor(participantId);

      request.onerror = () => reject(new Error('Failed to delete chunks'));
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }

  async getStorageUsage(): Promise<{ used: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    return { used: 0, quota: 0 };
  }
}

/**
 * Recording Engine Class
 */
export class RecordingEngine {
  private config: RecordingConfig;
  private eventListeners = new Map<keyof RecordingEngineEvents, Function[]>();
  private activeRecorders = new Map<string, MediaRecorder>();
  private activeSessions = new Map<string, RecordingSession>();
  private storageManager: RecordingStorageManager;
  private sequenceNumbers = new Map<string, number>();

  constructor(config?: Partial<RecordingConfig>) {
    this.config = {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000,
      videoBitsPerSecond: 2500000,
      timeslice: 1000, // 1 second chunks
      maxChunkSize: 1024 * 1024, // 1MB
      enableVideo: false,
      audioChannels: 1,
      audioSampleRate: 48000,
      ...config
    };

    this.storageManager = new RecordingStorageManager();
  }

  /**
   * Initialize the recording engine
   */
  async initialize(): Promise<void> {
    try {
      await this.storageManager.initialize();
      console.log('Recording engine initialized');
    } catch (error) {
      console.error('Failed to initialize recording engine:', error);
      throw error;
    }
  }

  /**
   * Start recording a media stream
   */
  async startRecording(
    stream: MediaStream,
    participantId: string,
    participantName: string,
    roomId: string
  ): Promise<string> {
    try {
      // Check if already recording for this participant
      if (this.activeRecorders.has(participantId)) {
        throw new Error(`Already recording for participant ${participantId}`);
      }

      // Check storage availability
      const storage = await this.storageManager.getStorageUsage();
      const availableSpace = storage.quota - storage.used;
      if (availableSpace < 50 * 1024 * 1024) { // Less than 50MB
        this.emit('storage-full', participantId);
        throw new Error('Insufficient storage space for recording');
      }

      // Create MediaRecorder
      const options: MediaRecorderOptions = {
        mimeType: this.config.mimeType,
        audioBitsPerSecond: this.config.audioBitsPerSecond
      };

      if (this.config.enableVideo && this.config.videoBitsPerSecond) {
        options.videoBitsPerSecond = this.config.videoBitsPerSecond;
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      const sessionId = crypto.randomUUID();

      // Create recording session
      const session: RecordingSession = {
        id: sessionId,
        roomId,
        participantId,
        participantName,
        startTime: new Date(),
        duration: 0,
        totalSize: 0,
        chunkCount: 0,
        status: 'recording',
        config: this.config
      };

      // Setup MediaRecorder event handlers
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          await this.handleDataAvailable(event.data, sessionId, participantId, participantName);
        }
      };

      mediaRecorder.onstop = () => {
        this.handleRecordingStop(sessionId);
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        this.emit('recording-error', new Error('MediaRecorder error'), sessionId);
      };

      // Start recording
      mediaRecorder.start(this.config.timeslice);
      
      // Store session and recorder
      this.activeRecorders.set(participantId, mediaRecorder);
      this.activeSessions.set(sessionId, session);
      this.sequenceNumbers.set(participantId, 0);

      // Store session in IndexedDB
      await this.storageManager.storeSession(session);

      this.emit('recording-started', sessionId);
      console.log(`Started recording for ${participantName} (${participantId})`);

      return sessionId;
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.emit('recording-error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Stop recording for a participant
   */
  async stopRecording(participantId: string): Promise<void> {
    const mediaRecorder = this.activeRecorders.get(participantId);
    if (!mediaRecorder) {
      console.warn(`No active recording found for participant ${participantId}`);
      return;
    }

    try {
      mediaRecorder.stop();
      this.activeRecorders.delete(participantId);
      this.sequenceNumbers.delete(participantId);
      
      console.log(`Stopped recording for participant ${participantId}`);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      this.emit('recording-error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Stop all active recordings
   */
  async stopAllRecordings(): Promise<void> {
    const participantIds = Array.from(this.activeRecorders.keys());
    await Promise.all(participantIds.map(id => this.stopRecording(id)));
  }

  /**
   * Get recording session
   */
  async getRecordingSession(sessionId: string): Promise<RecordingSession | null> {
    return await this.storageManager.getSession(sessionId);
  }

  /**
   * Get all chunks for a participant
   */
  async getRecordingChunks(participantId: string): Promise<RecordingChunk[]> {
    return await this.storageManager.getChunks(participantId);
  }

  /**
   * Process recording chunks into a single blob
   */
  async processRecording(participantId: string): Promise<Blob> {
    try {
      const chunks = await this.storageManager.getChunks(participantId);
      if (chunks.length === 0) {
        throw new Error('No recording chunks found');
      }

      // Combine all chunks into a single blob
      const blobs = chunks.map(chunk => chunk.data);
      const combinedBlob = new Blob(blobs, { type: chunks[0].mimeType });

      console.log(`Processed recording for ${participantId}: ${combinedBlob.size} bytes`);
      return combinedBlob;
    } catch (error) {
      console.error('Failed to process recording:', error);
      throw error;
    }
  }

  /**
   * Clear recording data for a participant
   */
  async clearRecordingData(participantId: string): Promise<void> {
    try {
      await this.storageManager.deleteChunks(participantId);
      console.log(`Cleared recording data for participant ${participantId}`);
    } catch (error) {
      console.error('Failed to clear recording data:', error);
      throw error;
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<{
    used: number;
    quota: number;
    availableSpace: number;
    usagePercentage: number;
  }> {
    const storage = await this.storageManager.getStorageUsage();
    const availableSpace = storage.quota - storage.used;
    const usagePercentage = storage.quota > 0 ? (storage.used / storage.quota) * 100 : 0;

    return {
      used: storage.used,
      quota: storage.quota,
      availableSpace,
      usagePercentage
    };
  }

  /**
   * Get active recording sessions
   */
  getActiveRecordings(): Map<string, RecordingSession> {
    return new Map(this.activeSessions);
  }

  /**
   * Check if recording is supported
   */
  static isRecordingSupported(): boolean {
    return !!(window.MediaRecorder && window.indexedDB);
  }

  /**
   * Get supported MIME types
   */
  static getSupportedMimeTypes(): string[] {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm',
      'video/mp4'
    ];

    return types.filter(type => MediaRecorder.isTypeSupported(type));
  }

  /**
   * Add event listener
   */
  on<K extends keyof RecordingEngineEvents>(event: K, listener: RecordingEngineEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof RecordingEngineEvents>(event: K, listener: RecordingEngineEvents[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit<K extends keyof RecordingEngineEvents>(event: K, ...args: Parameters<RecordingEngineEvents[K]>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in recording engine event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Handle data available from MediaRecorder
   */
  private async handleDataAvailable(
    data: Blob,
    sessionId: string,
    participantId: string,
    participantName: string
  ): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        console.warn(`Session ${sessionId} not found`);
        return;
      }

      // Check chunk size limit
      if (data.size > this.config.maxChunkSize) {
        console.warn(`Chunk size (${data.size}) exceeds limit (${this.config.maxChunkSize})`);
      }

      // Create chunk
      const sequenceNumber = this.sequenceNumbers.get(participantId) || 0;
      const chunk: RecordingChunk = {
        id: crypto.randomUUID(),
        participantId,
        participantName,
        timestamp: new Date(),
        duration: this.config.timeslice,
        size: data.size,
        mimeType: this.config.mimeType,
        data,
        sequenceNumber
      };

      // Update sequence number
      this.sequenceNumbers.set(participantId, sequenceNumber + 1);

      // Update session
      session.totalSize += data.size;
      session.chunkCount += 1;
      session.duration = Date.now() - session.startTime.getTime();

      // Store chunk and update session
      await Promise.all([
        this.storageManager.storeChunk(chunk),
        this.storageManager.storeSession(session)
      ]);

      this.emit('chunk-available', chunk);
    } catch (error) {
      console.error('Error handling data available:', error);
      this.emit('recording-error', error instanceof Error ? error : new Error(String(error)), sessionId);
    }
  }

  /**
   * Handle recording stop
   */
  private async handleRecordingStop(sessionId: string): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        console.warn(`Session ${sessionId} not found`);
        return;
      }

      // Update session
      session.endTime = new Date();
      session.duration = session.endTime.getTime() - session.startTime.getTime();
      session.status = 'stopped';

      // Store updated session
      await this.storageManager.storeSession(session);

      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      this.emit('recording-stopped', sessionId);
      console.log(`Recording stopped for session ${sessionId}`);
    } catch (error) {
      console.error('Error handling recording stop:', error);
      this.emit('recording-error', error instanceof Error ? error : new Error(String(error)), sessionId);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Stop all active recordings
    await this.stopAllRecordings();

    // Clear event listeners
    this.eventListeners.clear();

    console.log('Recording engine cleaned up');
  }
}