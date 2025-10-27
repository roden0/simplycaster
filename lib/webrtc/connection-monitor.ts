/**
 * Connection Monitor
 * 
 * Monitors WebRTC connection quality, tracks connection types (direct vs relay),
 * and provides bandwidth and latency monitoring capabilities.
 */

import { ConnectionQualityMetrics, ICEConnectionInfo } from './types.ts';

export interface ConnectionMonitorConfig {
  statsInterval: number; // Interval to collect stats (default: 5000ms)
  qualityThresholds: {
    excellent: { rtt: number; packetLoss: number };
    good: { rtt: number; packetLoss: number };
    fair: { rtt: number; packetLoss: number };
  };
  enableDetailedStats: boolean;
}

export interface ConnectionMonitorEvents {
  'quality-changed': (participantId: string, quality: ConnectionQualityMetrics) => void;
  'connection-type-detected': (participantId: string, type: 'direct' | 'relay' | 'unknown') => void;
  'bandwidth-warning': (participantId: string, availableBandwidth: number) => void;
  'high-latency-warning': (participantId: string, rtt: number) => void;
  'packet-loss-warning': (participantId: string, packetLoss: number) => void;
  'stats-updated': (participantId: string, stats: ConnectionQualityMetrics) => void;
}

export class ConnectionMonitor {
  private config: ConnectionMonitorConfig;
  private eventListeners = new Map<keyof ConnectionMonitorEvents, Function[]>();
  private monitoringTimer: number | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private lastStats = new Map<string, ConnectionQualityMetrics>();
  private connectionInfo = new Map<string, ICEConnectionInfo>();
  private isMonitoring = false;

  constructor(config?: Partial<ConnectionMonitorConfig>) {
    this.config = {
      statsInterval: config?.statsInterval || 5000,
      qualityThresholds: config?.qualityThresholds || {
        excellent: { rtt: 100, packetLoss: 0.01 },
        good: { rtt: 200, packetLoss: 0.03 },
        fair: { rtt: 400, packetLoss: 0.05 }
      },
      enableDetailedStats: config?.enableDetailedStats ?? true
    };
  }

  /**
   * Start monitoring peer connections
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringTimer = setInterval(async () => {
      await this.collectStats();
    }, this.config.statsInterval);

    console.log(`Started connection monitoring (interval: ${this.config.statsInterval}ms)`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    console.log('Stopped connection monitoring');
  }

  /**
   * Add peer connection to monitor
   */
  addPeerConnection(participantId: string, peerConnection: RTCPeerConnection): void {
    this.peerConnections.set(participantId, peerConnection);
    
    // Initialize connection info
    this.connectionInfo.set(participantId, {
      participantId,
      connectionState: peerConnection.connectionState,
      iceConnectionState: peerConnection.iceConnectionState,
      iceGatheringState: peerConnection.iceGatheringState,
      localCandidates: [],
      remoteCandidates: [],
      usingTurnRelay: false,
      lastStatsUpdate: new Date()
    });

    // Set up event listeners for connection state changes
    peerConnection.onconnectionstatechange = () => {
      this.updateConnectionInfo(participantId, {
        connectionState: peerConnection.connectionState
      });
    };

    peerConnection.oniceconnectionstatechange = () => {
      this.updateConnectionInfo(participantId, {
        iceConnectionState: peerConnection.iceConnectionState
      });
    };

    peerConnection.onicegatheringstatechange = () => {
      this.updateConnectionInfo(participantId, {
        iceGatheringState: peerConnection.iceGatheringState
      });
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.handleICECandidate(participantId, event.candidate, 'local');
      }
    };

