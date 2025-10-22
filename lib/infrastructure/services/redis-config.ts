/**
 * Redis Configuration Interface and Environment Variable Parsing
 * 
 * Provides configuration management for Redis connection with
 * environment variables and sensible defaults.
 */

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  database: number;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  enableReadyCheck: boolean;
  maxReconnectAttempts: number;
  lazyConnect: boolean;
  keepAlive: number;
  family: 4 | 6;
  keyPrefix?: string;
  commandTimeout: number;
  socketIdleTimeout: number;
}

export interface CacheConfig {
  defaultTTL: number;
  userTTL: number;
  roomTTL: number;
  recordingTTL: number;
  sessionTTL: number;
  enableCacheWarming: boolean;
  maxCacheSize: number;
}

export interface RateLimitConfig {
  defaultLimit: number;
  windowSeconds: number;
  endpoints: {
    [endpoint: string]: {
      limit: number;
      window: number;
    };
  };
}

/**
 * Parse Redis configuration from environment variables
 */
export function parseRedisConfig(): RedisConfig {
  return {
    host: Deno.env.get('REDIS_HOST') || 'localhost',
    port: parseInt(Deno.env.get('REDIS_PORT') || '6379', 10),
    password: Deno.env.get('REDIS_PASSWORD'),
    database: parseInt(Deno.env.get('REDIS_DATABASE') || '0', 10),
    maxRetriesPerRequest: parseInt(Deno.env.get('REDIS_MAX_RETRIES') || '3', 10),
    retryDelayOnFailover: parseInt(Deno.env.get('REDIS_RETRY_DELAY') || '100', 10),
    enableReadyCheck: Deno.env.get('REDIS_READY_CHECK') !== 'false',
    maxReconnectAttempts: parseInt(Deno.env.get('REDIS_MAX_RECONNECT_ATTEMPTS') || '5', 10),
    lazyConnect: Deno.env.get('REDIS_LAZY_CONNECT') === 'true',
    keepAlive: parseInt(Deno.env.get('REDIS_KEEP_ALIVE') || '30000', 10),
    family: (Deno.env.get('REDIS_FAMILY') === '6' ? 6 : 4) as 4 | 6,
    keyPrefix: Deno.env.get('REDIS_KEY_PREFIX'),
    commandTimeout: parseInt(Deno.env.get('REDIS_COMMAND_TIMEOUT') || '5000', 10),
    socketIdleTimeout: parseInt(Deno.env.get('REDIS_SOCKET_IDLE_TIMEOUT') || '10000', 10),
  };
}

/**
 * Parse cache configuration from environment variables
 */
export function parseCacheConfig(): CacheConfig {
  return {
    defaultTTL: parseInt(Deno.env.get('CACHE_DEFAULT_TTL') || '3600', 10), // 1 hour
    userTTL: parseInt(Deno.env.get('CACHE_USER_TTL') || '1800', 10), // 30 minutes
    roomTTL: parseInt(Deno.env.get('CACHE_ROOM_TTL') || '3600', 10), // 1 hour
    recordingTTL: parseInt(Deno.env.get('CACHE_RECORDING_TTL') || '7200', 10), // 2 hours
    sessionTTL: parseInt(Deno.env.get('CACHE_SESSION_TTL') || '86400', 10), // 24 hours
    enableCacheWarming: Deno.env.get('CACHE_ENABLE_WARMING') !== 'false',
    maxCacheSize: parseInt(Deno.env.get('CACHE_MAX_SIZE') || '1000000', 10), // 1MB
  };
}

/**
 * Parse rate limiting configuration from environment variables
 */
export function parseRateLimitConfig(): RateLimitConfig {
  return {
    defaultLimit: parseInt(Deno.env.get('RATE_LIMIT_DEFAULT') || '100', 10),
    windowSeconds: parseInt(Deno.env.get('RATE_LIMIT_WINDOW') || '3600', 10), // 1 hour
    endpoints: {
      '/api/rooms/create': {
        limit: parseInt(Deno.env.get('RATE_LIMIT_CREATE_ROOM') || '10', 10),
        window: parseInt(Deno.env.get('RATE_LIMIT_CREATE_ROOM_WINDOW') || '3600', 10),
      },
      '/api/rooms/*/invite-guest': {
        limit: parseInt(Deno.env.get('RATE_LIMIT_INVITE_GUEST') || '20', 10),
        window: parseInt(Deno.env.get('RATE_LIMIT_INVITE_GUEST_WINDOW') || '3600', 10),
      },
      '/api/auth/login': {
        limit: parseInt(Deno.env.get('RATE_LIMIT_LOGIN') || '5', 10),
        window: parseInt(Deno.env.get('RATE_LIMIT_LOGIN_WINDOW') || '900', 10), // 15 minutes
      },
    },
  };
}

/**
 * Validate Redis configuration
 */
export function validateRedisConfig(config: RedisConfig): string[] {
  const errors: string[] = [];

  if (!config.host) {
    errors.push('Redis host is required');
  }

  if (config.port < 1 || config.port > 65535) {
    errors.push('Redis port must be between 1 and 65535');
  }

  if (config.database < 0 || config.database > 15) {
    errors.push('Redis database must be between 0 and 15');
  }

  if (config.maxRetriesPerRequest < 0) {
    errors.push('Max retries per request must be non-negative');
  }

  if (config.maxReconnectAttempts < 0) {
    errors.push('Max reconnect attempts must be non-negative');
  }

  if (config.commandTimeout < 1000) {
    errors.push('Command timeout should be at least 1000ms');
  }

  return errors;
}