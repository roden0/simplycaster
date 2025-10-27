/**
 * WebRTC Connection Analytics Service
 * 
 * Tracks and analyzes WebRTC connection quality, bandwidth usage,
 * and connection types (direct vs relay).
 */

export interface ConnectionAnalytics {
  sessionId: string;
  roomId: string;
  participantId: string;
  participantType: 'host' | 'guest';
  connectionType: 'direct' | 'relay' | 'unknown';
  startTime: Date;
  endTime?: Date;
  duration: number; // in seconds
  quality: ConnectionQuality;
  bandwidth: BandwidthMetrics;
  network: NetworkMetrics;
}

export interface ConnectionQuality {
  score: number; // 0-100 quality score
  rating: 'excellent' | 'good' | 'fair' | 'poor';
  factors: {
    latency: number; // RTT in ms
    packetLoss: number; // percentage
    jitter: number; // ms
    bandwidth: number; // kbps
  };
}

export interface BandwidthMetrics {
  bytesReceived: number;
  bytesSent: number;
  averageReceiveBitrate: number; // kbps
  averageSendBitrate: number; // kbps
  peakReceiveBitrate: number; // kbps
  peakSendBitrate: number; // kbps
}

export interface NetworkMetrics {
  candidatePairs: CandidatePairInfo[];
  selectedPair?: CandidatePairInfo;
  iceConnectionState: string;
  dtlsState: string;
  totalRoundTripTime: number;
  currentRoundTripTime: number;
}

export interface CandidatePairInfo {
  id: string;
  localCandidate: {
    type: string; // host, srflx, relay
    protocol: string; // udp, tcp
    address: string;
    port: number;
  };
  remoteCandidate: {
    type: string;
    protocol: string;
    address: string;
    port: number;
  };
  state: string;
  priority: number;
  nominated: boolean;
  writable: boolean;
  bytesReceived: number;
  bytesSent: number;
  totalRoundTripTime: number;
  currentRoundTripTime: number;
}

export interface IConnectionAnalyticsService {
  startTracking(sessionId: string, roomId: string, participantId: string, participantType: 'host' | 'guest'): void;
  updateConnectionStats(sessionId: string, stats: RTCStatsReport): void;
  endTracking(sessionId: string): ConnectionAnalytics | null;
  getActiveConnections(): ConnectionAnalytics[];
  getConnectionHistory(roomId?: string, participantId?: string): ConnectionAnalytics[];
  getAggregatedMetrics(timeRange?: number): AggregatedMetrics;
}

export interface AggregatedMetrics {
  totalConnections: number;
  activeConnections: number;
  connectionTypes: {
    direct: number;
    relay: number;
    unknown: number;
  };
  averageQuality: number;
  averageDuration: number;
  bandwidthUsage: {
    total: number;
    average: number;
    peak: number;
  };
  qualityDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
}

export class ConnectionAnalyticsService implements IConnectionAnalyticsService {
  private activeConnections = new Map<string, ConnectionAnalytics>();
  private connectionHistory: ConnectionAnalytics[] = [];
  private readonly maxHistorySize = 1000;

  /**
   * Starts tracking a new WebRTC connection
   */
  startTracking(sessionId: string, roomId: string, participantId: string, participantType: 'host' | 'guest'): void {
    const analytics: ConnectionAnalytics = {
      sessionId,
      roomId,
      participantId,
      participantType,
      connectionType: 'unknown',
      startTime: new Date(),
      duration: 0,
      quality: {
        score: 0,
        rating: 'poor',
        factors: {
          latency: 0,
          packetLoss: 0,
          jitter: 0,
          bandwidth: 0
        }
      },
      bandwidth: {
        bytesReceived: 0,
        bytesSent: 0,
        averageReceiveBitrate: 0,
        averageSendBitrate: 0,
        peakReceiveBitrate: 0,
        peakSendBitrate: 0
      },
      network: {
        candidatePairs: [],
        iceConnectionState: 'new',
        dtlsState: 'new',
        totalRoundTripTime: 0,
        currentRoundTripTime: 0
      }
    };

    this.activeConnections.set(sessionId, analytics);
    console.log(`Started tracking connection for session ${sessionId}`);
  }

  /**
   * Updates connection statistics from WebRTC stats report
   */
  updateConnectionStats(sessionId: string, stats: RTCStatsReport): void {
    const analytics = this.activeConnections.get(sessionId);
    if (!analytics) {
      console.warn(`No active connection found for session ${sessionId}`);
      return;
    }

    // Update duration
    analytics.duration = Math.floor((Date.now() - analytics.startTime.getTime()) / 1000);

    // Parse WebRTC stats
    this.parseStatsReport(analytics, stats);

    // Update quality score
    this.calculateQualityScore(analytics);

    console.log(`Updated stats for session ${sessionId}:`, {
      connectionType: analytics.connectionType,
      quality: analytics.quality.rating,
      bandwidth: `${analytics.bandwidth.averageReceiveBitrate}/${analytics.bandwidth.averageSendBitrate} kbps`
    });
  }

