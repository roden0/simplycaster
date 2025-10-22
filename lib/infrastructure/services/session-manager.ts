/**
 * Session Manager
 * 
 * Handles session cleanup, monitoring, and health checks.
 * Provides background tasks for session maintenance.
 */

import { SessionService } from '../../domain/services/session-service.ts';
import { RedisService } from '../../domain/services/redis-service.ts';

export interface SessionManagerConfig {
  cleanupInterval: number; // Interval in milliseconds
  healthCheckInterval: number; // Interval in milliseconds
  maxCleanupBatchSize: number; // Maximum sessions to cleanup per batch
  enableAutoCleanup: boolean; // Whether to enable automatic cleanup
}

export interface SessionStats {
  totalSessions: number;
  expiredSessions: number;
  activeSessions: number;
  cleanupRuns: number;
  lastCleanupTime: Date | null;
  lastHealthCheckTime: Date | null;
}

export class SessionManager {
  private sessionService: SessionService;
  private redisService: RedisService;
  private config: SessionManagerConfig;
  private cleanupTimer: number | null = null;
  private healthCheckTimer: number | null = null;
  private stats: SessionStats;
  private isRunning: boolean = false;

  constructor(
    sessionService: SessionService,
    redisService: RedisService,
    config: SessionManagerConfig
  ) {
    this.sessionService = sessionService;
    this.redisService = redisService;
    this.config = config;
    this.stats = {
      totalSessions: 0,
      expiredSessions: 0,
      activeSessions: 0,
      cleanupRuns: 0,
      lastCleanupTime: null,
      lastHealthCheckTime: null
    };
  }

  /**
   * Start the session manager background tasks
   */
  start(): void {
    if (this.isRunning) {
      console.warn('Session manager is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting session manager...');

    if (this.config.enableAutoCleanup) {
      this.startCleanupTask();
    }

    this.startHealthCheckTask();
  }

  /**
   * Stop the session manager background tasks
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('Stopping session manager...');

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Start automatic cleanup task
   */
  private startCleanupTask(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.runCleanup();
      } catch (error) {
        console.error('Session cleanup error:', error);
      }
    }, this.config.cleanupInterval);

    console.log(`Session cleanup task started (interval: ${this.config.cleanupInterval}ms)`);
  }

  /**
   * Start health check task
   */
  private startHealthCheckTask(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.runHealthCheck();
      } catch (error) {
        console.error('Session health check error:', error);
      }
    }, this.config.healthCheckInterval);

    console.log(`Session health check task started (interval: ${this.config.healthCheckInterval}ms)`);
  }

  /**
   * Run session cleanup
   */
  async runCleanup(): Promise<number> {
    try {
      const cleanedCount = await this.sessionService.cleanupExpiredSessions();
      
      this.stats.cleanupRuns++;
      this.stats.expiredSessions += cleanedCount;
      this.stats.lastCleanupTime = new Date();

      if (cleanedCount > 0) {
        console.log(`Session cleanup completed: ${cleanedCount} expired sessions removed`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Failed to run session cleanup:', error);
      throw error;
    }
  }

  /**
   * Run health check
   */
  async runHealthCheck(): Promise<boolean> {
    try {
      // Check Redis connectivity
      const redisHealthy = await this.redisService.ping();
      
      if (!redisHealthy) {
        console.error('Session health check failed: Redis is not responding');
        return false;
      }

      // Update session statistics
      await this.updateSessionStats();
      
      this.stats.lastHealthCheckTime = new Date();
      
      return true;
    } catch (error) {
      console.error('Session health check failed:', error);
      return false;
    }
  }

  /**
   * Update session statistics
   */
  private async updateSessionStats(): Promise<void> {
    try {
      // Count total sessions by scanning session keys
      const sessionKeys = await this.redisService.keys('session:*');
      this.stats.totalSessions = sessionKeys.length;
      
      // Active sessions are those that exist and haven't expired
      let activeSessions = 0;
      for (const key of sessionKeys.slice(0, 100)) { // Sample first 100 for performance
        const ttl = await this.redisService.ttl(key);
        if (ttl > 0) {
          activeSessions++;
        }
      }
      
      // Estimate active sessions based on sample
      if (sessionKeys.length > 100) {
        this.stats.activeSessions = Math.round((activeSessions / 100) * sessionKeys.length);
      } else {
        this.stats.activeSessions = activeSessions;
      }
      
    } catch (error) {
      console.error('Failed to update session stats:', error);
    }
  }

  /**
   * Get current session statistics
   */
  getStats(): SessionStats {
    return { ...this.stats };
  }

  /**
   * Force cleanup of expired sessions
   */
  async forceCleanup(): Promise<number> {
    console.log('Running forced session cleanup...');
    return await this.runCleanup();
  }

  /**
   * Get detailed session information for monitoring
   */
  async getSessionInfo(): Promise<{
    stats: SessionStats;
    redisHealth: boolean;
    uptime: number;
  }> {
    const redisHealth = await this.redisService.ping();
    
    return {
      stats: this.getStats(),
      redisHealth,
      uptime: this.isRunning ? Date.now() : 0
    };
  }

  /**
   * Invalidate sessions for inactive users
   */
  async invalidateInactiveUserSessions(userId: string): Promise<void> {
    try {
      await this.sessionService.invalidateUserSessions(userId);
      console.log(`Invalidated all sessions for inactive user: ${userId}`);
    } catch (error) {
      console.error(`Failed to invalidate sessions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get session count for a specific user
   */
  async getUserSessionCount(userId: string): Promise<number> {
    try {
      const sessions = await this.sessionService.getUserSessions(userId);
      return sessions.length;
    } catch (error) {
      console.error(`Failed to get session count for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Check if session manager is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}