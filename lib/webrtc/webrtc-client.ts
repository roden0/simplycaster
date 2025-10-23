/**
 * WebRTC Client Core Module
 * 
 * Manages RTCPeerConnection instances, signaling WebSocket connections,
 * and peer connection state management for client-side WebRTC functionality.
 */

import {
  SignalingMessage,
  SignalingErrorCode,
  WebRTCConfig,
  MediaConstraints,
  WebRTCConnectionState,
  MediaStreamInfo
} from './types.ts';
import { validateSignalingMessage, createErrorMessage } from './message-validator.ts';

/**
 * WebRTC Client Configuration
 */
export interface WebRTCClientConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
  mediaConstraints: MediaConstraints;
  reconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
}

/**
 * Peer Connection Information
 */
export interface PeerConnectionInfo {
  participantId: string;
  participantName: string;
  connection: RTCPeerConnection;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  dataChannel?: RTCDataChannel;
  createdAt: Date;
  lastActivity: Date;
}

/**
 * WebRTC Client Events
 */
export interface WebRTCClientEvents {
  'connected': () => void;
  'disconnected': () => void;
  'participant-joined': (participantId: string, participantName: string) => void;
  'participant-left': (participantId: string) => void;
  'remote-stream': (participantId: string, stream: MediaStream) => void;
  'local-stream': (stream: MediaStream) => void;
  'connection-state-change': (participantId: string, state: RTCPeerConnectionState) => void;
  'ice-connection-state-change': (participantId: string, state: RTCIceConnectionState) => void;
  'recording-status': (isRecording: boolean, recordingId?: string) => void;
  'error': (error: Error, code?: SignalingErrorCode) => void;
}

/**
 * WebRTC Client Class
 */
export class WebRTCClient {
  private config: WebRTCClientConfig;
  private socket: WebSocket | null = null;
  private localStream: MediaStream | null = null;
  private peerConnections = new Map<string, PeerConnectionInfo>();
  private eventListeners = new Map<keyof WebRTCClientEvents, Function[]>();
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private isConnecting = false;
  private isConnected = false;
  private reconnectAttempts = 0;
  private roomId: string | null = null;
  private participantId: string | null = null;
  private participantName: string | null = null;
  private authToken: string | null = null;

  constructor(config: WebRTCClientConfig) {
    this.config = config;
  }

