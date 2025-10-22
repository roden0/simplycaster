/**
 * Rate Limiting Configuration Manager
 * 
 * Manages rate limiting policies and configurations with support for
 * dynamic updates, per-endpoint configurations, and role-based overrides.
 */

import { RateLimitPolicy, RateLimitConfig } from '../../domain/services/rate-limit-service.ts';

export interface RateLimitConfigManager {
  /**
   * Get rate limiting policy for an endpoint
   */
  getPolicy(endpoint: string): RateLimitPolicy | null;
  
  /**
   * Add or update a rate limiting policy
   */
  setPolicy(policy: RateLimitPolicy): void;
  
  /**
   * Remove a rate limiting policy
   */
  removePolicy(endpoint: string): void;
  
  /**
   * Get all configured policies
   */
  getAllPolicies(): RateLimitPolicy[];
  
  /**
   * Load policies from configuration
   */
  loadPolicies(policies: RateLimitPolicy[]): void;
  
  /**
   * Get effective configuration for endpoint and role
   */
  getEffectiveConfig(endpoint: string, userRole?: string): RateLimitConfig;
  
  /**
   * Check if admin bypass is enabled for endpoint
   */
  isAdminBypassEnabled(endpoint: string): boolean;
}

export class RateLimitConfigManagerImpl implements RateLimitConfigManager {
  private policies: Map<string, RateLimitPolicy>;
  private defaultConfig: RateLimitConfig;
  private patternCache: Map<string, RateLimitPolicy>;

