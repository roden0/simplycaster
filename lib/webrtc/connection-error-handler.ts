/**
 * Connection Error Handler
 * 
 * Handles ICE connection failures, implements automatic reconnection
 * with different ICE candidates, and provides fallback mechanisms
 * for TURN authentication failures.
 */

import { SignalingErrorCode } from './types.ts';

export interface ConnectionErrorHandlerConfig {
  maxReconnectAttempts: number;
  reconnectBackoffMultiplier: number;
  initialReconnectDelay: number;
  maxReconnectDelay: number;
  iceRestartTimeout: number;
  turnAuthRetryAttempts: number;
  enableFallbackStun: boolean;
  fallbackStunServers: string[];
}

export interface ConnectionErrorHandlerEvents {
  'connection-failed': (participantId: string, error: Error) => void;
  'reconnection-started': (participantId: string, attempt: number) => void;
  'reconnection-succeeded': (participantId: string) => void;
  'reconnection-failed': (participantId: string, error: Error) => void;
  'ice-restart-initiated': (participantId: string) => void;
  'turn-auth-failed': (participantId: string, error: Error) => void;
  'fallback-activated': (participantId: string, fallbackType: 'stun' | 'ice-restart') => void;
  'max-attempts-reached': (participantId: string) => void;
}

export interface ConnectionAttemptInfo {
  participantId: string;
  attempts: number;
  lastAttempt: Date;
  nextAttemptDelay: number;
  errors: Error[];
  isReconnecting: boolean;
  fallbacksUsed: string[];
}

export class ConnectionErrorHandler {
  private config: ConnectionErrorHandlerConfig;
  private eventListeners = new Map<keyof ConnectionErrorHandlerEvents, Function[]>();
  private connectionAttempts = new Map<string, ConnectionAttemptInfo>();
  private reconnectTimers = new Map<string, number>();
  private iceRestartTimers = new Map<string, number>();

  constructor(config?: Partial<ConnectionErrorHandlerConfig>) {
    this.config = {
      maxReconnectAttempts: config?.maxReconnectAttempts || 5,
      reconnectBackoffMultiplier: config?.reconnectBackoffMultiplier || 2,
      initialReconnectDelay: config?.initialReconnectDelay || 1000,
      maxReconnectDelay: config?.maxReconnectDelay || 30000,
      iceRestartTimeout: config?.iceRestartTimeout || 10000,
      turnAuthRetryAttempts: config?.turnAuthRetryAttempts || 3,
      enableFallbackStun: config?.enableFallbackStun ?? true,
      fallbackStunServers: config?.fallbackStunServers || [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
    };
  }

  /**
   * Handle ICE connection failure
   */
  async handleICEConnectionFailure(
    participantId: string,
    peerConnection: RTCPeerConnection,
    error: Error,
    reconnectCallback: () => Promise<void>
  ): Promise<void> {
    console.error(`ICE connection failed for ${participantId}:`, error);
    
    const attemptInfo = this.getOrCreateAttemptInfo(participantId);
    attemptInfo.errors.push(error);
    
    this.emit('connection-failed', participantId, error);

    // Try ICE restart first if connection was previously established
    if (peerConnection.iceConnectionState === 'failed' && attemptInfo.attempts === 0) {
      await this.attemptICERestart(participantId, peerConnection);
      return;
    }

    // If ICE restart didn't work or this is a new connection, try reconnection
    await this.attemptReconnection(participantId, reconnectCallback);
  }

  /**
   * Handle TURN authentication failure
   */
  async handleTURNAuthFailure(
    participantId: string,
    error: Error,
    refreshCredentialsCallback: () => Promise<void>,
    reconnectCallback: () => Promise<void>
  ): Promise<void> {
    console.error(`TURN authentication failed for ${participantId}:`, error);
    
    const attemptInfo = this.getOrCreateAttemptInfo(participantId);
    attemptInfo.errors.push(error);
    
    this.emit('turn-auth-failed', participantId, error);

    // Try to refresh TURN credentials
    try {
      await refreshCredentialsCallback();
      console.log(`Refreshed TURN credentials for ${participantId}`);
      
      // Attempt reconnection with new credentials
      await this.attemptReconnection(participantId, reconnectCallback);
    } catch (refreshError) {
      console.error(`Failed to refresh TURN credentials for ${participantId}:`, refreshError);
      
      // Fall back to STUN-only mode if enabled
      if (this.config.enableFallbackStun) {
        await this.activateSTUNFallback(participantId, reconnectCallback);
      } else {
        this.emit('reconnection-failed', participantId, refreshError instanceof Error ? refreshError : new Error(String(refreshError)));
      }
    }
  }

  /**
   * Handle general connection error
   */
  async handleConnectionError(
    participantId: string,
    error: Error,
    errorCode: SignalingErrorCode,
    reconnectCallback: () => Promise<void>
  ): Promise<void> {
    console.error(`Connection error for ${participantId} (${errorCode}):`, error);
    
    const attemptInfo = this.getOrCreateAttemptInfo(participantId);
    attemptInfo.errors.push(error);
    
    this.emit('connection-failed', participantId, error);

    // Handle specific error types
    switch (errorCode) {
      case SignalingErrorCode.NETWORK_ERROR:
        await this.handleNetworkError(participantId, reconnectCallback);
        break;
      
      case SignalingErrorCode.CONNECTION_FAILED:
        await this.attemptReconnection(participantId, reconnectCallback);
        break;
      
      default:
        await this.attemptReconnection(participantId, reconnectCallback);
        break;
    }
  }

  /**
   * Clear connection attempt info for a participant
   */
  clearConnectionAttempts(participantId: string): void {
    // Clear timers
    const reconnectTimer = this.reconnectTimers.get(participantId);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      this.reconnectTimers.delete(participantId);
    }

    const iceRestartTimer = this.iceRestartTimers.get(participantId);
    if (iceRestartTimer) {
      clearTimeout(iceRestartTimer);
      this.iceRestartTimers.delete(participantId);
    }

    // Clear attempt info
    this.connectionAttempts.delete(participantId);
    console.log(`Cleared connection attempts for ${participantId}`);
  }