  /**
   * Connect to the signaling server and join a room
   */
  async connect(roomId: string, participantId: string, participantName: string, authToken?: string): Promise<void> {
    if (this.isConnecting || this.isConnected) {
      throw new Error('Already connected or connecting');
    }

    this.roomId = roomId;
    this.participantId = participantId;
    this.participantName = participantName;
    this.authToken = authToken || null;
    this.isConnecting = true;

    try {
      await this.establishSignalingConnection();
      await this.initializeLocalMedia();
      this.isConnecting = false;
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    } catch (error) {
      this.isConnecting = false;
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Disconnect from the signaling server and close all connections
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.isConnecting = false;

    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close all peer connections
    for (const [participantId, peerInfo] of this.peerConnections.entries()) {
      await this.closePeerConnection(participantId);
    }

    // Close signaling connection
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    // Stop local media
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.emit('disconnected');
  }

  /**
   * Add event listener
   */
  on<K extends keyof WebRTCClientEvents>(event: K, listener: WebRTCClientEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof WebRTCClientEvents>(event: K, listener: WebRTCClientEvents[K]): void {
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
  private emit<K extends keyof WebRTCClientEvents>(event: K, ...args: Parameters<WebRTCClientEvents[K]>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Establish WebSocket signaling connection
   */
  private async establishSignalingConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Build WebSocket URL with authentication parameters
        const url = new URL(this.config.signalingUrl);
        url.searchParams.set('roomId', this.roomId!);
        if (this.authToken) {
          url.searchParams.set('token', this.authToken);
        }

        this.socket = new WebSocket(url.toString());

        this.socket.onopen = () => {
          console.log('WebSocket signaling connection established');
          this.startHeartbeat();
          this.sendJoinMessage();
          resolve();
        };

        this.socket.onmessage = (event) => {
          this.handleSignalingMessage(event.data);
        };

        this.socket.onclose = (event) => {
          console.log('WebSocket signaling connection closed:', event.code, event.reason);
          this.handleSignalingDisconnection();
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket signaling error:', error);
          reject(new Error('Failed to establish signaling connection'));
        };

        // Connection timeout
        setTimeout(() => {
          if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
            this.socket.close();
            reject(new Error('Signaling connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Initialize local media stream
   */
  private async initializeLocalMedia(): Promise<void> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: this.config.mediaConstraints.audio || true,
        video: this.config.mediaConstraints.video || false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.emit('local-stream', this.localStream);
      console.log('Local media stream initialized');
    } catch (error) {
      console.error('Failed to initialize local media:', error);
      this.emit('error', new Error('Failed to access media devices'), SignalingErrorCode.MEDIA_PERMISSION_DENIED);
      throw error;
    }
  }

  /**
   * Send join message to signaling server
   */
  private sendJoinMessage(): void {
    const joinMessage: SignalingMessage = {
      type: 'join',
      roomId: this.roomId!,
      participantId: this.participantId!,
      timestamp: new Date(),
      data: {
        participant: {
          id: this.participantId!,
          name: this.participantName!,
          type: 'guest', // Assuming client is always guest, can be configured
          joinedAt: new Date()
        },
        capabilities: {
          audio: !!this.config.mediaConstraints.audio,
          video: !!this.config.mediaConstraints.video,
          screen: false
        }
      }
    };

    this.sendSignalingMessage(joinMessage);
  }

  /**
   * Send signaling message
   */
  private sendSignalingMessage(message: SignalingMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send signaling message: WebSocket not connected');
      return;
    }

    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send signaling message:', error);
      this.emit('error', new Error('Failed to send signaling message'));
    }
  }

  /**
   * Handle incoming signaling message
   */
  private async handleSignalingMessage(data: string): Promise<void> {
    try {
      const rawMessage = JSON.parse(data);
      const validationResult = validateSignalingMessage(rawMessage);
      
      if (!validationResult.isValid) {
        console.error('Invalid signaling message received:', validationResult.errors);
        return;
      }

      const message = validationResult.sanitizedMessage!;

      switch (message.type) {
        case 'participant-update':
          await this.handleParticipantUpdate(message);
          break;
        case 'offer':
          await this.handleOffer(message);
          break;
        case 'answer':
          await this.handleAnswer(message);
          break;
        case 'ice-candidate':
          await this.handleIceCandidate(message);
          break;
        case 'recording-status':
          this.handleRecordingStatus(message);
          break;
        case 'heartbeat':
          this.handleHeartbeat(message);
          break;
        case 'error':
          this.handleError(message);
          break;
        default:
          console.warn('Unknown signaling message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }

  /**
   * Handle participant update message
   */
  private async handleParticipantUpdate(message: SignalingMessage): Promise<void> {
    const data = message.data as any;
    
    switch (data.action) {
      case 'joined':
        if (data.participant && data.participant.id !== this.participantId) {
          await this.createPeerConnection(data.participant.id, data.participant.name);
          this.emit('participant-joined', data.participant.id, data.participant.name);
        }
        break;
      case 'left':
      case 'disconnected':
        if (data.participant && data.participant.id !== this.participantId) {
          await this.closePeerConnection(data.participant.id);
          this.emit('participant-left', data.participant.id);
        }
        break;
      case 'participants-list':
        if (data.participants) {
          for (const participant of data.participants) {
            if (participant.id !== this.participantId) {
              await this.createPeerConnection(participant.id, participant.name);
              this.emit('participant-joined', participant.id, participant.name);
            }
          }
        }
        break;
    }
  }

  /**
   * Create peer connection for a participant
   */
  private async createPeerConnection(participantId: string, participantName: string): Promise<void> {
    if (this.peerConnections.has(participantId)) {
      console.warn(`Peer connection already exists for participant ${participantId}`);
      return;
    }

    try {
      const peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers
      });

      const peerInfo: PeerConnectionInfo = {
        participantId,
        participantName,
        connection: peerConnection,
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
        createdAt: new Date(),
        lastActivity: new Date()
      };

      // Add local stream to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, this.localStream!);
        });
      }

      // Set up event handlers
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendIceCandidate(participantId, event.candidate);
        }
      };

      peerConnection.ontrack = (event) => {
        console.log(`Received remote stream from ${participantName}`);
        peerInfo.remoteStream = event.streams[0];
        this.emit('remote-stream', participantId, event.streams[0]);
      };

      peerConnection.onconnectionstatechange = () => {
        peerInfo.connectionState = peerConnection.connectionState;
        peerInfo.lastActivity = new Date();
        this.emit('connection-state-change', participantId, peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
          this.closePeerConnection(participantId);
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        peerInfo.iceConnectionState = peerConnection.iceConnectionState;
        peerInfo.lastActivity = new Date();
        this.emit('ice-connection-state-change', participantId, peerConnection.iceConnectionState);
      };

      this.peerConnections.set(participantId, peerInfo);

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      this.sendOffer(participantId, offer);

      console.log(`Created peer connection for ${participantName} (${participantId})`);
    } catch (error) {
      console.error(`Failed to create peer connection for ${participantId}:`, error);
      this.emit('error', new Error(`Failed to create peer connection for ${participantName}`));
    }
  }

  /**
   * Close peer connection for a participant
   */
  private async closePeerConnection(participantId: string): Promise<void> {
    const peerInfo = this.peerConnections.get(participantId);
    if (!peerInfo) {
      return;
    }

    try {
      peerInfo.connection.close();
      this.peerConnections.delete(participantId);
      console.log(`Closed peer connection for ${peerInfo.participantName} (${participantId})`);
    } catch (error) {
      console.error(`Error closing peer connection for ${participantId}:`, error);
    }
  }

  /**
   * Send WebRTC offer
   */
  private sendOffer(targetParticipantId: string, offer: RTCSessionDescriptionInit): void {
    const offerMessage: SignalingMessage = {
      type: 'offer',
      roomId: this.roomId!,
      participantId: this.participantId!,
      timestamp: new Date(),
      data: {
        to: targetParticipantId,
        from: this.participantId!,
        sdp: offer
      }
    };

    this.sendSignalingMessage(offerMessage);
  }

  /**
   * Send WebRTC answer
   */
  private sendAnswer(targetParticipantId: string, answer: RTCSessionDescriptionInit): void {
    const answerMessage: SignalingMessage = {
      type: 'answer',
      roomId: this.roomId!,
      participantId: this.participantId!,
      timestamp: new Date(),
      data: {
        to: targetParticipantId,
        from: this.participantId!,
        sdp: answer
      }
    };

    this.sendSignalingMessage(answerMessage);
  }

  /**
   * Send ICE candidate
   */
  private sendIceCandidate(targetParticipantId: string, candidate: RTCIceCandidate): void {
    const candidateMessage: SignalingMessage = {
      type: 'ice-candidate',
      roomId: this.roomId!,
      participantId: this.participantId!,
      timestamp: new Date(),
      data: {
        to: targetParticipantId,
        from: this.participantId!,
        candidate: {
          candidate: candidate.candidate,
          sdpMLineIndex: candidate.sdpMLineIndex,
          sdpMid: candidate.sdpMid
        }
      }
    };

    this.sendSignalingMessage(candidateMessage);
  }

  /**
   * Handle WebRTC offer
   */
  private async handleOffer(message: SignalingMessage): Promise<void> {
    const data = message.data as any;
    const fromParticipantId = data.from;
    
    if (!fromParticipantId || !data.sdp) {
      console.error('Invalid offer message');
      return;
    }

    let peerInfo = this.peerConnections.get(fromParticipantId);
    if (!peerInfo) {
      // Create peer connection if it doesn't exist
      await this.createPeerConnection(fromParticipantId, fromParticipantId);
      peerInfo = this.peerConnections.get(fromParticipantId);
      if (!peerInfo) {
        console.error('Failed to create peer connection for offer');
        return;
      }
    }

    try {
      await peerInfo.connection.setRemoteDescription(data.sdp);
      const answer = await peerInfo.connection.createAnswer();
      await peerInfo.connection.setLocalDescription(answer);
      this.sendAnswer(fromParticipantId, answer);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  /**
   * Handle WebRTC answer
   */
  private async handleAnswer(message: SignalingMessage): Promise<void> {
    const data = message.data as any;
    const fromParticipantId = data.from;
    
    if (!fromParticipantId || !data.sdp) {
      console.error('Invalid answer message');
      return;
    }

    const peerInfo = this.peerConnections.get(fromParticipantId);
    if (!peerInfo) {
      console.error('No peer connection found for answer');
      return;
    }

    try {
      await peerInfo.connection.setRemoteDescription(data.sdp);
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  /**
   * Handle ICE candidate
   */
  private async handleIceCandidate(message: SignalingMessage): Promise<void> {
    const data = message.data as any;
    const fromParticipantId = data.from;
    
    if (!fromParticipantId || !data.candidate) {
      console.error('Invalid ICE candidate message');
      return;
    }

    const peerInfo = this.peerConnections.get(fromParticipantId);
    if (!peerInfo) {
      console.error('No peer connection found for ICE candidate');
      return;
    }

    try {
      await peerInfo.connection.addIceCandidate(data.candidate);
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }

  /**
   * Handle recording status message
   */
  private handleRecordingStatus(message: SignalingMessage): void {
    const data = message.data as any;
    this.emit('recording-status', data.isRecording, data.recordingId);
  }

  /**
   * Handle heartbeat message
   */
  private handleHeartbeat(message: SignalingMessage): void {
    const data = message.data as any;
    if (data.ping) {
      // Respond with pong
      const pongMessage: SignalingMessage = {
        type: 'heartbeat',
        roomId: this.roomId!,
        participantId: this.participantId!,
        timestamp: new Date(),
        data: { pong: true }
      };
      this.sendSignalingMessage(pongMessage);
    }
  }

  /**
   * Handle error message
   */
  private handleError(message: SignalingMessage): void {
    const data = message.data as any;
    const error = new Error(data.message || 'Unknown signaling error');
    this.emit('error', error, data.code);
  }

  /**
   * Handle signaling disconnection
   */
  private handleSignalingDisconnection(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.isConnected && this.reconnectAttempts < this.config.reconnectAttempts) {
      this.attemptReconnection();
    } else {
      this.isConnected = false;
      this.emit('disconnected');
    }
  }

  /**
   * Attempt to reconnect to signaling server
   */
  private attemptReconnection(): void {
    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.config.reconnectAttempts}) in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.establishSignalingConnection();
        this.reconnectAttempts = 0;
        console.log('Reconnected to signaling server');
      } catch (error) {
        console.error('Reconnection failed:', error);
        this.handleSignalingDisconnection();
      }
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const heartbeatMessage: SignalingMessage = {
        type: 'heartbeat',
        roomId: this.roomId!,
        participantId: this.participantId!,
        timestamp: new Date(),
        data: { ping: true }
      };
      this.sendSignalingMessage(heartbeatMessage);
    }, this.config.heartbeatInterval);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    isConnected: boolean;
    peerConnectionCount: number;
    localStreamActive: boolean;
    reconnectAttempts: number;
  } {
    return {
      isConnected: this.isConnected,
      peerConnectionCount: this.peerConnections.size,
      localStreamActive: !!this.localStream && this.localStream.active,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Get peer connection information
   */
  getPeerConnections(): Map<string, PeerConnectionInfo> {
    return new Map(this.peerConnections);
  }

  /**
   * Get local media stream
   */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }
}