  constructor(defaultConfig: RateLimitConfig) {
    this.policies = new Map();
    this.defaultConfig = defaultConfig;
    this.patternCache = new Map();
    
    // Initialize with default policies
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize comprehensive default rate limiting policies
   */
  private initializeDefaultPolicies(): void {
    const defaultPolicies: RateLimitPolicy[] = [
      // Authentication endpoints - strict limits
      {
        endpoint: '/api/auth/login',
        defaultLimit: 5,
        defaultWindow: 900, // 15 minutes
        roleOverrides: {
          admin: { limit: 20, window: 900 }
        },
        skipForAdmin: false
      },
      {
        endpoint: '/api/auth/register',
        defaultLimit: 3,
        defaultWindow: 3600, // 1 hour
        skipForAdmin: true
      },
      {
        endpoint: '/api/auth/logout',
        defaultLimit: 10,
        defaultWindow: 300, // 5 minutes
        skipForAdmin: true
      },
      {
        endpoint: '/api/auth/refresh',
        defaultLimit: 20,
        defaultWindow: 3600,
        skipForAdmin: true
      },

      // Room management endpoints
      {
        endpoint: '/api/rooms/create',
        defaultLimit: 10,
        defaultWindow: 3600,
        roleOverrides: {
          host: { limit: 20, window: 3600 },
          admin: { limit: 100, window: 3600 }
        },
        skipForAdmin: true
      },
      {
        endpoint: '/api/rooms/list',
        defaultLimit: 60,
        defaultWindow: 3600,
        roleOverrides: {
          host: { limit: 120, window: 3600 },
          admin: { limit: 300, window: 3600 }
        },
        skipForAdmin: true
      },
      {
        endpoint: '/api/rooms/*/join',
        defaultLimit: 5,
        defaultWindow: 300, // 5 minutes
        roleOverrides: {
          host: { limit: 20, window: 300 }
        },
        skipForAdmin: true
      },
      {
        endpoint: '/api/rooms/*/leave',
        defaultLimit: 10,
        defaultWindow: 300,
        skipForAdmin: true
      },
      {
        endpoint: '/api/rooms/*/invite-guest',
        defaultLimit: 20,
        defaultWindow: 3600,
        roleOverrides: {
          host: { limit: 50, window: 3600 }
        },
        skipForAdmin: true
      },
      {
        endpoint: '/api/rooms/*/kick-guest',
        defaultLimit: 10,
        defaultWindow: 300,
        roleOverrides: {
          host: { limit: 20, window: 300 }
        },
        skipForAdmin: true
      },

      // Recording endpoints
      {
        endpoint: '/api/rooms/*/start-recording',
        defaultLimit: 5,
        defaultWindow: 300,
        roleOverrides: {
          host: { limit: 10, window: 300 }
        },
        skipForAdmin: true
      },
      {
        endpoint: '/api/rooms/*/stop-recording',
        defaultLimit: 5,
        defaultWindow: 300,
        roleOverrides: {
          host: { limit: 10, window: 300 }
        },
        skipForAdmin: true
      },
      {
        endpoint: '/api/recordings/list',
        defaultLimit: 30,
        defaultWindow: 3600,
        roleOverrides: {
          host: { limit: 60, window: 3600 }
        },
        skipForAdmin: true
      },
      {
        endpoint: '/api/recordings/*/download',
        defaultLimit: 10,
        defaultWindow: 3600,
        roleOverrides: {
          host: { limit: 20, window: 3600 }
        },
        skipForAdmin: true
      },
      {
        endpoint: '/api/recordings/*/delete',
        defaultLimit: 5,
        defaultWindow: 300,
        roleOverrides: {
          host: { limit: 10, window: 300 }
        },
        skipForAdmin: true
      },

      // Feed management endpoints
      {
        endpoint: '/api/feed/upload',
        defaultLimit: 5,
        defaultWindow: 3600,
        roleOverrides: {
          admin: { limit: 20, window: 3600 }
        },
        skipForAdmin: false // Even admins should have some limits on uploads
      },
      {
        endpoint: '/api/feed/list',
        defaultLimit: 60,
        defaultWindow: 3600,
        skipForAdmin: true
      },
      {
        endpoint: '/api/feed/*/delete',
        defaultLimit: 10,
        defaultWindow: 300,
        skipForAdmin: true
      },

      // User management endpoints
      {
        endpoint: '/api/users/create',
        defaultLimit: 5,
        defaultWindow: 3600,
        roleOverrides: {
          admin: { limit: 20, window: 3600 }
        },
        skipForAdmin: false
      },
      {
        endpoint: '/api/users/list',
        defaultLimit: 30,
        defaultWindow: 3600,
        skipForAdmin: true
      },
      {
        endpoint: '/api/users/*/update',
        defaultLimit: 10,
        defaultWindow: 300,
        skipForAdmin: true
      },
      {
        endpoint: '/api/users/*/delete',
        defaultLimit: 5,
        defaultWindow: 300,
        skipForAdmin: true
      },

      // Health and monitoring endpoints - very permissive
      {
        endpoint: '/api/health',
        defaultLimit: 300,
        defaultWindow: 3600,
        skipForAdmin: true
      },
      {
        endpoint: '/api/status',
        defaultLimit: 100,
        defaultWindow: 3600,
        skipForAdmin: true
      },

      // WebRTC signaling endpoints - higher limits for real-time communication
      {
        endpoint: '/api/webrtc/*',
        defaultLimit: 200,
        defaultWindow: 3600,
        roleOverrides: {
          host: { limit: 500, window: 3600 }
        },
        skipForAdmin: true
      },

      // File upload endpoints - lower limits due to resource usage
      {
        endpoint: '/api/upload/*',
        defaultLimit: 10,
        defaultWindow: 3600,
        roleOverrides: {
          host: { limit: 20, window: 3600 },
          admin: { limit: 50, window: 3600 }
        },
        skipForAdmin: false
      },

      // General API fallback - moderate limits
      {
        endpoint: '/api/*',
        defaultLimit: 1000,
        defaultWindow: 3600,
        roleOverrides: {
          host: { limit: 2000, window: 3600 },
          admin: { limit: 5000, window: 3600 }
        },
        skipForAdmin: true
      }
    ];

    // Load default policies
    this.loadPolicies(defaultPolicies);
  }

  getPolicy(endpoint: string): RateLimitPolicy | null {
    // Check exact match first
    const exactMatch = this.policies.get(endpoint);
    if (exactMatch) {
      return exactMatch;
    }

    // Check pattern cache
    const cachedMatch = this.patternCache.get(endpoint);
    if (cachedMatch) {
      return cachedMatch;
    }

    // Find pattern match
    for (const [pattern, policy] of this.policies.entries()) {
      if (this.matchesPattern(endpoint, pattern)) {
        // Cache the match for future lookups
        this.patternCache.set(endpoint, policy);
        return policy;
      }
    }

    return null;
  }

  setPolicy(policy: RateLimitPolicy): void {
    this.policies.set(policy.endpoint, policy);
    // Clear pattern cache as new policy might affect pattern matching
    this.patternCache.clear();
  }

  removePolicy(endpoint: string): void {
    this.policies.delete(endpoint);
    // Clear pattern cache
    this.patternCache.clear();
  }

  getAllPolicies(): RateLimitPolicy[] {
    return Array.from(this.policies.values());
  }

  loadPolicies(policies: RateLimitPolicy[]): void {
    // Clear existing policies
    this.policies.clear();
    this.patternCache.clear();

    // Load new policies
    policies.forEach(policy => {
      this.policies.set(policy.endpoint, policy);
    });
  }

  getEffectiveConfig(endpoint: string, userRole?: string): RateLimitConfig {
    const policy = this.getPolicy(endpoint);

    if (!policy) {
      return this.defaultConfig;
    }

    // Check for role-specific overrides
    if (userRole && policy.roleOverrides?.[userRole]) {
      const override = policy.roleOverrides[userRole];
      return {
        limit: override.limit,
        windowSeconds: override.window,
        skipForAdmin: policy.skipForAdmin
      };
    }

    // Return default policy configuration
    return {
      limit: policy.defaultLimit,
      windowSeconds: policy.defaultWindow,
      skipForAdmin: policy.skipForAdmin
    };
  }

  isAdminBypassEnabled(endpoint: string): boolean {
    const policy = this.getPolicy(endpoint);
    return policy?.skipForAdmin ?? false;
  }

  /**
   * Pattern matching for endpoint paths
   * Supports wildcards (*) and parameter placeholders
   */
  private matchesPattern(endpoint: string, pattern: string): boolean {
    // Exact match
    if (endpoint === pattern) {
      return true;
    }

    // Simple wildcard at the end
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return endpoint.startsWith(prefix);
    }

    // Pattern with wildcards in the middle
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\*/g, '[^/]+')  // Replace * with regex for path segments
        .replace(/\//g, '\\/');   // Escape forward slashes
      
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(endpoint);
    }

