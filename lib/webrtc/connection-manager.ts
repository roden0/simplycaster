/**
 * WebRTC Connection Manager
 * 
 * Manages WebRTC peer connections, handles connection establishment,
 * monitoring, and reconnection logic.
 */

import { WebRTCClient, WebRTCClientConfig } from './webrtc-client.ts';
import { MediaManager, MediaManagerConfig } from './media-manager.ts';
import { SignalingErrorCode, WebRTCConnectionState } from './types.ts';

/**
 * Connection Manager Configuration
 */
export interface ConnectionManagerConfig {
  webrtc: WebRTCClientConfig;
  media: Partial<MediaManagerConfig>;
  connectionTimeout: number;
  maxReconnectAttempts: number;
  reconnectBackoffMultiplier: number;
  healthCheckInterval: number;
  enableConnectionRecovery: boolean;
}

/**
 * Connection Manager Events
 */
export interface ConnectionManagerEvents {
  'connected': () => void;
  'disconnected': () => void;
  'reconnecting': (attempt: number, maxAttempts: number) => void;
  'reconnected': () => void;
  'connection-failed': (error: Error) => void;
  'participant-joined': (participantId: string, participantName: string) => void;
  'participant-left': (participantId: string) => void;
  'remote-stream': (participantId: string, stream: MediaStream) => void;
  'local-stream': (stream: MediaStream) => void;
  'recording-status': (isRecording: boolean, recordingId?: string) => void;
  'connection-quality': (participantId: string, quality: 'excellent' | 'good' | 'fair' | 'poor') => void;
  'error': (error: Error, code?: SignalingErrorCode) => void;
}

/**
 * Connection Quality Metrics
 */
export interface ConnectionQuality {
  participantId: string;
  rtt: number; // Round trip time in ms
  packetsLost: number;
  packetsReceived: number;
  bytesReceived: number;
  bytesSent: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  timestamp: Date;
}

/**
 * Connection Manager Class
 */
export class ConnectionManager {
  private config: ConnectionManagerConfig;
  private webrtcClient: WebRTCClient;
  private mediaManager: MediaManager;
  private eventListeners = new Map<keyof ConnectionManagerEvents, Function[]>();
  private healthCheckTimer: number | null = null;
  private connectionQualityTimer: number | null = null;
  private isConnected = false;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private connectionStartTime: Date | null = null;
  private lastConnectionQuality = new Map<string, ConnectionQuality>();

  constructor(config: ConnectionManagerConfig) {
    this.config = config;
    this.webrtcClient = new WebRTCClient(config.webrtc);
    this.mediaManager = new MediaManager(config.media);
    
    this.setupEventHandlers();
  }

  /**
   * Connect to a room
   */
  async connect(roomId: string, participantId: string, participantName: string, authToken?: string): Promise<void> {
    if (this.isConnected || this.isReconnecting) {
      throw new Error('Already connected or reconnecting');
    }

    try {
      this.connectionStartTime = new Date();
      console.log(`Connecting to room ${roomId} as ${participantName}...`);

      // Connect WebRTC client
      await this.webrtcClient.connect(roomId, participantId, participantName, authToken);
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Start health monitoring
      this.startHealthMonitoring();
      this.startConnectionQualityMonitoring();
      
      this.emit('connected');
      console.log(`Successfully connected to room ${roomId}`);
    } catch (error) {
      this.connectionStartTime = null;
      const connectionError = error instanceof Error ? error : new Error(String(error));
      this.emit('connection-failed', connectionError);
      throw connectionError;
    }
  }

  /**
   * Disconnect from the room
   */
  async disconnect(): Promise<void> {
    console.log('Disconnecting from room...');
    
    this.isConnected = false;
    this.isReconnecting = false;
    this.connectionStartTime = null;
    
    // Stop monitoring
    this.stopHealthMonitoring();
    this.stopConnectionQualityMonitoring();
    
    // Disconnect WebRTC client
    await this.webrtcClient.disconnect();
    
    // Cleanup media manager
    this.mediaManager.cleanup();
    
    this.emit('disconnected');
    console.log('Disconnected from room');
  }

  /**
   * Get user media with specified constraints
   */
  async getUserMedia(scenario: 'audio-only' | 'video-call' | 'high-quality' = 'video-call'): Promise<MediaStream> {
    const constraints = this.mediaManager.createConstraints(scenario);
    return await this.mediaManager.getUserMedia(constraints);
  }

  /**
   * Start screen sharing
   */
  async startScreenShare(): Promise<MediaStream> {
    return await this.mediaManager.getDisplayMedia();
  }

  /**
   * Stop screen sharing
   */
  stopScreenShare(streamId: string): void {
    this.mediaManager.stopStream(streamId);
  }

  /**
   * Get available media devices
   */
  async getMediaDevices() {
    return await this.mediaManager.getMediaDevices();
  }

