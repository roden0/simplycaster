/**
 * Coturn Health Monitoring Service
 * 
 * Monitors Coturn server health, collects metrics, and provides
 * health check endpoints for system monitoring.
 */

export interface CoturnHealthMetrics {
  isHealthy: boolean;
  responseTime: number;
  activeSessions: number;
  totalBandwidth: number;
  authSuccessRate: number;
  authFailureCount: number;
  lastChecked: Date;
  uptime: number;
  version?: string;
  errorMessage?: string;
}

export interface CoturnSessionMetrics {
  sessionId: string;
  userId: string;
  roomId?: string;
  startTime: Date;
  bytesTransferred: number;
  connectionType: 'udp' | 'tcp' | 'tls';
  clientIP: string;
  isActive: boolean;
}

export interface CoturnAuthMetrics {
  timestamp: Date;
  userId: string;
  success: boolean;
  clientIP: string;
  errorReason?: string;
}

export interface ICoturnHealthService {
  checkHealth(): Promise<CoturnHealthMetrics>;
  getSessionMetrics(): Promise<CoturnSessionMetrics[]>;
  getAuthMetrics(timeRange?: number): Promise<CoturnAuthMetrics[]>;
  isServiceAvailable(): Promise<boolean>;
  getServiceInfo(): Promise<{ version: string; uptime: number }>;
}

export class CoturnHealthService implements ICoturnHealthService {
  private readonly coturnHost: string;
  private readonly coturnPort: number;
  private readonly adminPort: number;
  private readonly adminSecret?: string;
  private healthCache: CoturnHealthMetrics | null = null;
  private lastHealthCheck = 0;
  private readonly cacheTimeout = 30000; // 30 seconds

  constructor() {
    this.coturnHost = Deno.env.get("COTURN_HOST") || "localhost";
    this.coturnPort = parseInt(Deno.env.get("COTURN_PORT") || "3478", 10);
    this.adminPort = parseInt(Deno.env.get("COTURN_ADMIN_PORT") || "5766", 10);
    this.adminSecret = Deno.env.get("COTURN_ADMIN_SECRET");
  }