    return false;
  }

  /**
   * Load policies from environment variables or configuration file
   */
  loadPoliciesFromEnvironment(): void {
    try {
      const configJson = Deno.env.get('RATE_LIMIT_POLICIES');
      if (configJson) {
        const policies: RateLimitPolicy[] = JSON.parse(configJson);
        this.loadPolicies(policies);
      }
    } catch (error) {
      console.error('Failed to load rate limit policies from environment:', error);
    }
  }

  /**
   * Export current policies as JSON
   */
  exportPolicies(): string {
    const policies = this.getAllPolicies();
    return JSON.stringify(policies, null, 2);
  }

  /**
   * Get statistics about current policies
   */
  getPolicyStats(): {
    totalPolicies: number;
    endpointTypes: Record<string, number>;
    averageLimit: number;
    averageWindow: number;
    adminBypassCount: number;
  } {
    const policies = this.getAllPolicies();
    const endpointTypes: Record<string, number> = {};
    let totalLimit = 0;
    let totalWindow = 0;
    let adminBypassCount = 0;

    policies.forEach(policy => {
      // Categorize by endpoint prefix
      const prefix = policy.endpoint.split('/')[2] || 'unknown';
      endpointTypes[prefix] = (endpointTypes[prefix] || 0) + 1;

      totalLimit += policy.defaultLimit;
      totalWindow += policy.defaultWindow;

      if (policy.skipForAdmin) {
        adminBypassCount++;
      }
    });

    return {
      totalPolicies: policies.length,
      endpointTypes,
      averageLimit: policies.length > 0 ? Math.round(totalLimit / policies.length) : 0,
      averageWindow: policies.length > 0 ? Math.round(totalWindow / policies.length) : 0,
      adminBypassCount
    };
  }

  /**
   * Validate policy configuration
   */
  validatePolicy(policy: RateLimitPolicy): string[] {
    const errors: string[] = [];

    if (!policy.endpoint) {
      errors.push('Endpoint is required');
    }

    if (policy.defaultLimit <= 0) {
      errors.push('Default limit must be positive');
    }

    if (policy.defaultWindow <= 0) {
      errors.push('Default window must be positive');
    }

    if (policy.roleOverrides) {
      for (const [role, override] of Object.entries(policy.roleOverrides)) {
        if (override.limit <= 0) {
          errors.push(`Role override limit for ${role} must be positive`);
        }
        if (override.window <= 0) {
          errors.push(`Role override window for ${role} must be positive`);
        }
      }
    }

    return errors;
  }
}