/**
 * Environment Configuration Service
 * 
 * Manages environment-specific configurations for ICE servers,
 * including development, staging, and production settings with
 * SSL/TLS support and configuration validation.
 */

export interface EnvironmentConfig {
  environment: 'development' | 'staging' | 'production';
  coturn: CoturnEnvironmentConfig;
  ice: ICEEnvironmentConfig;
  security: SecurityEnvironmentConfig;
  monitoring: MonitoringEnvironmentConfig;
}

export interface CoturnEnvironmentConfig {
  host: string;
  port: number;
  turnsPort: number;
  realm: string;
  secret: string;
  externalIp?: string;
  useSSL: boolean;
  tcpFallbackPort?: number;
  relayPortRange: {
    min: number;
    max: number;
  };
  logLevel: number;
  verbosity: number;
}

export interface ICEEnvironmentConfig {
  stunUrls: string[];
  turnUrls: string[];
  turnsUrls: string[];
  fallbackStunUrls: string[];
  credentialTTL: number;
  connectionTimeout: number;
  gatheringTimeout: number;
  priority: {
    host: number;
    srflx: number;
    relay: number;
  };
}

export interface SecurityEnvironmentConfig {
  rateLimiting: {
    enabled: boolean;
    credentialRequests: { limit: number; windowSeconds: number };
    connectionAttempts: { limit: number; windowSeconds: number };
  };
  ipRestrictions: {
    enabled: boolean;
    allowedCidrs: string[];
    blockedIps: string[];
    maxConnectionsPerIp: number;
  };
  bandwidthQuotas: {
    enabled: boolean;
    hostQuotaMbps: number;
    guestQuotaMbps: number;
    quotaWindowSeconds: number;
  };
  secretRotation: {
    enabled: boolean;
    intervalHours: number;
    gracePeriodHours: number;
  };
}

export interface MonitoringEnvironmentConfig {
  healthChecks: {
    enabled: boolean;
    intervalSeconds: number;
    timeoutSeconds: number;
  };
  metrics: {
    enabled: boolean;
    retentionHours: number;
    detailedLogging: boolean;
  };
  alerts: {
    enabled: boolean;
    thresholds: {
      errorRate: number;
      responseTime: number;
      connectionFailures: number;
    };
  };
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface IEnvironmentConfigService {
  loadConfiguration(): Promise<EnvironmentConfig>;
  validateConfiguration(config: EnvironmentConfig): ConfigValidationResult;
  getEnvironmentType(): 'development' | 'staging' | 'production';
  isDevelopment(): boolean;
  isProduction(): boolean;
  getICEServerUrls(): string[];
  getCoturnConfiguration(): CoturnEnvironmentConfig;
  getSecurityConfiguration(): SecurityEnvironmentConfig;
}

export class EnvironmentConfigService implements IEnvironmentConfigService {
  private config: EnvironmentConfig | null = null;
  private readonly configCache = new Map<string, any>();

  /**
   * Loads configuration based on current environment
   */
  async loadConfiguration(): Promise<EnvironmentConfig> {
    if (this.config) {
      return this.config;
    }

    const environment = this.getEnvironmentType();
    
    try {
      this.config = await this.buildConfiguration(environment);
      
      // Validate configuration
      const validation = this.validateConfiguration(this.config);
      if (!validation.isValid) {
        console.error('Configuration validation failed:', validation.errors);
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        console.warn('Configuration warnings:', validation.warnings);
      }

      console.log(`Loaded ${environment} configuration successfully`);
      return this.config;
    } catch (error) {
      console.error('Failed to load configuration:', error);
      throw error;
    }
  }

  /**
   * Builds configuration for specific environment
   */
  private async buildConfiguration(environment: 'development' | 'staging' | 'production'): Promise<EnvironmentConfig> {
    const baseConfig = this.getBaseConfiguration();
    
    switch (environment) {
      case 'development':
        return this.buildDevelopmentConfig(baseConfig);
      case 'staging':
        return this.buildStagingConfig(baseConfig);
      case 'production':
        return this.buildProductionConfig(baseConfig);
      default:
        throw new Error(`Unknown environment: ${environment}`);
    }
  }