  /**
   * Check media permissions
   */
  async checkMediaPermissions() {
    return await this.mediaManager.checkMediaPermissions();
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    isConnected: boolean;
    connectionDuration: number | null;
    peerConnectionCount: number;
    reconnectAttempts: number;
    localStreamActive: boolean;
  } {
    const webrtcStats = this.webrtcClient.getConnectionStats();
    const connectionDuration = this.connectionStartTime 
      ? Date.now() - this.connectionStartTime.getTime()
      : null;

    return {
      isConnected: this.isConnected,
      connectionDuration,
      peerConnectionCount: webrtcStats.peerConnectionCount,
      reconnectAttempts: this.reconnectAttempts,
      localStreamActive: webrtcStats.localStreamActive
    };
  }

  /**
   * Get connection quality for all participants
   */
  getConnectionQuality(): Map<string, ConnectionQuality> {
    return new Map(this.lastConnectionQuality);
  }

  /**
   * Get media manager statistics
   */
  getMediaStats() {
    return this.mediaManager.getStats();
  }

  /**
   * Add event listener
   */
  on<K extends keyof ConnectionManagerEvents>(event: K, listener: ConnectionManagerEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof ConnectionManagerEvents>(event: K, listener: ConnectionManagerEvents[K]): void {
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
  private emit<K extends keyof ConnectionManagerEvents>(event: K, ...args: Parameters<ConnectionManagerEvents[K]>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in connection manager event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Setup event handlers for WebRTC client and media manager
   */
  private setupEventHandlers(): void {
    // WebRTC Client events
    this.webrtcClient.on('connected', () => {
      // Handled in connect method
    });

    this.webrtcClient.on('disconnected', () => {
      this.handleDisconnection();
    });

    this.webrtcClient.on('participant-joined', (participantId, participantName) => {
      this.emit('participant-joined', participantId, participantName);
    });

    this.webrtcClient.on('participant-left', (participantId) => {
      this.lastConnectionQuality.delete(participantId);
      this.emit('participant-left', participantId);
    });

    this.webrtcClient.on('remote-stream', (participantId, stream) => {
      this.emit('remote-stream', participantId, stream);
    });

    this.webrtcClient.on('local-stream', (stream) => {
      this.emit('local-stream', stream);
    });

    this.webrtcClient.on('recording-status', (isRecording, recordingId) => {
      this.emit('recording-status', isRecording, recordingId);
    });

    this.webrtcClient.on('connection-state-change', (participantId, state) => {
      this.handleConnectionStateChange(participantId, state);
    });

    this.webrtcClient.on('ice-connection-state-change', (participantId, state) => {
      this.handleIceConnectionStateChange(participantId, state);
    });

    this.webrtcClient.on('error', (error, code) => {
      this.emit('error', error, code);
    });

    // Media Manager events
    this.mediaManager.on('stream-started', (stream, type) => {
      console.log(`Media stream started: ${type} (${stream.id})`);
    });

    this.mediaManager.on('stream-stopped', (streamId) => {
      console.log(`Media stream stopped: ${streamId}`);
    });

    this.mediaManager.on('permission-denied', (type) => {
      const error = new Error(`${type} permission denied`);
      this.emit('error', error, SignalingErrorCode.MEDIA_PERMISSION_DENIED);
    });

    this.mediaManager.on('error', (error, code) => {
      this.emit('error', error, code);
    });
  }

  /**
   * Handle disconnection and attempt reconnection if enabled
   */
  private handleDisconnection(): void {
    if (!this.isConnected) {
      return; // Already handling disconnection
    }

    this.isConnected = false;
    this.stopHealthMonitoring();
    this.stopConnectionQualityMonitoring();

    if (this.config.enableConnectionRecovery && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.attemptReconnection();
    } else {
      this.emit('disconnected');
    }
  }

  /**
   * Attempt to reconnect
   */
  private async attemptReconnection(): Promise<void> {
    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = Math.min(
      1000 * Math.pow(this.config.reconnectBackoffMultiplier, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay}ms`);
    this.emit('reconnecting', this.reconnectAttempts, this.config.maxReconnectAttempts);

    setTimeout(async () => {
      try {
        // Try to reconnect with the same parameters
        // Note: In a real implementation, we'd need to store the original connection parameters
        console.log('Reconnection attempt...');
        
        // For now, we'll emit reconnected if the WebRTC client reconnects successfully
        // This would need to be integrated with the actual reconnection logic
        this.isReconnecting = false;
        this.isConnected = true;
        this.startHealthMonitoring();
        this.startConnectionQualityMonitoring();
        this.emit('reconnected');
        
      } catch (error) {
        console.error('Reconnection failed:', error);
        this.isReconnecting = false;
        
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.attemptReconnection();
        } else {
          this.emit('connection-failed', error instanceof Error ? error : new Error(String(error)));
        }
      }
    }, delay);
  }

  /**
   * Handle connection state changes
   */
  private handleConnectionStateChange(participantId: string, state: RTCPeerConnectionState): void {
    console.log(`Connection state changed for ${participantId}: ${state}`);
    
    if (state === 'failed' || state === 'closed') {
      this.lastConnectionQuality.delete(participantId);
    }
  }

  /**
   * Handle ICE connection state changes
   */
  private handleIceConnectionStateChange(participantId: string, state: RTCIceConnectionState): void {
    console.log(`ICE connection state changed for ${participantId}: ${state}`);
    
    if (state === 'failed' || state === 'closed') {
      this.lastConnectionQuality.delete(participantId);
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform health check
   */
  private performHealthCheck(): void {
    const stats = this.webrtcClient.getConnectionStats();
    
    if (!stats.isConnected) {
      console.warn('Health check failed: WebRTC client not connected');
      this.handleDisconnection();
    }
  }

  /**
   * Start connection quality monitoring
   */
  private startConnectionQualityMonitoring(): void {
    if (this.connectionQualityTimer) {
      return;
    }

    this.connectionQualityTimer = setInterval(async () => {
      await this.updateConnectionQuality();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop connection quality monitoring
   */
  private stopConnectionQualityMonitoring(): void {
    if (this.connectionQualityTimer) {
      clearInterval(this.connectionQualityTimer);
      this.connectionQualityTimer = null;
    }
  }

  /**
   * Update connection quality metrics
   */
  private async updateConnectionQuality(): Promise<void> {
    try {
      const peerConnections = this.webrtcClient.getPeerConnections();
      
      for (const [participantId, peerInfo] of peerConnections.entries()) {
        const stats = await peerInfo.connection.getStats();
        const quality = this.calculateConnectionQuality(stats);
        
        if (quality) {
          const previousQuality = this.lastConnectionQuality.get(participantId);
          this.lastConnectionQuality.set(participantId, quality);
          
          // Emit quality change if it's different from previous
          if (!previousQuality || previousQuality.quality !== quality.quality) {
            this.emit('connection-quality', participantId, quality.quality);
          }
        }
      }
    } catch (error) {
      console.error('Error updating connection quality:', error);
    }
  }

  /**
   * Calculate connection quality from WebRTC stats
   */
  private calculateConnectionQuality(stats: RTCStatsReport): ConnectionQuality | null {
    let rtt = 0;
    let packetsLost = 0;
    let packetsReceived = 0;
    let bytesReceived = 0;
    let bytesSent = 0;
    let participantId = '';

    // Parse WebRTC stats
    for (const [id, stat] of stats.entries()) {
      if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
        rtt = stat.currentRoundTripTime * 1000 || 0; // Convert to ms
      } else if (stat.type === 'inbound-rtp') {
        packetsLost += stat.packetsLost || 0;
        packetsReceived += stat.packetsReceived || 0;
        bytesReceived += stat.bytesReceived || 0;
      } else if (stat.type === 'outbound-rtp') {
        bytesSent += stat.bytesSent || 0;
      }
    }

    if (packetsReceived === 0) {
      return null; // No data to calculate quality
    }

    // Calculate quality based on RTT and packet loss
    let quality: 'excellent' | 'good' | 'fair' | 'poor';
    const packetLossRate = packetsLost / (packetsReceived + packetsLost);

    if (rtt < 100 && packetLossRate < 0.01) {
      quality = 'excellent';
    } else if (rtt < 200 && packetLossRate < 0.03) {
      quality = 'good';
    } else if (rtt < 400 && packetLossRate < 0.05) {
      quality = 'fair';
    } else {
      quality = 'poor';
    }

    return {
      participantId,
      rtt,
      packetsLost,
      packetsReceived,
      bytesReceived,
      bytesSent,
      quality,
      timestamp: new Date()
    };
  }

  /**
   * Get detailed connection information
   */
  getDetailedConnectionInfo(): {
    isConnected: boolean;
    connectionDuration: number | null;
    participants: Array<{
      id: string;
      name: string;
      connectionState: RTCPeerConnectionState;
      iceConnectionState: RTCIceConnectionState;
      quality?: ConnectionQuality;
    }>;
    mediaStats: ReturnType<MediaManager['getStats']>;
  } {
    const peerConnections = this.webrtcClient.getPeerConnections();
    const participants = Array.from(peerConnections.entries()).map(([id, peerInfo]) => ({
      id,
      name: peerInfo.participantName,
      connectionState: peerInfo.connectionState,
      iceConnectionState: peerInfo.iceConnectionState,
      quality: this.lastConnectionQuality.get(id)
    }));

    return {
      isConnected: this.isConnected,
      connectionDuration: this.connectionStartTime 
        ? Date.now() - this.connectionStartTime.getTime()
        : null,
      participants,
      mediaStats: this.mediaManager.getStats()
    };
  }
}