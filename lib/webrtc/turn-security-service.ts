/**
 * TURN Server Security Service
 * 
 * Implements security measures for TURN server access including
 * rate limiting, IP-based access restrictions, and bandwidth quotas.
 */

import { getService } from "../container/global.ts";
import { ServiceKeys } from "../container/registry.ts";
import { RateLimitService } from "../domain/services/rate-limit-service.ts";
import { RedisService } from "../domain/services/redis-service.ts";

export interface TurnSecurityConfig {
  rateLimiting: {
    credentialRequests: {
      limit: number;
      windowSeconds: number;
    };
    connectionAttempts: {
      limit: number;
      windowSeconds: number;
    };
  };
  ipRestrictions: {
    enabled: boolean;
    allowedCidrs: string[];
    blockedIps: string[];
    maxConnectionsPerIp: number;
  };
  bandwidthQuotas: {
    enabled: boolean;
    defaultQuotaMbps: number;
    hostQuotaMbps: number;
    guestQuotaMbps: number;
    quotaWindowSeconds: number;
  };
  sessionLimits: {
    maxConcurrentSessions: number;
    maxSessionDurationSeconds: number;
    maxIdleTimeSeconds: number;
  };
}

export interface SecurityViolation {
  type: 'rate_limit' | 'ip_blocked' | 'bandwidth_exceeded' | 'session_limit' | 'suspicious_activity';
  userId: string;
  clientIp: string;
  timestamp: Date;
  details: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ITurnSecurityService {
  checkCredentialRequestLimit(userId: string, clientIp: string): Promise<boolean>;
  checkConnectionAttemptLimit(userId: string, clientIp: string): Promise<boolean>;
  isIpAllowed(clientIp: string): Promise<boolean>;
  checkBandwidthQuota(userId: string, userType: 'host' | 'guest', bytesUsed: number): Promise<boolean>;
  checkSessionLimits(userId: string): Promise<boolean>;
  recordSecurityViolation(violation: SecurityViolation): Promise<void>;
  getSecurityMetrics(timeRangeSeconds?: number): Promise<SecurityMetrics>;
  blockIpTemporarily(clientIp: string, durationSeconds: number, reason: string): Promise<void>;
  isIpTemporarilyBlocked(clientIp: string): Promise<boolean>;
}

export interface SecurityMetrics {
  violations: {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  rateLimiting: {
    credentialRequestsBlocked: number;
    connectionAttemptsBlocked: number;
  };
  ipRestrictions: {
    blockedIps: number;
    temporaryBlocks: number;
  };
  bandwidthQuotas: {
    quotaExceeded: number;
    averageUsage: number;
  };
  sessionLimits: {
    maxSessionsReached: number;
    sessionsTerminated: number;
  };
}

export class TurnSecurityService implements ITurnSecurityService {
  private config: TurnSecurityConfig;
  private rateLimitService: RateLimitService | null = null;
  private redisService: RedisService | null = null;

  constructor(config?: Partial<TurnSecurityConfig>) {
    this.config = this.loadSecurityConfig(config);
    this.initializeServices();
  }

  private async initializeServices(): Promise<void> {
    try {
      this.rateLimitService = await getService<RateLimitService>(ServiceKeys.RATE_LIMIT_SERVICE);
      this.redisService = await getService<RedisService>(ServiceKeys.REDIS_SERVICE);
    } catch (error) {
      console.error('Failed to initialize security services:', error);
    }
  }

