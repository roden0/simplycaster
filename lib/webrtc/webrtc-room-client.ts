/**\n * WebRTC Room Client\n * \n * High-level client that combines WebRTC signaling, media management,\n * and recording functionality for SimplyCaster rooms.\n */\n\nimport { WebRTCClient, WebRTCClientConfig, WebRTCClientEvents } from './webrtc-client.ts';\nimport { MediaManager, MediaManagerEvents, MediaManagerConfig } from './media-manager.ts';\nimport { MediaStreamManager, MediaStreamManagerEvents } from './media-stream-manager.ts';\nimport { MediaConstraints, WebRTCConnectionState } from './types.ts';\n\n/**\n * Room Client Configuration\n */\nexport interface WebRTCRoomClientConfig {\n  // Room information\n  roomId: string;\n  participantName: string;\n  participantType: 'host' | 'guest';\n  token?: string;\n  \n  // Connection settings\n  signalingUrl?: string;\n  autoConnect?: boolean;\n  autoStartMedia?: boolean;\n  \n  // Media settings\n  mediaConstraints?: MediaConstraints;\n  mediaManagerConfig?: Partial<MediaManagerConfig>;\n  \n  // WebRTC settings\n  webrtcConfig?: RTCConfiguration;\n}\n\n/**\n * Room Client Events\n */\nexport interface WebRTCRoomClientEvents {\n  // Connection events\n  'connected': () => void;\n  'disconnected': (reason: string) => void;\n  'reconnecting': (attempt: number) => void;\n  \n  // Participant events\n  'participant-joined': (participant: any) => void;\n  'participant-left': (participant: any) => void;\n  'participants-updated': (participants: any[]) => void;\n  \n  // Media events\n  'local-stream-started': (stream: MediaStream, type: 'audio' | 'video' | 'screen') => void;\n  'local-stream-stopped': (streamId: string, type: 'audio' | 'video' | 'screen') => void;\n  'remote-stream-added': (stream: MediaStream, participantId: string) => void;\n  'remote-stream-removed': (streamId: string, participantId: string) => void;\n  \n  // Recording events\n  'recording-started': (data: any) => void;\n  'recording-stopped': (data: any) => void;\n  'recording-status-changed': (isRecording: boolean, data: any) => void;\n  \n  // Error events\n  'error': (error: Error, context?: string) => void;\n  'media-permission-denied': (type: 'audio' | 'video' | 'screen') => void;\n  'connection-failed': (participantId: string, error: Error) => void;\n}\n\n/**\n * Participant Information\n */\nexport interface ParticipantInfo {\n  id: string;\n  name: string;\n  type: 'host' | 'guest';\n  isConnected: boolean;\n  hasAudio: boolean;\n  hasVideo: boolean;\n  connectionState: RTCPeerConnectionState;\n  joinedAt: Date;\n}\n\n/**\n * WebRTC Room Client Class\n */\nexport class WebRTCRoomClient {\n  private config: WebRTCRoomClientConfig;\n  private webrtcClient: WebRTCClient | null = null;\n  private mediaManager: MediaManager;\n  private mediaStreamManager: MediaStreamManager;\n  private eventListeners = new Map<keyof WebRTCRoomClientEvents, Function[]>();\n  \n  // State management\n  private isConnected = false;\n  private isMediaStarted = false;\n  private participants = new Map<string, ParticipantInfo>();\n  private localStreams = new Map<string, MediaStream>();\n  private remoteStreams = new Map<string, { stream: MediaStream; participantId: string }>();\n  \n  // Recording state\n  private isRecording = false;\n  private recordingStartTime: Date | null = null;\n\n  constructor(config: WebRTCRoomClientConfig) {\n    this.config = {\n      signalingUrl: this.buildSignalingUrl(),\n      autoConnect: true,\n      autoStartMedia: false,\n      mediaConstraints: {\n        audio: true,\n        video: false\n      },\n      ...config\n    };\n\n    // Initialize media managers\n    this.mediaManager = new MediaManager(this.config.mediaManagerConfig);\n    this.mediaStreamManager = new MediaStreamManager();\n    \n    this.setupEventListeners();\n    \n    if (this.config.autoConnect) {\n      this.connect();\n    }\n  }\n\n  /**\n   * Build signaling WebSocket URL\n   */\n  private buildSignalingUrl(): string {\n    if (this.config.signalingUrl) {\n      return this.config.signalingUrl;\n    }\n    \n    // Build URL based on current location\n    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';\n    const host = window.location.host;\n    return `${protocol}//${host}/api/signaling/ws`;\n  }\n\n  /**\n   * Setup event listeners for internal components\n   */\n  private setupEventListeners(): void {\n    // Media Manager events\n    this.mediaManager.on('stream-started', (stream, type) => {\n      this.localStreams.set(stream.id, stream);\n      this.emit('local-stream-started', stream, type);\n      \n      // Add stream to WebRTC client if connected\n      if (this.webrtcClient) {\n        this.addStreamToAllPeerConnections(stream);\n      }\n    });\n    \n    this.mediaManager.on('stream-stopped', (streamId) => {\n      const stream = this.localStreams.get(streamId);\n      if (stream) {\n        const tracks = stream.getTracks();\n        const type = tracks.some(t => t.kind === 'video') ? \n          (tracks.some(t => t.kind === 'audio') ? 'video' : 'video') : 'audio';\n        \n        this.localStreams.delete(streamId);\n        this.emit('local-stream-stopped', streamId, type as 'audio' | 'video' | 'screen');\n        \n        // Remove stream from WebRTC client\n        if (this.webrtcClient) {\n          this.removeStreamFromAllPeerConnections(stream);\n        }\n      }\n    });\n    \n    this.mediaManager.on('permission-denied', (type) => {\n      this.emit('media-permission-denied', type);\n    });\n    \n    this.mediaManager.on('error', (error) => {\n      this.emit('error', error, 'media-manager');\n    });\n  }\n}"  /**
   * 
Connect to the room
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      console.warn('Already connected to room');
      return;
    }

    try {
      // Create WebRTC client configuration
      const clientConfig: WebRTCClientConfig = {
        signalingUrl: this.config.signalingUrl!,
        roomId: this.config.roomId,
        participantId: this.generateParticipantId(),
        participantName: this.config.participantName,
        participantType: this.config.participantType,
        token: this.config.token,
        webrtcConfig: this.config.webrtcConfig,
        mediaConstraints: this.config.mediaConstraints,
        autoConnect: false // We'll connect manually
      };

      // Create and setup WebRTC client
      this.webrtcClient = new WebRTCClient(clientConfig);
      this.setupWebRTCClientEvents();
      
      // Connect to signaling server
      await this.webrtcClient.connect();
      
    } catch (error) {
      console.error('Failed to connect to room:', error);
      this.emit('error', error as Error, 'connection');
      throw error;
    }
  }

  /**
   * Disconnect from the room
   */
  async disconnect(): Promise<void> {
    console.log('Disconnecting from room...');
    
    // Stop all media streams
    await this.stopAllMedia();
    
    // Disconnect WebRTC client
    if (this.webrtcClient) {
      this.webrtcClient.disconnect();
      this.webrtcClient = null;
    }
    
    // Clear state
    this.isConnected = false;
    this.isMediaStarted = false;
    this.participants.clear();
    this.localStreams.clear();
    this.remoteStreams.clear();
    
    this.emit('disconnected', 'User disconnected');
  }

  /**
   * Start audio stream
   */
  async startAudio(constraints?: MediaTrackConstraints): Promise<MediaStream> {
    try {
      const audioConstraints = {
        audio: constraints || this.config.mediaConstraints?.audio || true,
        video: false
      };
      
      const stream = await this.mediaManager.getUserMedia(audioConstraints);
      this.isMediaStarted = true;
      
      return stream;
    } catch (error) {
      console.error('Failed to start audio:', error);
      this.emit('error', error as Error, 'audio-start');
      throw error;
    }
  }

  /**
   * Stop all media streams
   */
  async stopAllMedia(): Promise<void> {
    const streamIds = Array.from(this.localStreams.keys());
    for (const streamId of streamIds) {
      await this.stopMedia(streamId);
    }
    
    this.mediaManager.stopAllStreams();
    this.isMediaStarted = false;
  }

  /**
   * Stop specific media stream
   */
  async stopMedia(streamId: string): Promise<void> {
    const stream = this.localStreams.get(streamId);
    if (stream) {
      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
      
      // Remove from WebRTC connections
      if (this.webrtcClient) {
        this.removeStreamFromAllPeerConnections(stream);
      }
      
      // Clean up
      this.mediaManager.stopStream(streamId);
    }
  }

  /**
   * Get room statistics
   */
  getRoomStats(): {
    isConnected: boolean;
    isMediaStarted: boolean;
    participantCount: number;
    localStreamCount: number;
    remoteStreamCount: number;
    isRecording: boolean;
    recordingDuration?: number;
  } {
    return {
      isConnected: this.isConnected,
      isMediaStarted: this.isMediaStarted,
      participantCount: this.participants.size,
      localStreamCount: this.localStreams.size,
      remoteStreamCount: this.remoteStreams.size,
      isRecording: this.isRecording,
      recordingDuration: this.recordingStartTime ? 
        Date.now() - this.recordingStartTime.getTime() : undefined
    };
  }

  /**
   * Get participants list
   */
  getParticipants(): ParticipantInfo[] {
    return Array.from(this.participants.values());
  }

  /**
   * Add event listener
   */
  on<K extends keyof WebRTCRoomClientEvents>(event: K, listener: WebRTCRoomClientEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof WebRTCRoomClientEvents>(event: K, listener: WebRTCRoomClientEvents[K]): void {
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
  private emit<K extends keyof WebRTCRoomClientEvents>(event: K, ...args: Parameters<WebRTCRoomClientEvents[K]>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in room client event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Setup WebRTC client event listeners
   */
  private setupWebRTCClientEvents(): void {
    if (!this.webrtcClient) return;

    this.webrtcClient.on('connected', () => {
      this.isConnected = true;
      this.emit('connected');
      
      // Auto-start media if configured
      if (this.config.autoStartMedia) {
        this.startAudio().catch(error => {
          console.warn('Failed to auto-start audio:', error);
        });
      }
    });

    this.webrtcClient.on('disconnected', (reason) => {
      this.isConnected = false;
      this.emit('disconnected', reason);
    });

    this.webrtcClient.on('participant-joined', (participant) => {
      const participantInfo: ParticipantInfo = {
        id: participant.id,
        name: participant.name,
        type: participant.type,
        isConnected: true,
        hasAudio: false,
        hasVideo: false,
        connectionState: 'new',
        joinedAt: new Date(participant.joinedAt)
      };
      
      this.participants.set(participant.id, participantInfo);
      this.emit('participant-joined', participant);
      this.emit('participants-updated', this.getParticipants());
    });

    this.webrtcClient.on('participant-left', (participant) => {
      this.participants.delete(participant.id);
      this.emit('participant-left', participant);
      this.emit('participants-updated', this.getParticipants());
    });

    this.webrtcClient.on('remote-stream', (stream, participantId) => {
      this.remoteStreams.set(stream.id, { stream, participantId });
      this.emit('remote-stream-added', stream, participantId);
    });

    this.webrtcClient.on('error', (error) => {
      this.emit('error', error, 'webrtc-client');
    });
  }

  /**
   * Add stream to all peer connections
   */
  private addStreamToAllPeerConnections(stream: MediaStream): void {
    if (!this.webrtcClient) return;
    
    const peerConnections = this.webrtcClient.getAllPeerConnections();
    peerConnections.forEach((peerConnection) => {
      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });
    });
  }

  /**
   * Remove stream from all peer connections
   */
  private removeStreamFromAllPeerConnections(stream: MediaStream): void {
    if (!this.webrtcClient) return;
    
    const peerConnections = this.webrtcClient.getAllPeerConnections();
    peerConnections.forEach((peerConnection) => {
      const senders = peerConnection.getSenders();
      senders.forEach(sender => {
        if (sender.track && stream.getTracks().includes(sender.track)) {
          peerConnection.removeTrack(sender);
        }
      });
    });
  }

  /**
   * Generate unique participant ID
   */
  private generateParticipantId(): string {
    return `${this.config.participantType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    console.log('Cleaning up WebRTC room client...');
    
    // Disconnect if connected
    if (this.isConnected) {
      this.disconnect();
    }
    
    // Cleanup media managers
    this.mediaManager.cleanup();
    this.mediaStreamManager.cleanup();
    
    // Clear event listeners
    this.eventListeners.clear();
  }
}