  /**
   * Parses RTCStatsReport and updates analytics
   */
  private parseStatsReport(analytics: ConnectionAnalytics, stats: RTCStatsReport): void {
    const candidatePairs: CandidatePairInfo[] = [];
    let selectedPair: CandidatePairInfo | undefined;

    // Parse candidate pairs and determine connection type
    for (const [id, stat] of stats) {
      if (stat.type === 'candidate-pair') {
        const localCandidate = this.findCandidateById(stats, stat.localCandidateId);
        const remoteCandidate = this.findCandidateById(stats, stat.remoteCandidateId);

        if (localCandidate && remoteCandidate) {
          const pairInfo: CandidatePairInfo = {
            id,
            localCandidate: {
              type: localCandidate.candidateType || 'unknown',
              protocol: localCandidate.protocol || 'unknown',
              address: localCandidate.address || 'unknown',
              port: localCandidate.port || 0
            },
            remoteCandidate: {
              type: remoteCandidate.candidateType || 'unknown',
              protocol: remoteCandidate.protocol || 'unknown',
              address: remoteCandidate.address || 'unknown',
              port: remoteCandidate.port || 0
            },
            state: stat.state || 'unknown',
            priority: stat.priority || 0,
            nominated: stat.nominated || false,
            writable: stat.writable || false,
            bytesReceived: stat.bytesReceived || 0,
            bytesSent: stat.bytesSent || 0,
            totalRoundTripTime: stat.totalRoundTripTime || 0,
            currentRoundTripTime: stat.currentRoundTripTime || 0
          };

          candidatePairs.push(pairInfo);

          // Check if this is the selected pair
          if (stat.state === 'succeeded' && stat.nominated) {
            selectedPair = pairInfo;
            
            // Determine connection type based on local candidate
            if (localCandidate.candidateType === 'relay') {
              analytics.connectionType = 'relay';
            } else if (localCandidate.candidateType === 'host' || localCandidate.candidateType === 'srflx') {
              analytics.connectionType = 'direct';
            }
          }
        }
      }

      // Parse bandwidth metrics
      if (stat.type === 'inbound-rtp' && stat.mediaType === 'audio') {
        analytics.bandwidth.bytesReceived += stat.bytesReceived || 0;
        analytics.bandwidth.averageReceiveBitrate = this.calculateBitrate(stat.bytesReceived, analytics.duration);
      }

      if (stat.type === 'outbound-rtp' && stat.mediaType === 'audio') {
        analytics.bandwidth.bytesSent += stat.bytesSent || 0;
        analytics.bandwidth.averageSendBitrate = this.calculateBitrate(stat.bytesSent, analytics.duration);
      }

      // Parse network quality metrics
      if (stat.type === 'transport') {
        analytics.network.iceConnectionState = stat.iceState || 'unknown';
        analytics.network.dtlsState = stat.dtlsState || 'unknown';
        analytics.network.totalRoundTripTime = stat.totalRoundTripTime || 0;
        analytics.network.currentRoundTripTime = stat.currentRoundTripTime || 0;
        
        analytics.quality.factors.latency = stat.currentRoundTripTime ? stat.currentRoundTripTime * 1000 : 0;
      }
    }

    analytics.network.candidatePairs = candidatePairs;
    analytics.network.selectedPair = selectedPair;
  }

  /**
   * Finds a candidate by ID in the stats report
   */
  private findCandidateById(stats: RTCStatsReport, candidateId: string): any {
    for (const [id, stat] of stats) {
      if (id === candidateId && (stat.type === 'local-candidate' || stat.type === 'remote-candidate')) {
        return stat;
      }
    }
    return null;
  }

  /**
   * Calculates bitrate from bytes and duration
   */
  private calculateBitrate(bytes: number, durationSeconds: number): number {
    if (durationSeconds <= 0) return 0;
    return Math.round((bytes * 8) / (durationSeconds * 1000)); // Convert to kbps
  }