  private loadSecurityConfig(override?: Partial<TurnSecurityConfig>): TurnSecurityConfig {
    const defaultConfig: TurnSecurityConfig = {
      rateLimiting: {
        credentialRequests: {
          limit: parseInt(Deno.env.get("TURN_CREDENTIAL_RATE_LIMIT") || "10", 10),
          windowSeconds: parseInt(Deno.env.get("TURN_CREDENTIAL_RATE_WINDOW") || "60", 10)
        },
        connectionAttempts: {
          limit: parseInt(Deno.env.get("TURN_CONNECTION_RATE_LIMIT") || "20", 10),
          windowSeconds: parseInt(Deno.env.get("TURN_CONNECTION_RATE_WINDOW") || "300", 10)
        }
      },
      ipRestrictions: {
        enabled: Deno.env.get("TURN_IP_RESTRICTIONS_ENABLED") === "true",
        allowedCidrs: (Deno.env.get("TURN_ALLOWED_CIDRS") || "").split(",").filter(Boolean),
        blockedIps: (Deno.env.get("TURN_BLOCKED_IPS") || "").split(",").filter(Boolean),
        maxConnectionsPerIp: parseInt(Deno.env.get("TURN_MAX_CONNECTIONS_PER_IP") || "5", 10)
      },
      bandwidthQuotas: {
        enabled: Deno.env.get("TURN_BANDWIDTH_QUOTAS_ENABLED") === "true",
        defaultQuotaMbps: parseInt(Deno.env.get("TURN_DEFAULT_QUOTA_MBPS") || "10", 10),
        hostQuotaMbps: parseInt(Deno.env.get("TURN_HOST_QUOTA_MBPS") || "50", 10),
        guestQuotaMbps: parseInt(Deno.env.get("TURN_GUEST_QUOTA_MBPS") || "20", 10),
        quotaWindowSeconds: parseInt(Deno.env.get("TURN_QUOTA_WINDOW_SECONDS") || "3600", 10)
      },
      sessionLimits: {
        maxConcurrentSessions: parseInt(Deno.env.get("TURN_MAX_CONCURRENT_SESSIONS") || "100", 10),
        maxSessionDurationSeconds: parseInt(Deno.env.get("TURN_MAX_SESSION_DURATION") || "43200", 10), // 12 hours
        maxIdleTimeSeconds: parseInt(Deno.env.get("TURN_MAX_IDLE_TIME") || "1800", 10) // 30 minutes
      }
    };

    return { ...defaultConfig, ...override };
  }

