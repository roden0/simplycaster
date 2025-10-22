/**
 * Rate Limiting Service Implementation
 * 
 * Implements sliding window rate limiting using Redis sorted sets.
 * Supports configurable policies per endpoint and user role.
 */

import { RedisService } from '../../domain/services/redis-service.ts';
import { 
  RateLimitService, 
  RateLimitResult, 
  RateLimitConfig, 
  RateLimitPolicy,
  RateLimitExceededError 
} from '../../domain/services/rate-limit-service.ts';
import { RateLimitConfigManager, RateLimitConfigManagerImpl } from './rate-limit-config-manager.ts';

export class RateLimitServiceImpl implements RateLimitService {
  private redisService: RedisService;
  private keyPrefix: string;
  private configManager: RateLimitConfigManager;
  private defaultConfig: RateLimitConfig;

  constructor(
    redisService: RedisService,
    keyPrefix: string = 'rate_limit',
    defaultConfig: RateLimitConfig = { limit: 100, windowSeconds: 3600 }
  ) {
    this.redisService = redisService;
    this.keyPrefix = keyPrefix;
    this.defaultConfig = defaultConfig;
    this.configManager = new RateLimitConfigManagerImpl(defaultConfig);
    
    // Load policies from environment if available
    this.configManager.loadPoliciesFromEnvironment();
  }

  /**
   * Add or update a rate limiting policy
   */
  public addPolicy(policy: RateLimitPolicy): void {
    this.configManager.setPolicy(policy);
  }

  /**
   * Remove a rate limiting policy
   */
  public removePolicy(endpoint: string): void {
    this.configManager.removePolicy(endpoint);
  }

  /**
   * Get all configured policies
   */
  public getAllPolicies(): RateLimitPolicy[] {
    return this.configManager.getAllPolicies();
  }

  /**
   * Load policies from configuration
   */
  public loadPolicies(policies: RateLimitPolicy[]): void {
    this.configManager.loadPolicies(policies);
  }

  /**
   * Generate Redis key for rate limiting
   */
  private getRateLimitKey(identifier: string, context?: string): string {
    const parts = [this.keyPrefix, identifier];
    if (context) {
      parts.push(context);
    }
    return parts.join(':');
  }

  /**
   * Implement sliding window rate limiting using Redis sorted sets
   */
  async checkLimit(identifier: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const key = this.getRateLimitKey(identifier);
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);

    try {
      // Use Redis pipeline for atomic operations
      const client = (this.redisService as any).getClient?.() || this.redisService;
      
      // For Redis implementations that support multi/exec
      if (client.multi) {
        const multi = client.multi();
        
        // Remove expired entries
        multi.zRemRangeByScore(key, 0, windowStart);
        
        // Count current requests in window
        multi.zCard(key);
        
        // Add current request
        multi.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
        
        // Set expiration for cleanup
        multi.expire(key, windowSeconds + 60);
        
        const results = await multi.exec();
        const currentCount = (results[1] as number) + 1; // +1 for the request we just added
        
        const allowed = currentCount <= limit;
        const remaining = Math.max(0, limit - currentCount);
        const resetTime = new Date(now + (windowSeconds * 1000));
        
        return {
          allowed,
          remaining,
          resetTime,
          totalHits: currentCount,
          retryAfter: allowed ? undefined : Math.ceil(windowSeconds)
        };
      } else {
        // Fallback for simpler Redis implementations
        const currentCount = await this.redisService.incrementCounter(key, windowSeconds);
        const allowed = currentCount <= limit;
        const remaining = Math.max(0, limit - currentCount);
        const resetTime = new Date(now + (windowSeconds * 1000));
        
        return {
          allowed,
          remaining,
          resetTime,
          totalHits: currentCount,
          retryAfter: allowed ? undefined : Math.ceil(windowSeconds)
        };
      }
    } catch (error) {
      console.error(`Rate limiting error for ${identifier}:`, error);
      
      // On Redis error, allow the request but log the issue
      return {
        allowed: true,
        remaining: limit - 1,
        resetTime: new Date(now + (windowSeconds * 1000)),
        totalHits: 1
      };
    }
  }

  async resetLimit(identifier: string): Promise<void> {
    const key = this.getRateLimitKey(identifier);
    try {
      await this.redisService.del(key);
    } catch (error) {
      console.error(`Error resetting rate limit for ${identifier}:`, error);
      throw error;
    }
  }

  async getRemainingRequests(identifier: string, limit: number, windowSeconds: number): Promise<number> {
    const result = await this.checkLimit(identifier, limit, windowSeconds);
    return result.remaining;
  }

  async checkEndpointLimit(endpoint: string, identifier: string, userRole?: string): Promise<RateLimitResult> {
    const config = this.getEndpointConfig(endpoint, userRole);
    
    // Skip rate limiting for admin users if configured
    if (config.skipForAdmin && userRole === 'admin') {
      return {
        allowed: true,
        remaining: config.limit,
        resetTime: new Date(Date.now() + (config.windowSeconds * 1000)),
        totalHits: 0
      };
    }

    const contextKey = `${endpoint}:${identifier}`;
    return this.checkLimit(contextKey, config.limit, config.windowSeconds);
  }

  getEndpointConfig(endpoint: string, userRole?: string): RateLimitConfig {
    return this.configManager.getEffectiveConfig(endpoint, userRole);
  }



  /**
   * Get rate limiting statistics for monitoring
   */
  async getStats(identifier: string): Promise<{
    activeWindows: number;
    totalRequests: number;
    oldestRequest: Date | null;
    newestRequest: Date | null;
  }> {
    const key = this.getRateLimitKey(identifier);
    
    try {
      const client = (this.redisService as any).getClient?.() || this.redisService;
      
      if (client.zCard && client.zRange) {
        const totalRequests = await client.zCard(key);
        
        if (totalRequests === 0) {
          return {
            activeWindows: 0,
            totalRequests: 0,
            oldestRequest: null,
            newestRequest: null
          };
        }
        
        const oldest = await client.zRange(key, 0, 0, { withScores: true });
        const newest = await client.zRange(key, -1, -1, { withScores: true });
        
        return {
          activeWindows: 1, // Simplified - could be enhanced to track multiple windows
          totalRequests,
          oldestRequest: oldest.length > 0 ? new Date(oldest[0].score) : null,
          newestRequest: newest.length > 0 ? new Date(newest[0].score) : null
        };
      }
      
      // Fallback for simpler implementations
      return {
        activeWindows: 1,
        totalRequests: 0,
        oldestRequest: null,
        newestRequest: null
      };
    } catch (error) {
      console.error(`Error getting rate limit stats for ${identifier}:`, error);
      return {
        activeWindows: 0,
        totalRequests: 0,
        oldestRequest: null,
        newestRequest: null
      };
    }
  }
}