  /**
   * Calculates overall connection quality score
   */
  private calculateQualityScore(analytics: ConnectionAnalytics): void {
    const { latency, packetLoss, jitter, bandwidth } = analytics.quality.factors;
    
    // Update bandwidth factor
    analytics.quality.factors.bandwidth = Math.max(
      analytics.bandwidth.averageReceiveBitrate,
      analytics.bandwidth.averageSendBitrate
    );

    // Calculate quality score (0-100)
    let score = 100;

    // Latency penalty (0-40 points)
    if (latency > 300) score -= 40;
    else if (latency > 200) score -= 30;
    else if (latency > 100) score -= 20;
    else if (latency > 50) score -= 10;

    // Packet loss penalty (0-30 points)
    if (packetLoss > 5) score -= 30;
    else if (packetLoss > 2) score -= 20;
    else if (packetLoss > 1) score -= 10;
    else if (packetLoss > 0.5) score -= 5;

    // Bandwidth penalty (0-20 points)
    if (analytics.quality.factors.bandwidth < 32) score -= 20; // Below 32 kbps
    else if (analytics.quality.factors.bandwidth < 64) score -= 10; // Below 64 kbps

    // Connection type bonus/penalty (0-10 points)
    if (analytics.connectionType === 'direct') score += 5;
    else if (analytics.connectionType === 'relay') score -= 5;

    analytics.quality.score = Math.max(0, Math.min(100, score));

    // Determine rating
    if (analytics.quality.score >= 80) analytics.quality.rating = 'excellent';
    else if (analytics.quality.score >= 60) analytics.quality.rating = 'good';
    else if (analytics.quality.score >= 40) analytics.quality.rating = 'fair';
    else analytics.quality.rating = 'poor';
  }

  /**
   * Ends tracking for a connection and moves it to history
   */
  endTracking(sessionId: string): ConnectionAnalytics | null {
    const analytics = this.activeConnections.get(sessionId);
    if (!analytics) {
      return null;
    }

    // Set end time and final duration
    analytics.endTime = new Date();
    analytics.duration = Math.floor((analytics.endTime.getTime() - analytics.startTime.getTime()) / 1000);

    // Move to history
    this.activeConnections.delete(sessionId);
    this.connectionHistory.push(analytics);

    // Limit history size
    if (this.connectionHistory.length > this.maxHistorySize) {
      this.connectionHistory = this.connectionHistory.slice(-this.maxHistorySize);
    }

    console.log(`Ended tracking for session ${sessionId}, duration: ${analytics.duration}s`);
    return analytics;
  }

  /**
   * Gets all active connections
   */
  getActiveConnections(): ConnectionAnalytics[] {
    return Array.from(this.activeConnections.values());
  }

  /**
   * Gets connection history with optional filtering
   */
  getConnectionHistory(roomId?: string, participantId?: string): ConnectionAnalytics[] {
    let history = this.connectionHistory;

    if (roomId) {
      history = history.filter(c => c.roomId === roomId);
    }

    if (participantId) {
      history = history.filter(c => c.participantId === participantId);
    }

    return history.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  /**
   * Gets aggregated metrics for the specified time range
   */
  getAggregatedMetrics(timeRangeSeconds = 3600): AggregatedMetrics {
    const cutoffTime = new Date(Date.now() - (timeRangeSeconds * 1000));
    const recentConnections = this.connectionHistory.filter(c => c.startTime >= cutoffTime);
    const activeConnections = this.getActiveConnections();
    const allConnections = [...recentConnections, ...activeConnections];

    const connectionTypes = {
      direct: allConnections.filter(c => c.connectionType === 'direct').length,
      relay: allConnections.filter(c => c.connectionType === 'relay').length,
      unknown: allConnections.filter(c => c.connectionType === 'unknown').length
    };

    const qualityDistribution = {
      excellent: allConnections.filter(c => c.quality.rating === 'excellent').length,
      good: allConnections.filter(c => c.quality.rating === 'good').length,
      fair: allConnections.filter(c => c.quality.rating === 'fair').length,
      poor: allConnections.filter(c => c.quality.rating === 'poor').length
    };

    const averageQuality = allConnections.length > 0 
      ? allConnections.reduce((sum, c) => sum + c.quality.score, 0) / allConnections.length 
      : 0;

    const averageDuration = recentConnections.length > 0
      ? recentConnections.reduce((sum, c) => sum + c.duration, 0) / recentConnections.length
      : 0;

    const totalBandwidth = allConnections.reduce((sum, c) => 
      sum + c.bandwidth.bytesReceived + c.bandwidth.bytesSent, 0);

    const averageBandwidth = allConnections.length > 0 ? totalBandwidth / allConnections.length : 0;

    const peakBandwidth = Math.max(
      ...allConnections.map(c => Math.max(c.bandwidth.peakReceiveBitrate, c.bandwidth.peakSendBitrate)),
      0
    );

    return {
      totalConnections: allConnections.length,
      activeConnections: activeConnections.length,
      connectionTypes,
      averageQuality,
      averageDuration,
      bandwidthUsage: {
        total: totalBandwidth,
        average: averageBandwidth,
        peak: peakBandwidth
      },
      qualityDistribution
    };
  }
}

/**
 * Factory function to create ConnectionAnalyticsService
 */
export function createConnectionAnalyticsService(): ConnectionAnalyticsService {
  return new ConnectionAnalyticsService();
}