  /**
   * Checks if user can request TURN credentials based on rate limits
   */
  async checkCredentialRequestLimit(userId: string, clientIp: string): Promise<boolean> {
    if (!this.rateLimitService) {
      console.warn('Rate limit service not available, allowing request');
      return true;
    }

    try {
      const userKey = `turn:credential:user:${userId}`;
      const ipKey = `turn:credential:ip:${clientIp}`;

      const [userAllowed, ipAllowed] = await Promise.all([
        this.rateLimitService.checkLimit(userKey, {
          limit: this.config.rateLimiting.credentialRequests.limit,
          windowSeconds: this.config.rateLimiting.credentialRequests.windowSeconds
        }),
        this.rateLimitService.checkLimit(ipKey, {
          limit: this.config.rateLimiting.credentialRequests.limit * 2, // More lenient for IP
          windowSeconds: this.config.rateLimiting.credentialRequests.windowSeconds
        })
      ]);

      if (!userAllowed || !ipAllowed) {
        await this.recordSecurityViolation({
          type: 'rate_limit',
          userId,
          clientIp,
          timestamp: new Date(),
          details: `Credential request rate limit exceeded. User: ${!userAllowed}, IP: ${!ipAllowed}`,
          severity: 'medium'
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking credential request limit:', error);
      return true; // Fail open for availability
    }
  }

  /**
   * Checks if user can attempt TURN connection based on rate limits
   */
  async checkConnectionAttemptLimit(userId: string, clientIp: string): Promise<boolean> {
    if (!this.rateLimitService) {
      return true;
    }

    try {
      const userKey = `turn:connection:user:${userId}`;
      const ipKey = `turn:connection:ip:${clientIp}`;

      const [userAllowed, ipAllowed] = await Promise.all([
        this.rateLimitService.checkLimit(userKey, {
          limit: this.config.rateLimiting.connectionAttempts.limit,
          windowSeconds: this.config.rateLimiting.connectionAttempts.windowSeconds
        }),
        this.rateLimitService.checkLimit(ipKey, {
          limit: this.config.rateLimiting.connectionAttempts.limit * 3, // More lenient for IP
          windowSeconds: this.config.rateLimiting.connectionAttempts.windowSeconds
        })
      ]);

      if (!userAllowed || !ipAllowed) {
        await this.recordSecurityViolation({
          type: 'rate_limit',
          userId,
          clientIp,
          timestamp: new Date(),
          details: `Connection attempt rate limit exceeded. User: ${!userAllowed}, IP: ${!ipAllowed}`,
          severity: 'medium'
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking connection attempt limit:', error);
      return true;
    }
  }

  /**
   * Checks if IP address is allowed to access TURN server
   */
  async isIpAllowed(clientIp: string): Promise<boolean> {
    if (!this.config.ipRestrictions.enabled) {
      return true;
    }

    try {
      // Check if IP is temporarily blocked
      if (await this.isIpTemporarilyBlocked(clientIp)) {
        return false;
      }

      // Check permanent block list
      if (this.config.ipRestrictions.blockedIps.includes(clientIp)) {
        await this.recordSecurityViolation({
          type: 'ip_blocked',
          userId: 'unknown',
          clientIp,
          timestamp: new Date(),
          details: `IP ${clientIp} is in permanent block list`,
          severity: 'high'
        });
        return false;
      }

      // Check allowed CIDR ranges if configured
      if (this.config.ipRestrictions.allowedCidrs.length > 0) {
        const isInAllowedRange = this.config.ipRestrictions.allowedCidrs.some(cidr => 
          this.isIpInCidr(clientIp, cidr)
        );

        if (!isInAllowedRange) {
          await this.recordSecurityViolation({
            type: 'ip_blocked',
            userId: 'unknown',
            clientIp,
            timestamp: new Date(),
            details: `IP ${clientIp} not in allowed CIDR ranges`,
            severity: 'medium'
          });
          return false;
        }
      }

      // Check max connections per IP
      if (this.redisService) {
        const connectionKey = `turn:connections:ip:${clientIp}`;
        const currentConnections = await this.redisService.get<number>(connectionKey) || 0;
        
        if (currentConnections >= this.config.ipRestrictions.maxConnectionsPerIp) {
          await this.recordSecurityViolation({
            type: 'session_limit',
            userId: 'unknown',
            clientIp,
            timestamp: new Date(),
            details: `IP ${clientIp} exceeded max connections limit (${currentConnections}/${this.config.ipRestrictions.maxConnectionsPerIp})`,
            severity: 'medium'
          });
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking IP restrictions:', error);
      return true; // Fail open
    }
  }

  /**
   * Checks if user has exceeded bandwidth quota
   */
  async checkBandwidthQuota(userId: string, userType: 'host' | 'guest', bytesUsed: number): Promise<boolean> {
    if (!this.config.bandwidthQuotas.enabled || !this.redisService) {
      return true;
    }

    try {
      const quotaMbps = userType === 'host' 
        ? this.config.bandwidthQuotas.hostQuotaMbps 
        : this.config.bandwidthQuotas.guestQuotaMbps;
      
      const quotaBytes = quotaMbps * 1024 * 1024 * this.config.bandwidthQuotas.quotaWindowSeconds / 8;
      
      const usageKey = `turn:bandwidth:${userId}`;
      const currentUsage = await this.redisService.get<number>(usageKey) || 0;
      const newUsage = currentUsage + bytesUsed;

      if (newUsage > quotaBytes) {
        await this.recordSecurityViolation({
          type: 'bandwidth_exceeded',
          userId,
          clientIp: 'unknown',
          timestamp: new Date(),
          details: `Bandwidth quota exceeded: ${Math.round(newUsage / 1024 / 1024)}MB / ${Math.round(quotaBytes / 1024 / 1024)}MB`,
          severity: 'medium'
        });
        return false;
      }

      // Update usage with TTL
      await this.redisService.set(usageKey, newUsage, this.config.bandwidthQuotas.quotaWindowSeconds);
      return true;
    } catch (error) {
      console.error('Error checking bandwidth quota:', error);
      return true;
    }
  }

  /**
   * Checks session limits for user
   */
  async checkSessionLimits(userId: string): Promise<boolean> {
    if (!this.redisService) {
      return true;
    }

    try {
      const sessionKey = `turn:sessions:${userId}`;
      const currentSessions = await this.redisService.get<number>(sessionKey) || 0;

      if (currentSessions >= this.config.sessionLimits.maxConcurrentSessions) {
        await this.recordSecurityViolation({
          type: 'session_limit',
          userId,
          clientIp: 'unknown',
          timestamp: new Date(),
          details: `Max concurrent sessions exceeded: ${currentSessions}/${this.config.sessionLimits.maxConcurrentSessions}`,
          severity: 'medium'
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking session limits:', error);
      return true;
    }
  }

  /**
   * Records a security violation for monitoring and analysis
   */
  async recordSecurityViolation(violation: SecurityViolation): Promise<void> {
    try {
      if (this.redisService) {
        const violationKey = `turn:violations:${Date.now()}:${crypto.randomUUID()}`;
        await this.redisService.set(violationKey, JSON.stringify(violation), 86400); // 24 hours TTL

        // Update violation counters
        const typeKey = `turn:violations:count:${violation.type}`;
        const severityKey = `turn:violations:severity:${violation.severity}`;
        
        await Promise.all([
          this.redisService.incr(typeKey, 86400),
          this.redisService.incr(severityKey, 86400)
        ]);
      }

      // Log violation
      console.warn('TURN Security Violation:', {
        type: violation.type,
        userId: violation.userId,
        clientIp: violation.clientIp,
        severity: violation.severity,
        details: violation.details
      });

      // Auto-block IP for critical violations
      if (violation.severity === 'critical') {
        await this.blockIpTemporarily(violation.clientIp, 3600, `Critical security violation: ${violation.details}`);
      }
    } catch (error) {
      console.error('Error recording security violation:', error);
    }
  }

  /**
   * Gets security metrics for monitoring
   */
  async getSecurityMetrics(timeRangeSeconds = 3600): Promise<SecurityMetrics> {
    const defaultMetrics: SecurityMetrics = {
      violations: { total: 0, byType: {}, bySeverity: {} },
      rateLimiting: { credentialRequestsBlocked: 0, connectionAttemptsBlocked: 0 },
      ipRestrictions: { blockedIps: 0, temporaryBlocks: 0 },
      bandwidthQuotas: { quotaExceeded: 0, averageUsage: 0 },
      sessionLimits: { maxSessionsReached: 0, sessionsTerminated: 0 }
    };

    if (!this.redisService) {
      return defaultMetrics;
    }

    try {
      // Get violation counts by type and severity
      const violationTypes = ['rate_limit', 'ip_blocked', 'bandwidth_exceeded', 'session_limit', 'suspicious_activity'];
      const severityLevels = ['low', 'medium', 'high', 'critical'];

      const [typeCountsPromises, severityCountsPromises] = [
        violationTypes.map(type => this.redisService!.get<number>(`turn:violations:count:${type}`)),
        severityLevels.map(severity => this.redisService!.get<number>(`turn:violations:severity:${severity}`))
      ];

      const [typeCounts, severityCounts] = await Promise.all([
        Promise.all(typeCountsPromises),
        Promise.all(severityCountsPromises)
      ]);

      // Build metrics
      const metrics: SecurityMetrics = {
        violations: {
          total: severityCounts.reduce((sum, count) => sum + (count || 0), 0),
          byType: {},
          bySeverity: {}
        },
        rateLimiting: {
          credentialRequestsBlocked: typeCounts[0] || 0,
          connectionAttemptsBlocked: typeCounts[0] || 0
        },
        ipRestrictions: {
          blockedIps: typeCounts[1] || 0,
          temporaryBlocks: 0 // TODO: Count temporary blocks
        },
        bandwidthQuotas: {
          quotaExceeded: typeCounts[2] || 0,
          averageUsage: 0 // TODO: Calculate average usage
        },
        sessionLimits: {
          maxSessionsReached: typeCounts[3] || 0,
          sessionsTerminated: 0 // TODO: Count terminated sessions
        }
      };

      // Fill in type and severity breakdowns
      violationTypes.forEach((type, index) => {
        metrics.violations.byType[type] = typeCounts[index] || 0;
      });

      severityLevels.forEach((severity, index) => {
        metrics.violations.bySeverity[severity] = severityCounts[index] || 0;
      });

      return metrics;
    } catch (error) {
      console.error('Error getting security metrics:', error);
      return defaultMetrics;
    }
  }

  /**
   * Temporarily blocks an IP address
   */
  async blockIpTemporarily(clientIp: string, durationSeconds: number, reason: string): Promise<void> {
    if (!this.redisService) {
      return;
    }

    try {
      const blockKey = `turn:blocked:ip:${clientIp}`;
      const blockInfo = {
        blockedAt: new Date().toISOString(),
        reason,
        durationSeconds
      };

      await this.redisService.set(blockKey, JSON.stringify(blockInfo), durationSeconds);
      console.warn(`Temporarily blocked IP ${clientIp} for ${durationSeconds}s: ${reason}`);
    } catch (error) {
      console.error('Error blocking IP temporarily:', error);
    }
  }

  /**
   * Checks if IP is temporarily blocked
   */
  async isIpTemporarilyBlocked(clientIp: string): Promise<boolean> {
    if (!this.redisService) {
      return false;
    }

    try {
      const blockKey = `turn:blocked:ip:${clientIp}`;
      const blockInfo = await this.redisService.get<string>(blockKey);
      return blockInfo !== null;
    } catch (error) {
      console.error('Error checking IP block status:', error);
      return false;
    }
  }

  /**
   * Checks if IP is in CIDR range
   */
  private isIpInCidr(ip: string, cidr: string): boolean {
    try {
      // Simple CIDR check - in production, use a proper IP library
      const [network, prefixLength] = cidr.split('/');
      const prefix = parseInt(prefixLength, 10);
      
      // Convert IPs to numbers for comparison
      const ipNum = this.ipToNumber(ip);
      const networkNum = this.ipToNumber(network);
      const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
      
      return (ipNum & mask) === (networkNum & mask);
    } catch (error) {
      console.error('Error checking CIDR:', error);
      return false;
    }
  }

  /**
   * Converts IP address to number
   */
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }
}

/**
 * Factory function to create TurnSecurityService
 */
export function createTurnSecurityService(config?: Partial<TurnSecurityConfig>): TurnSecurityService {
  return new TurnSecurityService(config);
}