  /**
   * Get connection attempt information
   */
  getConnectionAttemptInfo(participantId: string): ConnectionAttemptInfo | null {
    return this.connectionAttempts.get(participantId) || null;
  }

  /**
   * Get all connection attempt information
   */
  getAllConnectionAttempts(): Map<string, ConnectionAttemptInfo> {
    return new Map(this.connectionAttempts);
  }

  /**
   * Add event listener
   */
  on<K extends keyof ConnectionErrorHandlerEvents>(event: K, listener: ConnectionErrorHandlerEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof ConnectionErrorHandlerEvents>(event: K, listener: ConnectionErrorHandlerEvents[K]): void {
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
  private emit<K extends keyof ConnectionErrorHandlerEvents>(event: K, ...args: Parameters<ConnectionErrorHandlerEvents[K]>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in connection error handler event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get or create attempt info for a participant
   */
  private getOrCreateAttemptInfo(participantId: string): ConnectionAttemptInfo {
    let attemptInfo = this.connectionAttempts.get(participantId);
    
    if (!attemptInfo) {
      attemptInfo = {
        participantId,
        attempts: 0,
        lastAttempt: new Date(),
        nextAttemptDelay: this.config.initialReconnectDelay,
        errors: [],
        isReconnecting: false,
        fallbacksUsed: []
      };
      this.connectionAttempts.set(participantId, attemptInfo);
    }
    
    return attemptInfo;
  }

  /**
   * Attempt ICE restart
   */
  private async attemptICERestart(participantId: string, peerConnection: RTCPeerConnection): Promise<void> {
    console.log(`Attempting ICE restart for ${participantId}`);
    
    this.emit('ice-restart-initiated', participantId);
    
    try {
      // Restart ICE gathering
      await peerConnection.restartIce();
      
      // Set timeout for ICE restart
      const timer = setTimeout(() => {
        console.warn(`ICE restart timeout for ${participantId}`);
        this.iceRestartTimers.delete(participantId);
      }, this.config.iceRestartTimeout);
      
      this.iceRestartTimers.set(participantId, timer);
      
      console.log(`ICE restart initiated for ${participantId}`);
    } catch (error) {
      console.error(`Failed to restart ICE for ${participantId}:`, error);
      throw error;
    }
  }

  /**
   * Attempt reconnection with backoff
   */
  private async attemptReconnection(participantId: string, reconnectCallback: () => Promise<void>): Promise<void> {
    const attemptInfo = this.getOrCreateAttemptInfo(participantId);
    
    if (attemptInfo.attempts >= this.config.maxReconnectAttempts) {
      console.error(`Max reconnection attempts reached for ${participantId}`);
      this.emit('max-attempts-reached', participantId);
      return;
    }

    if (attemptInfo.isReconnecting) {
      console.log(`Reconnection already in progress for ${participantId}`);
      return;
    }

    attemptInfo.attempts++;
    attemptInfo.isReconnecting = true;
    attemptInfo.lastAttempt = new Date();
    
    console.log(`Attempting reconnection ${attemptInfo.attempts}/${this.config.maxReconnectAttempts} for ${participantId} in ${attemptInfo.nextAttemptDelay}ms`);
    
    this.emit('reconnection-started', participantId, attemptInfo.attempts);

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(participantId);
      
      try {
        await reconnectCallback();
        
        // Success - reset attempt info
        attemptInfo.isReconnecting = false;
        attemptInfo.attempts = 0;
        attemptInfo.nextAttemptDelay = this.config.initialReconnectDelay;
        attemptInfo.errors = [];
        
        this.emit('reconnection-succeeded', participantId);
        console.log(`Reconnection succeeded for ${participantId}`);
        
      } catch (error) {
        attemptInfo.isReconnecting = false;
        const reconnectError = error instanceof Error ? error : new Error(String(error));
        attemptInfo.errors.push(reconnectError);
        
        console.error(`Reconnection attempt ${attemptInfo.attempts} failed for ${participantId}:`, reconnectError);
        
        // Calculate next delay with exponential backoff
        attemptInfo.nextAttemptDelay = Math.min(
          attemptInfo.nextAttemptDelay * this.config.reconnectBackoffMultiplier,
          this.config.maxReconnectDelay
        );
        
        // Try again if we haven't reached max attempts
        if (attemptInfo.attempts < this.config.maxReconnectAttempts) {
          await this.attemptReconnection(participantId, reconnectCallback);
        } else {
          this.emit('reconnection-failed', participantId, reconnectError);
        }
      }
    }, attemptInfo.nextAttemptDelay);
    
    this.reconnectTimers.set(participantId, timer);
  }

  /**
   * Handle network error with specific strategies
   */
  private async handleNetworkError(participantId: string, reconnectCallback: () => Promise<void>): Promise<void> {
    console.log(`Handling network error for ${participantId}`);
    
    // Wait a bit longer for network errors
    const attemptInfo = this.getOrCreateAttemptInfo(participantId);
    attemptInfo.nextAttemptDelay = Math.max(attemptInfo.nextAttemptDelay, 5000); // At least 5 seconds
    
    await this.attemptReconnection(participantId, reconnectCallback);
  }

  /**
   * Activate STUN-only fallback mode
   */
  private async activateSTUNFallback(participantId: string, reconnectCallback: () => Promise<void>): Promise<void> {
    console.log(`Activating STUN fallback for ${participantId}`);
    
    const attemptInfo = this.getOrCreateAttemptInfo(participantId);
    attemptInfo.fallbacksUsed.push('stun');
    
    this.emit('fallback-activated', participantId, 'stun');
    
    // The actual STUN fallback configuration would be handled by the calling code
    // This just signals that fallback should be used
    
    await this.attemptReconnection(participantId, reconnectCallback);
  }

  /**
   * Check if participant is currently reconnecting
   */
  isReconnecting(participantId: string): boolean {
    const attemptInfo = this.connectionAttempts.get(participantId);
    return attemptInfo?.isReconnecting || false;
  }

  /**
   * Get error handler statistics
   */
  getErrorHandlerStats(): {
    activeReconnections: number;
    totalParticipants: number;
    totalErrors: number;
    fallbacksActivated: number;
  } {
    let totalErrors = 0;
    let fallbacksActivated = 0;
    let activeReconnections = 0;

    for (const attemptInfo of this.connectionAttempts.values()) {
      totalErrors += attemptInfo.errors.length;
      fallbacksActivated += attemptInfo.fallbacksUsed.length;
      if (attemptInfo.isReconnecting) {
        activeReconnections++;
      }
    }

    return {
      activeReconnections,
      totalParticipants: this.connectionAttempts.size,
      totalErrors,
      fallbacksActivated
    };
  }
}