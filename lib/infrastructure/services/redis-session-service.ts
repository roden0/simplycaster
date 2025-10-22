/**
 * Redis Session Service Implementation
 * 
 * Concrete implementation of SessionService interface using Redis
 * for session storage with TTL management and cleanup operations.
 */

import { RedisService } from '../../domain/services/redis-service.ts';
import { 
  SessionService, 
  SessionData, 
  SessionValidationResult, 
  SessionConfig 
} from '../../domain/services/session-service.ts';

export class RedisSessionService implements SessionService {
  private redisService: RedisService;
  private config: SessionConfig;
  private keyPrefix: string = 'session';
  private userSessionsPrefix: string = 'user_sessions';

  constructor(redisService: RedisService, config: SessionConfig) {
    this.redisService = redisService;
    this.config = config;
  }

  /**
   * Generate session key
   */
  private getSessionKey(sessionId: string): string {
    return `${this.keyPrefix}:${sessionId}`;
  }

  /**
   * Generate user sessions key
   */
  private getUserSessionsKey(userId: string): string {
    return `${this.userSessionsPrefix}:${userId}`;
  }

  /**
   * Serialize session data for storage
   */
  private serializeSessionData(data: SessionData): Record<string, string> {
    return {
      userId: data.userId,
      email: data.email,
      role: data.role,
      isActive: data.isActive.toString(),
      emailVerified: data.emailVerified.toString(),
      loginTime: data.loginTime.toISOString(),
      lastActivity: data.lastActivity.toISOString(),
      ipAddress: data.ipAddress || '',
      userAgent: data.userAgent || ''
    };
  }

  /**
   * Deserialize session data from storage
   */
  private deserializeSessionData(data: Record<string, string>): SessionData {
    return {
      userId: data.userId,
      email: data.email,
      role: data.role,
      isActive: data.isActive === 'true',
      emailVerified: data.emailVerified === 'true',
      loginTime: new Date(data.loginTime),
      lastActivity: new Date(data.lastActivity),
      ipAddress: data.ipAddress || undefined,
      userAgent: data.userAgent || undefined
    };
  }

  async createSession(sessionId: string, data: SessionData, ttlSeconds?: number): Promise<void> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const userSessionsKey = this.getUserSessionsKey(data.userId);
      const ttl = ttlSeconds || this.config.defaultTTL;

      // Ensure TTL doesn't exceed maximum
      const finalTTL = Math.min(ttl, this.config.maxTTL);

      // Store session data as hash
      const serializedData = this.serializeSessionData(data);
      for (const [field, value] of Object.entries(serializedData)) {
        await this.redisService.hset(sessionKey, field, value);
      }

      // Set TTL for session
      await this.redisService.expire(sessionKey, finalTTL);

