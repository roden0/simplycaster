/**
 * Rate Limiting Service Interface
 * 
 * Defines the contract for rate limiting operations using sliding window algorithm.
 * Supports per-user, per-IP, and per-endpoint rate limiting with configurable policies.
 */

export interface RateLimitService {
  /**
   * Check if a request is within rate limits
   * @param identifier - Unique identifier (user ID, IP address, etc.)
   * @param limit - Maximum number of requests allowed in the window
   * @param windowSeconds - Time window in seconds
   * @returns Rate limit result with allowed status and metadata
   */
  checkLimit(identifier: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;

  /**
   * Reset rate limit counter for an identifier
   * @param identifier - Unique identifier to reset
   */
  resetLimit(identifier: string): Promise<void>;

  /**
   * Get remaining requests for an identifier
   * @param identifier - Unique identifier
   * @param limit - Maximum number of requests allowed
   * @param windowSeconds - Time window in seconds
   * @returns Number of remaining requests
   */
  getRemainingRequests(identifier: string, limit: number, windowSeconds: number): Promise<number>;

  /**
   * Check rate limit for a specific endpoint and user combination
   * @param endpoint - API endpoint path
   * @param identifier - User/IP identifier
   * @param userRole - User role for role-based limits
   * @returns Rate limit result
   */
  checkEndpointLimit(endpoint: string, identifier: string, userRole?: string): Promise<RateLimitResult>;

  /**
   * Get rate limit configuration for an endpoint
   * @param endpoint - API endpoint path
   * @param userRole - User role for role-based limits
   * @returns Rate limit configuration
   */
  getEndpointConfig(endpoint: string, userRole?: string): RateLimitConfig;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  totalHits: number;
  retryAfter?: number; // Seconds until next request is allowed
}

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
  skipForAdmin?: boolean;
}

export interface RateLimitPolicy {
  endpoint: string;
  defaultLimit: number;
  defaultWindow: number;
  roleOverrides?: {
    [role: string]: {
      limit: number;
      window: number;
    };
  };
  skipForAdmin?: boolean;
}

/**
 * Rate limiting error thrown when limits are exceeded
 */
export class RateLimitExceededError extends Error {
  constructor(
    public readonly retryAfter: number,
    public readonly limit: number,
    public readonly resetTime: Date,
    message?: string
  ) {
    super(message || `Rate limit exceeded. Try again in ${retryAfter} seconds.`);
    this.name = 'RateLimitExceededError';
  }
}