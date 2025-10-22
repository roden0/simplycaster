/**
 * Session Cleanup Utilities
 * 
 * Provides utilities for session cleanup operations that can be run
 * manually or as scheduled tasks.
 */

import { SessionService } from '../../domain/services/session-service.ts';
import { RedisService } from '../../domain/services/redis-service.ts';
import { UserRepository } from '../../domain/repositories/user-repository.ts';

export interface CleanupOptions {
  dryRun?: boolean; // If true, only report what would be cleaned
  batchSize?: number; // Number of sessions to process per batch
  maxAge?: number; // Maximum age in seconds for sessions to keep
  inactiveUserCleanup?: boolean; // Whether to cleanup sessions for inactive users
}

export interface CleanupResult {
  expiredSessions: number;
  inactiveUserSessions: number;
  orphanedSessions: number;
  totalCleaned: number;
  errors: string[];
  duration: number;
}

export class SessionCleanupService {
  private sessionService: SessionService;
  private redisService: RedisService;
  private userRepository: UserRepository;

  constructor(
    sessionService: SessionService,
    redisService: RedisService,
    userRepository: UserRepository
  ) {
    this.sessionService = sessionService;
    this.redisService = redisService;
    this.userRepository = userRepository;
  }

  /**
   * Run comprehensive session cleanup
   */
  async runCleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      expiredSessions: 0,
      inactiveUserSessions: 0,
      orphanedSessions: 0,
      totalCleaned: 0,
      errors: [],
      duration: 0
    };

    try {
      console.log('Starting session cleanup...', options.dryRun ? '(DRY RUN)' : '');

      // 1. Clean up expired sessions
      result.expiredSessions = await this.cleanupExpiredSessions(options);

      // 2. Clean up sessions for inactive users
      if (options.inactiveUserCleanup) {
        result.inactiveUserSessions = await this.cleanupInactiveUserSessions(options);
      }

      // 3. Clean up orphaned sessions (sessions without valid users)
      result.orphanedSessions = await this.cleanupOrphanedSessions(options);

      result.totalCleaned = result.expiredSessions + result.inactiveUserSessions + result.orphanedSessions;
      result.duration = Date.now() - startTime;

      console.log(`Session cleanup completed in ${result.duration}ms:`, {
        expired: result.expiredSessions,
        inactive: result.inactiveUserSessions,
        orphaned: result.orphanedSessions,
        total: result.totalCleaned,
        errors: result.errors.length
      });

    } catch (error) {
      result.errors.push(`Cleanup failed: ${error.message}`);
      console.error('Session cleanup failed:', error);
    }

    return result;
  }

  /**
   * Clean up expired sessions
   */
  private async cleanupExpiredSessions(options: CleanupOptions): Promise<number> {
    try {
      if (options.dryRun) {
        // For dry run, count sessions that would be cleaned
        const sessionKeys = await this.redisService.keys('session:*');
        let expiredCount = 0;

        for (const key of sessionKeys) {
          const ttl = await this.redisService.ttl(key);
          if (ttl === -2 || ttl === -1) { // Expired or no expiration
            expiredCount++;
          }
        }

        console.log(`[DRY RUN] Would clean ${expiredCount} expired sessions`);
        return expiredCount;
      }

      return await this.sessionService.cleanupExpiredSessions();
    } catch (error) {
      console.error('Failed to cleanup expired sessions:', error);
      return 0;
    }
  }

  /**
   * Clean up sessions for inactive users
   */
  private async cleanupInactiveUserSessions(options: CleanupOptions): Promise<number> {
    let cleanedCount = 0;

    try {
      // Get all session keys
      const sessionKeys = await this.redisService.keys('session:*');
      const batchSize = options.batchSize || 50;

      for (let i = 0; i < sessionKeys.length; i += batchSize) {
        const batch = sessionKeys.slice(i, i + batchSize);
        
        for (const sessionKey of batch) {
          try {
            const sessionData = await this.redisService.hgetall<string>(sessionKey);
            
            if (!sessionData || !sessionData.userId) {
              continue;
            }

            // Check if user is still active
            const userResult = await this.userRepository.findById(sessionData.userId);
            
            if (!userResult.success || !userResult.data || !userResult.data.isActive) {
              if (options.dryRun) {
                console.log(`[DRY RUN] Would clean session for inactive user: ${sessionData.userId}`);
                cleanedCount++;
              } else {
                await this.redisService.del(sessionKey);
                cleanedCount++;
              }
            }
          } catch (error) {
            console.error(`Error processing session ${sessionKey}:`, error);
          }
        }

        // Small delay between batches to avoid overwhelming the system
        if (i + batchSize < sessionKeys.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      if (!options.dryRun) {
        console.log(`Cleaned ${cleanedCount} sessions for inactive users`);
      }

    } catch (error) {
      console.error('Failed to cleanup inactive user sessions:', error);
    }

    return cleanedCount;
  }

  /**
   * Clean up orphaned sessions (sessions without valid users)
   */
  private async cleanupOrphanedSessions(options: CleanupOptions): Promise<number> {
    let cleanedCount = 0;

    try {
      const sessionKeys = await this.redisService.keys('session:*');
      const batchSize = options.batchSize || 50;

      for (let i = 0; i < sessionKeys.length; i += batchSize) {
        const batch = sessionKeys.slice(i, i + batchSize);
        
        for (const sessionKey of batch) {
          try {
            const sessionData = await this.redisService.hgetall<string>(sessionKey);
            
            if (!sessionData || !sessionData.userId) {
              // Session without user ID is orphaned
              if (options.dryRun) {
                console.log(`[DRY RUN] Would clean orphaned session: ${sessionKey}`);
                cleanedCount++;
              } else {
                await this.redisService.del(sessionKey);
                cleanedCount++;
              }
              continue;
            }

            // Check if user exists
            const userResult = await this.userRepository.findById(sessionData.userId);
            
            if (!userResult.success || !userResult.data) {
              // User doesn't exist, session is orphaned
              if (options.dryRun) {
                console.log(`[DRY RUN] Would clean orphaned session for non-existent user: ${sessionData.userId}`);
                cleanedCount++;
              } else {
                await this.redisService.del(sessionKey);
                cleanedCount++;
              }
            }
          } catch (error) {
            console.error(`Error processing session ${sessionKey}:`, error);
          }
        }

        // Small delay between batches
        if (i + batchSize < sessionKeys.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      if (!options.dryRun) {
        console.log(`Cleaned ${cleanedCount} orphaned sessions`);
      }

    } catch (error) {
      console.error('Failed to cleanup orphaned sessions:', error);
    }

    return cleanedCount;
  }

  /**
   * Get session cleanup statistics
   */
  async getCleanupStats(): Promise<{
    totalSessions: number;
    expiredSessions: number;
    activeSessions: number;
    oldestSession: Date | null;
    newestSession: Date | null;
  }> {
    try {
      const sessionKeys = await this.redisService.keys('session:*');
      let expiredCount = 0;
      let activeCount = 0;
      let oldestTime: number | null = null;
      let newestTime: number | null = null;

      for (const key of sessionKeys.slice(0, 100)) { // Sample for performance
        const ttl = await this.redisService.ttl(key);
        
        if (ttl === -2) {
          expiredCount++;
        } else if (ttl > 0) {
          activeCount++;
        }

        // Get session creation time
        const sessionData = await this.redisService.hgetall<string>(key);
        if (sessionData && sessionData.loginTime) {
          const loginTime = new Date(sessionData.loginTime).getTime();
          
          if (oldestTime === null || loginTime < oldestTime) {
            oldestTime = loginTime;
          }
          
          if (newestTime === null || loginTime > newestTime) {
            newestTime = loginTime;
          }
        }
      }

      // Estimate for all sessions if we sampled
      if (sessionKeys.length > 100) {
        const ratio = sessionKeys.length / 100;
        expiredCount = Math.round(expiredCount * ratio);
        activeCount = Math.round(activeCount * ratio);
      }

      return {
        totalSessions: sessionKeys.length,
        expiredSessions: expiredCount,
        activeSessions: activeCount,
        oldestSession: oldestTime ? new Date(oldestTime) : null,
        newestSession: newestTime ? new Date(newestTime) : null
      };

    } catch (error) {
      console.error('Failed to get cleanup stats:', error);
      return {
        totalSessions: 0,
        expiredSessions: 0,
        activeSessions: 0,
        oldestSession: null,
        newestSession: null
      };
    }
  }
}