  /**
   * Gets base configuration from environment variables
   */
  private getBaseConfiguration(): Partial<EnvironmentConfig> {
    return {
      coturn: {
        host: Deno.env.get("COTURN_HOST") || "localhost",
        port: parseInt(Deno.env.get("COTURN_PORT") || "3478", 10),
        turnsPort: parseInt(Deno.env.get("COTURN_TURNS_PORT") || "5349", 10),
        realm: Deno.env.get("COTURN_REALM") || "simplycast.local",
        secret: Deno.env.get("COTURN_SECRET") || "",
        externalIp: Deno.env.get("COTURN_EXTERNAL_IP"),
        useSSL: Deno.env.get("COTURN_USE_SSL") === "true",
        tcpFallbackPort: parseInt(Deno.env.get("COTURN_TCP_FALLBACK_PORT") || "443", 10),
        relayPortRange: {
          min: parseInt(Deno.env.get("COTURN_MIN_PORT") || "49152", 10),
          max: parseInt(Deno.env.get("COTURN_MAX_PORT") || "65535", 10)
        },
        logLevel: parseInt(Deno.env.get("COTURN_LOG_LEVEL") || "3", 10),
        verbosity: parseInt(Deno.env.get("COTURN_VERBOSITY") || "2", 10)
      },
      ice: {
        credentialTTL: parseInt(Deno.env.get("TURN_CREDENTIAL_TTL") || "43200", 10),
        connectionTimeout: parseInt(Deno.env.get("ICE_CONNECTION_TIMEOUT") || "30000", 10),
        gatheringTimeout: parseInt(Deno.env.get("ICE_GATHERING_TIMEOUT") || "10000", 10),
        priority: {
          host: parseInt(Deno.env.get("ICE_PRIORITY_HOST") || "126", 10),
          srflx: parseInt(Deno.env.get("ICE_PRIORITY_SRFLX") || "100", 10),
          relay: parseInt(Deno.env.get("ICE_PRIORITY_RELAY") || "0", 10)
        }
      }
    };
  }

  /**
   * Builds development environment configuration
   */
  private buildDevelopmentConfig(baseConfig: Partial<EnvironmentConfig>): EnvironmentConfig {
    const coturnHost = baseConfig.coturn?.host || "localhost";
    const coturnPort = baseConfig.coturn?.port || 3478;

    return {
      environment: 'development',
      coturn: {
        ...baseConfig.coturn!,
        host: coturnHost,
        useSSL: false,
        logLevel: 4, // More verbose logging for development
        verbosity: 3
      },
      ice: {
        ...baseConfig.ice!,
        stunUrls: [
          `stun:${coturnHost}:${coturnPort}`,
          'stun:stun.l.google.com:19302' // Fallback
        ],
        turnUrls: [
          `turn:${coturnHost}:${coturnPort}?transport=udp`,
          `turn:${coturnHost}:${coturnPort}?transport=tcp`
        ],
        turnsUrls: [], // No TURNS in development
        fallbackStunUrls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302'
        ]
      },
      security: {
        rateLimiting: {
          enabled: false, // Disabled for development
          credentialRequests: { limit: 100, windowSeconds: 60 },
          connectionAttempts: { limit: 200, windowSeconds: 300 }
        },
        ipRestrictions: {
          enabled: false, // Disabled for development
          allowedCidrs: ['127.0.0.0/8', '10.0.0.0/8', '192.168.0.0/16'],
          blockedIps: [],
          maxConnectionsPerIp: 50
        },
        bandwidthQuotas: {
          enabled: false, // Disabled for development
          hostQuotaMbps: 100,
          guestQuotaMbps: 50,
          quotaWindowSeconds: 3600
        },
        secretRotation: {
          enabled: false, // Disabled for development
          intervalHours: 168,
          gracePeriodHours: 24
        }
      },
      monitoring: {
        healthChecks: {
          enabled: true,
          intervalSeconds: 30,
          timeoutSeconds: 5
        },
        metrics: {
          enabled: true,
          retentionHours: 24,
          detailedLogging: true
        },
        alerts: {
          enabled: false, // Disabled for development
          thresholds: {
            errorRate: 10,
            responseTime: 1000,
            connectionFailures: 5
          }
        }
      }
    };
  }

  /**
   * Builds staging environment configuration
   */
  private buildStagingConfig(baseConfig: Partial<EnvironmentConfig>): EnvironmentConfig {
    const coturnHost = baseConfig.coturn?.host || "staging-turn.simplycast.local";
    const coturnPort = baseConfig.coturn?.port || 3478;
    const turnsPort = baseConfig.coturn?.turnsPort || 5349;

    return {
      environment: 'staging',
      coturn: {
        ...baseConfig.coturn!,
        host: coturnHost,
        useSSL: true,
        logLevel: 3,
        verbosity: 2
      },
      ice: {
        ...baseConfig.ice!,
        stunUrls: [
          `stun:${coturnHost}:${coturnPort}`
        ],
        turnUrls: [
          `turn:${coturnHost}:${coturnPort}?transport=udp`,
          `turn:${coturnHost}:${coturnPort}?transport=tcp`
        ],
        turnsUrls: [
          `turns:${coturnHost}:${turnsPort}?transport=tcp`
        ],
        fallbackStunUrls: [
          'stun:stun.l.google.com:19302'
        ]
      },
      security: {
        rateLimiting: {
          enabled: true,
          credentialRequests: { limit: 20, windowSeconds: 60 },
          connectionAttempts: { limit: 50, windowSeconds: 300 }
        },
        ipRestrictions: {
          enabled: true,
          allowedCidrs: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
          blockedIps: [],
          maxConnectionsPerIp: 10
        },
        bandwidthQuotas: {
          enabled: true,
          hostQuotaMbps: 75,
          guestQuotaMbps: 30,
          quotaWindowSeconds: 3600
        },
        secretRotation: {
          enabled: true,
          intervalHours: 168,
          gracePeriodHours: 24
        }
      },
      monitoring: {
        healthChecks: {
          enabled: true,
          intervalSeconds: 30,
          timeoutSeconds: 10
        },
        metrics: {
          enabled: true,
          retentionHours: 72,
          detailedLogging: true
        },
        alerts: {
          enabled: true,
          thresholds: {
            errorRate: 5,
            responseTime: 500,
            connectionFailures: 3
          }
        }
      }
    };
  }