  /**
   * Performs comprehensive health check of Coturn service
   */
  async checkHealth(): Promise<CoturnHealthMetrics> {
    const now = Date.now();
    
    // Return cached result if still valid
    if (this.healthCache && (now - this.lastHealthCheck) < this.cacheTimeout) {
      return this.healthCache;
    }

    const startTime = Date.now();
    let metrics: CoturnHealthMetrics;

    try {
      // Test STUN connectivity
      const stunHealthy = await this.testStunConnectivity();
      
      // Get service info if admin interface is available
      let serviceInfo = { version: 'unknown', uptime: 0 };
      try {
        serviceInfo = await this.getServiceInfo();
      } catch (error) {
        console.warn('Failed to get Coturn service info:', error);
      }

      // Get session metrics
      let activeSessions = 0;
      let totalBandwidth = 0;
      try {
        const sessions = await this.getSessionMetrics();
        activeSessions = sessions.filter(s => s.isActive).length;
        totalBandwidth = sessions.reduce((sum, s) => sum + s.bytesTransferred, 0);
      } catch (error) {
        console.warn('Failed to get session metrics:', error);
      }

      // Calculate auth success rate
      let authSuccessRate = 100;
      let authFailureCount = 0;
      try {
        const authMetrics = await this.getAuthMetrics(3600); // Last hour
        const totalAuth = authMetrics.length;
        const successfulAuth = authMetrics.filter(a => a.success).length;
        authSuccessRate = totalAuth > 0 ? (successfulAuth / totalAuth) * 100 : 100;
        authFailureCount = totalAuth - successfulAuth;
      } catch (error) {
        console.warn('Failed to get auth metrics:', error);
      }

      const responseTime = Date.now() - startTime;

      metrics = {
        isHealthy: stunHealthy,
        responseTime,
        activeSessions,
        totalBandwidth,
        authSuccessRate,
        authFailureCount,
        lastChecked: new Date(),
        uptime: serviceInfo.uptime,
        version: serviceInfo.version
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      metrics = {
        isHealthy: false,
        responseTime,
        activeSessions: 0,
        totalBandwidth: 0,
        authSuccessRate: 0,
        authFailureCount: 0,
        lastChecked: new Date(),
        uptime: 0,
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }

    // Cache the result
    this.healthCache = metrics;
    this.lastHealthCheck = now;

    return metrics;
  }

  /**
   * Tests STUN connectivity to verify Coturn is responding
   */
  private async testStunConnectivity(): Promise<boolean> {
    try {
      // Create a simple UDP socket to test STUN binding request
      const stunUrl = `stun:${this.coturnHost}:${this.coturnPort}`;
      
      // Use WebRTC RTCPeerConnection to test STUN connectivity
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: stunUrl }]
      });

      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          pc.close();
          resolve(false);
        }, 5000); // 5 second timeout

        pc.onicecandidate = (event) => {
          if (event.candidate && event.candidate.candidate.includes('srflx')) {
            // Successfully got server reflexive candidate from STUN
            clearTimeout(timeout);
            pc.close();
            resolve(true);
          }
        };

        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            pc.close();
            resolve(false); // No STUN candidates found
          }
        };

        // Create a data channel to trigger ICE gathering
        pc.createDataChannel('test');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
      });

    } catch (error) {
      console.error('STUN connectivity test failed:', error);
      return false;
    }
  }

  /**
   * Gets active session metrics from Coturn
   */
  async getSessionMetrics(): Promise<CoturnSessionMetrics[]> {
    // In a real implementation, this would query Coturn's admin interface
    // or parse log files to get session information
    
    // For now, return mock data structure
    // TODO: Implement actual Coturn admin API integration
    return [];
  }

  /**
   * Gets authentication metrics from Coturn logs
   */
  async getAuthMetrics(timeRangeSeconds = 3600): Promise<CoturnAuthMetrics[]> {
    // In a real implementation, this would parse Coturn log files
    // or query a logging database to get authentication attempts
    
    // TODO: Implement log parsing or database query
    return [];
  }

  /**
   * Checks if Coturn service is available
   */
  async isServiceAvailable(): Promise<boolean> {
    try {
      const health = await this.checkHealth();
      return health.isHealthy;
    } catch (error) {
      console.error('Service availability check failed:', error);
      return false;
    }
  }

  /**
   * Gets Coturn service information
   */
  async getServiceInfo(): Promise<{ version: string; uptime: number }> {
    // In a real implementation, this would query Coturn's admin interface
    // TODO: Implement actual Coturn admin API integration
    
    return {
      version: 'unknown',
      uptime: 0
    };
  }

  /**
   * Simulates authentication attempt logging
   */
  logAuthAttempt(userId: string, success: boolean, clientIP: string, errorReason?: string): void {
    const authMetric: CoturnAuthMetrics = {
      timestamp: new Date(),
      userId,
      success,
      clientIP,
      errorReason
    };

    // In a real implementation, this would write to a log file or database
    console.log('Coturn auth attempt:', authMetric);
  }

  /**
   * Simulates session tracking
   */
  trackSession(sessionId: string, userId: string, roomId?: string): void {
    const sessionMetric: CoturnSessionMetrics = {
      sessionId,
      userId,
      roomId,
      startTime: new Date(),
      bytesTransferred: 0,
      connectionType: 'udp',
      clientIP: 'unknown',
      isActive: true
    };

    // In a real implementation, this would write to a log file or database
    console.log('Coturn session started:', sessionMetric);
  }

  /**
   * Gets health status summary for monitoring systems
   */
  async getHealthSummary(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    metrics: CoturnHealthMetrics;
  }> {
    const metrics = await this.checkHealth();
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    let message: string;

    if (!metrics.isHealthy) {
      status = 'unhealthy';
      message = metrics.errorMessage || 'Coturn service is not responding';
    } else if (metrics.responseTime > 1000 || metrics.authSuccessRate < 95) {
      status = 'degraded';
      message = 'Coturn service is experiencing performance issues';
    } else {
      status = 'healthy';
      message = 'Coturn service is operating normally';
    }

    return {
      status,
      message,
      metrics
    };
  }
}

/**
 * Factory function to create CoturnHealthService
 */
export function createCoturnHealthService(): CoturnHealthService {
  return new CoturnHealthService();
}