      // Add session to user's session set
      await this.redisService.sadd(userSessionsKey, sessionId);
      await this.redisService.expire(userSessionsKey, finalTTL + 60); // Extra buffer for cleanup

    } catch (error) {
      console.error(`Failed to create session ${sessionId}:`, error);
      throw new Error('Failed to create session');
    }
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const sessionHash = await this.redisService.hgetall<string>(sessionKey);

      if (!sessionHash || Object.keys(sessionHash).length === 0) {
        return null;
      }

      return this.deserializeSessionData(sessionHash);
    } catch (error) {
      console.error(`Failed to get session ${sessionId}:`, error);
      return null;
    }
  }

  async validateSession(sessionId: string): Promise<SessionValidationResult> {
    try {
      const sessionData = await this.getSession(sessionId);

      if (!sessionData) {
        return {
          success: false,
          error: 'Session not found or expired'
        };
      }

      // Check if user is still active
      if (!sessionData.isActive) {
        await this.invalidateSession(sessionId);
        return {
          success: false,
          error: 'User account is inactive'
        };
      }

      // Update last activity and refresh session if needed
      const now = new Date();
      const sessionKey = this.getSessionKey(sessionId);
      const currentTTL = await this.redisService.ttl(sessionKey);

      // Refresh session if TTL is below threshold
      if (currentTTL > 0 && currentTTL < this.config.refreshThreshold) {
        await this.refreshSession(sessionId);
      }

      // Update last activity
      sessionData.lastActivity = now;
      await this.redisService.hset(sessionKey, 'lastActivity', now.toISOString());

      return {
        success: true,
        data: sessionData
      };
    } catch (error) {
      console.error(`Failed to validate session ${sessionId}:`, error);
      return {
        success: false,
        error: 'Session validation failed'
      };
    }
  }

  async updateSession(sessionId: string, data: Partial<SessionData>): Promise<void> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const existingSession = await this.getSession(sessionId);

      if (!existingSession) {
        throw new Error('Session not found');
      }

      // Merge with existing data
      const updatedData = { ...existingSession, ...data };
      updatedData.lastActivity = new Date();

      // Update session data
      const serializedData = this.serializeSessionData(updatedData);
      for (const [field, value] of Object.entries(serializedData)) {
        await this.redisService.hset(sessionKey, field, value);
      }

      // Refresh TTL
      await this.refreshSession(sessionId);
    } catch (error) {
      console.error(`Failed to update session ${sessionId}:`, error);
      throw new Error('Failed to update session');
    }
  }

  async refreshSession(sessionId: string, ttlSeconds?: number): Promise<void> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const ttl = ttlSeconds || this.config.defaultTTL;
      const finalTTL = Math.min(ttl, this.config.maxTTL);

      await this.redisService.expire(sessionKey, finalTTL);
    } catch (error) {
      console.error(`Failed to refresh session ${sessionId}:`, error);
      throw new Error('Failed to refresh session');
    }
  }

  async invalidateSession(sessionId: string): Promise<void> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      
      // Get session data to find user ID
      const sessionData = await this.getSession(sessionId);
      
      // Delete session
      await this.redisService.del(sessionKey);

      // Remove from user's session set
      if (sessionData) {
        const userSessionsKey = this.getUserSessionsKey(sessionData.userId);
        await this.redisService.srem(userSessionsKey, sessionId);
      }
    } catch (error) {
      console.error(`Failed to invalidate session ${sessionId}:`, error);
      throw new Error('Failed to invalidate session');
    }
  }

  async invalidateUserSessions(userId: string): Promise<void> {
    try {
      const userSessionsKey = this.getUserSessionsKey(userId);
      const sessionIds = await this.redisService.smembers(userSessionsKey);

      // Delete all user sessions
      for (const sessionId of sessionIds) {
        const sessionKey = this.getSessionKey(sessionId);
        await this.redisService.del(sessionKey);
      }

      // Clear user sessions set
      await this.redisService.del(userSessionsKey);
    } catch (error) {
      console.error(`Failed to invalidate user sessions for ${userId}:`, error);
      throw new Error('Failed to invalidate user sessions');
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      let cleanedCount = 0;
      const pattern = `${this.keyPrefix}:*`;
      const sessionKeys = await this.redisService.keys(pattern);

      for (const sessionKey of sessionKeys) {
        const ttl = await this.redisService.ttl(sessionKey);
        
        // If TTL is -2, key doesn't exist (already expired)
        // If TTL is -1, key exists but has no expiration (shouldn't happen)
        if (ttl === -2 || ttl === -1) {
          await this.redisService.del(sessionKey);
          cleanedCount++;
        }
      }

      // Also cleanup user session sets
      const userSessionPattern = `${this.userSessionsPrefix}:*`;
      const userSessionKeys = await this.redisService.keys(userSessionPattern);

      for (const userSessionKey of userSessionKeys) {
        const sessionIds = await this.redisService.smembers(userSessionKey);
        const validSessionIds: string[] = [];

        for (const sessionId of sessionIds) {
          const sessionKey = this.getSessionKey(sessionId);
          const exists = await this.redisService.exists(sessionKey);
          
          if (exists) {
            validSessionIds.push(sessionId);
          } else {
            cleanedCount++;
          }
        }

        // Update user session set with only valid sessions
        if (validSessionIds.length !== sessionIds.length) {
          await this.redisService.del(userSessionKey);
          if (validSessionIds.length > 0) {
            for (const sessionId of validSessionIds) {
              await this.redisService.sadd(userSessionKey, sessionId);
            }
          }
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup expired sessions:', error);
      throw new Error('Failed to cleanup expired sessions');
    }
  }

  async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const userSessionsKey = this.getUserSessionsKey(userId);
      const sessionIds = await this.redisService.smembers(userSessionsKey);
      const sessions: SessionData[] = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.getSession(sessionId);
        if (sessionData) {
          sessions.push(sessionData);
        }
      }

      return sessions;
    } catch (error) {
      console.error(`Failed to get user sessions for ${userId}:`, error);
      return [];
    }
  }

  async sessionExists(sessionId: string): Promise<boolean> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      return await this.redisService.exists(sessionKey);
    } catch (error) {
      console.error(`Failed to check session existence ${sessionId}:`, error);
      return false;
    }
  }

  async getSessionTTL(sessionId: string): Promise<number> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      return await this.redisService.ttl(sessionKey);
    } catch (error) {
      console.error(`Failed to get session TTL ${sessionId}:`, error);
      return -1;
    }
  }
}