  /**
   * Builds production environment configuration
   */
  private buildProductionConfig(baseConfig: Partial<EnvironmentConfig>): EnvironmentConfig {
    const coturnHost = baseConfig.coturn?.host || "turn.simplycast.com";
    const coturnPort = baseConfig.coturn?.port || 3478;
    const turnsPort = baseConfig.coturn?.turnsPort || 5349;
    const tcpFallbackPort = baseConfig.coturn?.tcpFallbackPort || 443;

    return {
      environment: 'production',
      coturn: {
        ...baseConfig.coturn!,
        host: coturnHost,
        useSSL: true,
        logLevel: 2, // Less verbose for production
        verbosity: 1
      },
      ice: {
        ...baseConfig.ice!,
        stunUrls: [
          `stun:${coturnHost}:${coturnPort}`
        ],
        turnUrls: [
          `turn:${coturnHost}:${coturnPort}?transport=udp`,
          `turn:${coturnHost}:${coturnPort}?transport=tcp`,
          `turn:${coturnHost}:${tcpFallbackPort}?transport=tcp` // Firewall fallback
        ],
        turnsUrls: [
          `turns:${coturnHost}:${turnsPort}?transport=tcp`
        ],
        fallbackStunUrls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302'
        ]
      },
      security: {
        rateLimiting: {
          enabled: true,
          credentialRequests: { limit: 10, windowSeconds: 60 },
          connectionAttempts: { limit: 20, windowSeconds: 300 }
        },
        ipRestrictions: {
          enabled: true,
          allowedCidrs: [], // No CIDR restrictions in production (global access)
          blockedIps: [], // Managed dynamically
          maxConnectionsPerIp: 5
        },
        bandwidthQuotas: {
          enabled: true,
          hostQuotaMbps: 50,
          guestQuotaMbps: 20,
          quotaWindowSeconds: 3600
        },
        secretRotation: {
          enabled: true,
          intervalHours: 168, // Weekly rotation
          gracePeriodHours: 24
        }
      },
      monitoring: {
        healthChecks: {
          enabled: true,
          intervalSeconds: 60,
          timeoutSeconds: 15
        },
        metrics: {
          enabled: true,
          retentionHours: 168, // 7 days
          detailedLogging: false // Less verbose for production
        },
        alerts: {
          enabled: true,
          thresholds: {
            errorRate: 2,
            responseTime: 200,
            connectionFailures: 2
          }
        }
      }
    };
  }

  /**
   * Validates configuration for correctness and completeness
   */
  validateConfiguration(config: EnvironmentConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate Coturn configuration
    if (!config.coturn.host) {
      errors.push("Coturn host is required");
    }

    if (!config.coturn.secret || config.coturn.secret.length < 32) {
      errors.push("Coturn secret must be at least 32 characters long");
    }

    if (config.coturn.port < 1 || config.coturn.port > 65535) {
      errors.push("Coturn port must be between 1 and 65535");
    }

    if (config.coturn.relayPortRange.min >= config.coturn.relayPortRange.max) {
      errors.push("Coturn relay port range minimum must be less than maximum");
    }

    // Validate ICE configuration
    if (config.ice.stunUrls.length === 0) {
      warnings.push("No STUN URLs configured, WebRTC may not work behind NAT");
    }

    if (config.environment === 'production' && config.ice.turnsUrls.length === 0) {
      warnings.push("No TURNS URLs configured for production environment");
    }

    if (config.ice.credentialTTL > 86400) {
      warnings.push("Credential TTL is longer than 24 hours, consider shorter duration for security");
    }

    // Validate security configuration
    if (config.environment === 'production' && !config.security.rateLimiting.enabled) {
      warnings.push("Rate limiting is disabled in production environment");
    }

    if (config.environment === 'production' && !config.security.secretRotation.enabled) {
      warnings.push("Secret rotation is disabled in production environment");
    }

    // Validate monitoring configuration
    if (!config.monitoring.healthChecks.enabled) {
      warnings.push("Health checks are disabled");
    }

    if (config.environment === 'production' && !config.monitoring.alerts.enabled) {
      warnings.push("Alerts are disabled in production environment");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Gets current environment type
   */
  getEnvironmentType(): 'development' | 'staging' | 'production' {
    const env = Deno.env.get("NODE_ENV") || Deno.env.get("ENVIRONMENT") || "development";
    
    switch (env.toLowerCase()) {
      case 'prod':
      case 'production':
        return 'production';
      case 'stage':
      case 'staging':
        return 'staging';
      case 'dev':
      case 'development':
      default:
        return 'development';
    }
  }

  /**
   * Checks if running in development environment
   */
  isDevelopment(): boolean {
    return this.getEnvironmentType() === 'development';
  }

  /**
   * Checks if running in production environment
   */
  isProduction(): boolean {
    return this.getEnvironmentType() === 'production';
  }

  /**
   * Gets ICE server URLs for current environment
   */
  getICEServerUrls(): string[] {
    if (!this.config) {
      throw new Error("Configuration not loaded. Call loadConfiguration() first.");
    }

    const urls: string[] = [];
    
    // Add STUN URLs
    urls.push(...this.config.ice.stunUrls);
    
    // Add TURN URLs
    urls.push(...this.config.ice.turnUrls);
    
    // Add TURNS URLs (production/staging only)
    if (this.config.environment !== 'development') {
      urls.push(...this.config.ice.turnsUrls);
    }

    return urls;
  }

  /**
   * Gets Coturn configuration for current environment
   */
  getCoturnConfiguration(): CoturnEnvironmentConfig {
    if (!this.config) {
      throw new Error("Configuration not loaded. Call loadConfiguration() first.");
    }

    return this.config.coturn;
  }

  /**
   * Gets security configuration for current environment
   */
  getSecurityConfiguration(): SecurityEnvironmentConfig {
    if (!this.config) {
      throw new Error("Configuration not loaded. Call loadConfiguration() first.");
    }

    return this.config.security;
  }

  /**
   * Gets monitoring configuration for current environment
   */
  getMonitoringConfiguration(): MonitoringEnvironmentConfig {
    if (!this.config) {
      throw new Error("Configuration not loaded. Call loadConfiguration() first.");
    }

    return this.config.monitoring;
  }

  /**
   * Exports configuration for external use (e.g., Docker compose)
   */
  exportEnvironmentVariables(): Record<string, string> {
    if (!this.config) {
      throw new Error("Configuration not loaded. Call loadConfiguration() first.");
    }

    const env: Record<string, string> = {};
    const { coturn, ice, security, monitoring } = this.config;

    // Coturn environment variables
    env.COTURN_HOST = coturn.host;
    env.COTURN_PORT = coturn.port.toString();
    env.COTURN_TURNS_PORT = coturn.turnsPort.toString();
    env.COTURN_REALM = coturn.realm;
    env.COTURN_SECRET = coturn.secret;
    env.COTURN_USE_SSL = coturn.useSSL.toString();
    env.COTURN_MIN_PORT = coturn.relayPortRange.min.toString();
    env.COTURN_MAX_PORT = coturn.relayPortRange.max.toString();
    env.COTURN_LOG_LEVEL = coturn.logLevel.toString();

    if (coturn.externalIp) {
      env.COTURN_EXTERNAL_IP = coturn.externalIp;
    }

    if (coturn.tcpFallbackPort) {
      env.COTURN_TCP_FALLBACK_PORT = coturn.tcpFallbackPort.toString();
    }

    // ICE environment variables
    env.TURN_CREDENTIAL_TTL = ice.credentialTTL.toString();
    env.ICE_CONNECTION_TIMEOUT = ice.connectionTimeout.toString();
    env.ICE_GATHERING_TIMEOUT = ice.gatheringTimeout.toString();

    // Security environment variables
    env.TURN_RATE_LIMITING_ENABLED = security.rateLimiting.enabled.toString();
    env.TURN_IP_RESTRICTIONS_ENABLED = security.ipRestrictions.enabled.toString();
    env.TURN_BANDWIDTH_QUOTAS_ENABLED = security.bandwidthQuotas.enabled.toString();
    env.TURN_SECRET_ROTATION_ENABLED = security.secretRotation.enabled.toString();

    return env;
  }
}

/**
 * Factory function to create EnvironmentConfigService
 */
export function createEnvironmentConfigService(): EnvironmentConfigService {
  return new EnvironmentConfigService();
}