    console.log(`Added peer connection for monitoring: ${participantId}`);
  }

  /**
   * Remove peer connection from monitoring
   */
  removePeerConnection(participantId: string): void {
    this.peerConnections.delete(participantId);
    this.lastStats.delete(participantId);
    this.connectionInfo.delete(participantId);
    console.log(`Removed peer connection from monitoring: ${participantId}`);
  }

  /**
   * Get current connection quality for a participant
   */
  getConnectionQuality(participantId: string): ConnectionQualityMetrics | null {
    return this.lastStats.get(participantId) || null;
  }

  /**
   * Get all connection qualities
   */
  getAllConnectionQualities(): Map<string, ConnectionQualityMetrics> {
    return new Map(this.lastStats);
  }

  /**
   * Get connection information for a participant
   */
  getConnectionInfo(participantId: string): ICEConnectionInfo | null {
    return this.connectionInfo.get(participantId) || null;
  }

  /**
   * Get all connection information
   */
  getAllConnectionInfo(): Map<string, ICEConnectionInfo> {
    return new Map(this.connectionInfo);
  }

  /**
   * Add event listener
   */
  on<K extends keyof ConnectionMonitorEvents>(event: K, listener: ConnectionMonitorEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof ConnectionMonitorEvents>(event: K, listener: ConnectionMonitorEvents[K]): void {
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
  private emit<K extends keyof ConnectionMonitorEvents>(event: K, ...args: Parameters<ConnectionMonitorEvents[K]>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in connection monitor event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Collect stats from all peer connections
   */
  private async collectStats(): Promise<void> {
    for (const [participantId, peerConnection] of this.peerConnections.entries()) {
      try {
        const stats = await peerConnection.getStats();
        const quality = this.parseConnectionStats(participantId, stats);
        
        if (quality) {
          const previousQuality = this.lastStats.get(participantId);
          this.lastStats.set(participantId, quality);
          
          // Emit events for quality changes and warnings
          this.handleQualityUpdate(participantId, quality, previousQuality);
          
          // Update connection info
          this.updateConnectionInfoFromStats(participantId, stats);
        }
      } catch (error) {
        console.error(`Error collecting stats for ${participantId}:`, error);
      }
    }
  }

  /**
   * Parse WebRTC stats into connection quality metrics
   */
  private parseConnectionStats(participantId: string, stats: RTCStatsReport): ConnectionQualityMetrics | null {
    let rtt = 0;
    let packetsLost = 0;
    let packetsReceived = 0;
    let packetsSent = 0;
    let bytesReceived = 0;
    let bytesSent = 0;
    let jitter = 0;
    let connectionType: 'direct' | 'relay' | 'unknown' = 'unknown';

    // Parse different types of stats
    for (const [id, stat] of stats.entries()) {
      switch (stat.type) {
        case 'candidate-pair':
          if (stat.state === 'succeeded') {
            rtt = (stat.currentRoundTripTime || 0) * 1000; // Convert to ms
            
            // Determine connection type based on candidate types
            if (stat.localCandidateId && stat.remoteCandidateId) {
              connectionType = this.determineConnectionType(stats, stat.localCandidateId, stat.remoteCandidateId);
            }
          }
          break;

        case 'inbound-rtp':
          if (stat.mediaType === 'audio' || stat.mediaType === 'video') {
            packetsLost += stat.packetsLost || 0;
            packetsReceived += stat.packetsReceived || 0;
            bytesReceived += stat.bytesReceived || 0;
            jitter += stat.jitter || 0;
          }
          break;

        case 'outbound-rtp':
          if (stat.mediaType === 'audio' || stat.mediaType === 'video') {
            packetsSent += stat.packetsSent || 0;
            bytesSent += stat.bytesSent || 0;
          }
          break;
      }
    }

    // Calculate quality based on metrics
    const quality = this.calculateConnectionQuality(rtt, packetsLost, packetsReceived);

    return {
      connectionType,
      bytesReceived,
      bytesSent,
      packetsLost,
      packetsReceived,
      packetsSent,
      roundTripTime: rtt,
      jitter,
      timestamp: new Date()
    };
  }

  /**
   * Determine connection type (direct vs relay) from candidate pair
   */
  private determineConnectionType(stats: RTCStatsReport, localCandidateId: string, remoteCandidateId: string): 'direct' | 'relay' | 'unknown' {
    const localCandidate = stats.get(localCandidateId);
    const remoteCandidate = stats.get(remoteCandidateId);

    if (!localCandidate || !remoteCandidate) {
      return 'unknown';
    }

    // Check if either candidate is a relay (TURN)
    if (localCandidate.candidateType === 'relay' || remoteCandidate.candidateType === 'relay') {
      return 'relay';
    }

    // If both are host, srflx, or prflx, it's likely direct
    if ((localCandidate.candidateType === 'host' || localCandidate.candidateType === 'srflx' || localCandidate.candidateType === 'prflx') &&
        (remoteCandidate.candidateType === 'host' || remoteCandidate.candidateType === 'srflx' || remoteCandidate.candidateType === 'prflx')) {
      return 'direct';
    }

    return 'unknown';
  }

  /**
   * Calculate connection quality based on RTT and packet loss
   */
  private calculateConnectionQuality(rtt: number, packetsLost: number, packetsReceived: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (packetsReceived === 0) {
      return 'poor';
    }

    const packetLossRate = packetsLost / (packetsReceived + packetsLost);
    const thresholds = this.config.qualityThresholds;

    if (rtt <= thresholds.excellent.rtt && packetLossRate <= thresholds.excellent.packetLoss) {
      return 'excellent';
    } else if (rtt <= thresholds.good.rtt && packetLossRate <= thresholds.good.packetLoss) {
      return 'good';
    } else if (rtt <= thresholds.fair.rtt && packetLossRate <= thresholds.fair.packetLoss) {
      return 'fair';
    } else {
      return 'poor';
    }
  }

  /**
   * Handle quality updates and emit appropriate events
   */
  private handleQualityUpdate(participantId: string, quality: ConnectionQualityMetrics, previousQuality?: ConnectionQualityMetrics): void {
    // Emit stats updated event
    this.emit('stats-updated', participantId, quality);

    // Check for connection type detection
    if (!previousQuality || previousQuality.connectionType !== quality.connectionType) {
      this.emit('connection-type-detected', participantId, quality.connectionType);
    }

    // Check for quality changes
    const currentQualityLevel = this.calculateConnectionQuality(
      quality.roundTripTime,
      quality.packetsLost,
      quality.packetsReceived
    );

    const previousQualityLevel = previousQuality ? this.calculateConnectionQuality(
      previousQuality.roundTripTime,
      previousQuality.packetsLost,
      previousQuality.packetsReceived
    ) : null;

    if (!previousQualityLevel || currentQualityLevel !== previousQualityLevel) {
      this.emit('quality-changed', participantId, { ...quality });
    }

    // Check for warnings
    if (quality.roundTripTime > 500) {
      this.emit('high-latency-warning', participantId, quality.roundTripTime);
    }

    const packetLossRate = quality.packetsLost / (quality.packetsReceived + quality.packetsLost);
    if (packetLossRate > 0.05) { // 5% packet loss
      this.emit('packet-loss-warning', participantId, packetLossRate);
    }
  }

  /**
   * Update connection info from stats
   */
  private updateConnectionInfoFromStats(participantId: string, stats: RTCStatsReport): void {
    const info = this.connectionInfo.get(participantId);
    if (!info) return;

    // Check for TURN relay usage
    let usingTurnRelay = false;
    for (const [id, stat] of stats.entries()) {
      if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
        const localCandidate = stats.get(stat.localCandidateId);
        const remoteCandidate = stats.get(stat.remoteCandidateId);
        
        if (localCandidate?.candidateType === 'relay' || remoteCandidate?.candidateType === 'relay') {
          usingTurnRelay = true;
          break;
        }
      }
    }

    this.updateConnectionInfo(participantId, {
      usingTurnRelay,
      lastStatsUpdate: new Date()
    });
  }

  /**
   * Update connection info
   */
  private updateConnectionInfo(participantId: string, updates: Partial<ICEConnectionInfo>): void {
    const info = this.connectionInfo.get(participantId);
    if (info) {
      Object.assign(info, updates);
      this.connectionInfo.set(participantId, info);
    }
  }

  /**
   * Handle ICE candidate
   */
  private handleICECandidate(participantId: string, candidate: RTCIceCandidate, type: 'local' | 'remote'): void {
    const info = this.connectionInfo.get(participantId);
    if (!info) return;

    if (type === 'local') {
      info.localCandidates.push(candidate);
    } else {
      info.remoteCandidates.push(candidate);
    }

    this.connectionInfo.set(participantId, info);
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): {
    isMonitoring: boolean;
    monitoredConnections: number;
    statsInterval: number;
    totalStatsCollected: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      monitoredConnections: this.peerConnections.size,
      statsInterval: this.config.statsInterval,
      totalStatsCollected: this.lastStats.size
    };
  }
}