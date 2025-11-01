/**
 * Email Configuration Service
 * 
 * Provides email configuration management, validation, and health monitoring
 * for the email service system.
 */

import { 
  EmailConfigExtended, 
  EmailConfigHealthCheck, 
  parseEmailConfig, 
  validateEmailConfig, 
  performEmailConfigHealthCheck,
  getValidatedEmailConfig 
} from './email-config.ts';

/**
 * Email configuration service interface
 */
export interface IEmailConfigService {
  /**
   * Get the current email configuration
   */
  getConfig(): Promise<EmailConfigExtended>;

  /**
   * Validate the current configuration
   */
  validateConfig(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;

  /**
   * Perform a health check on the email configuration and provider
   */
  healthCheck(): Promise<EmailConfigHealthCheck>;

  /**
   * Initialize and validate configuration on startup
   */
  initialize(): Promise<void>;

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean;

  /**
   * Get configuration metadata for monitoring
   */
  getConfigMetadata(): {
    provider: string;
    queueEnabled: boolean;
    rateLimitEnabled: boolean;
    templatesEnabled: boolean;
    lastHealthCheck?: Date;
  };
}

/**
 * Email configuration service implementation
 */
export class EmailConfigService implements IEmailConfigService {
  private config: EmailConfigExtended | null = null;
  private lastHealthCheck: EmailConfigHealthCheck | null = null;
  private healthCheckInterval: number | null = null;
  private initialized = false;

  constructor() {
    // Constructor is intentionally minimal - initialization happens in initialize()
  }

  /**
   * Get the current email configuration
   */
  async getConfig(): Promise<EmailConfigExtended> {
    if (!this.config) {
      this.config = await getValidatedEmailConfig();
    }
    return this.config;
  }

  /**
   * Validate the current configuration
   */
  async validateConfig(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    try {
      const config = await this.getConfig();
      return validateEmailConfig(config);
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
      };
    }
  }

  /**
   * Perform a health check on the email configuration and provider
   */
  async healthCheck(): Promise<EmailConfigHealthCheck> {
    try {
      const config = await this.getConfig();
      this.lastHealthCheck = await performEmailConfigHealthCheck(config);
      return this.lastHealthCheck;
    } catch (error) {
      const errorResult: EmailConfigHealthCheck = {
        configValid: false,
        providerReachable: false,
        lastCheck: new Date(),
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
        metadata: {
          provider: 'unknown',
          queueEnabled: false,
          rateLimitEnabled: false,
          templatesEnabled: false,
        },
      };
      this.lastHealthCheck = errorResult;
      return errorResult;
    }
  }

  /**
   * Initialize and validate configuration on startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('EmailConfigService already initialized');
      return;
    }

    try {
      console.log('🔧 Initializing email configuration service...');

      // Load and validate configuration
      this.config = await getValidatedEmailConfig();
      console.log(`✅ Email configuration loaded successfully (provider: ${this.config.provider})`);

      // Perform initial health check
      const healthCheck = await this.healthCheck();
      if (!healthCheck.configValid) {
        throw new Error(`Email configuration validation failed: ${healthCheck.errors.join(', ')}`);
      }

      if (!healthCheck.providerReachable) {
        console.warn('⚠️  Email provider connectivity test failed, but continuing startup');
        console.warn('   This may be expected in development or if the provider is temporarily unavailable');
      } else {
        console.log('✅ Email provider connectivity test passed');
      }

      // Start periodic health checks if enabled
      if (this.config.healthCheck.enabled) {
        this.startPeriodicHealthChecks();
        console.log(`✅ Email health checks enabled (interval: ${this.config.healthCheck.intervalMs}ms)`);
      }

      this.initialized = true;
      console.log('✅ Email configuration service initialized successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to initialize email configuration service:', errorMessage);
      throw new Error(`Email configuration service initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return this.initialized && this.config !== null;
  }

  /**
   * Get configuration metadata for monitoring
   */
  getConfigMetadata(): {
    provider: string;
    queueEnabled: boolean;
    rateLimitEnabled: boolean;
    templatesEnabled: boolean;
    lastHealthCheck?: Date;
  } {
    if (!this.config) {
      return {
        provider: 'unknown',
        queueEnabled: false,
        rateLimitEnabled: false,
        templatesEnabled: false,
      };
    }

    return {
      provider: this.config.provider,
      queueEnabled: this.config.queue.enabled,
      rateLimitEnabled: this.config.rateLimit.enabled,
      templatesEnabled: this.config.templates.cacheEnabled,
      lastHealthCheck: this.lastHealthCheck?.lastCheck,
    };
  }

  /**
   * Start periodic health checks
   */
  private startPeriodicHealthChecks(): void {
    if (this.healthCheckInterval !== null) {
      return; // Already started
    }

    if (!this.config?.healthCheck.enabled) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthCheck = await this.healthCheck();
        
        if (!healthCheck.configValid || !healthCheck.providerReachable) {
          console.warn('⚠️  Email service health check failed:', {
            configValid: healthCheck.configValid,
            providerReachable: healthCheck.providerReachable,
            errors: healthCheck.errors,
          });
        }

        if (healthCheck.warnings.length > 0) {
          console.warn('⚠️  Email service health check warnings:', healthCheck.warnings);
        }

      } catch (error) {
        console.error('❌ Email service health check error:', error);
      }
    }, this.config.healthCheck.intervalMs);
  }

  /**
   * Stop periodic health checks
   */
  private stopPeriodicHealthChecks(): void {
    if (this.healthCheckInterval !== null) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopPeriodicHealthChecks();
    this.config = null;
    this.lastHealthCheck = null;
    this.initialized = false;
    console.log('✅ Email configuration service cleaned up');
  }

  /**
   * Reload configuration (useful for configuration changes)
   */
  async reloadConfig(): Promise<void> {
    console.log('🔄 Reloading email configuration...');
    
    // Stop health checks temporarily
    this.stopPeriodicHealthChecks();
    
    try {
      // Reload configuration
      this.config = await getValidatedEmailConfig();
      
      // Perform health check with new configuration
      await this.healthCheck();
      
      // Restart health checks if enabled
      if (this.config.healthCheck.enabled) {
        this.startPeriodicHealthChecks();
      }
      
      console.log('✅ Email configuration reloaded successfully');
      
    } catch (error) {
      console.error('❌ Failed to reload email configuration:', error);
      throw error;
    }
  }
}

/**
 * Create email configuration service instance
 */
export function createEmailConfigService(): IEmailConfigService {
  return new EmailConfigService();
}

/**
 * Global email configuration service instance
 */
let globalEmailConfigService: IEmailConfigService | null = null;

/**
 * Get or create global email configuration service instance
 */
export function getEmailConfigService(): IEmailConfigService {
  if (!globalEmailConfigService) {
    globalEmailConfigService = createEmailConfigService();
  }
  return globalEmailConfigService;
}

/**
 * Initialize global email configuration service
 */
export async function initializeEmailConfigService(): Promise<void> {
  const service = getEmailConfigService();
  await service.initialize();
}

/**
 * Validate email configuration on application startup
 */
export async function validateEmailConfigOnStartup(): Promise<void> {
  try {
    console.log('🔍 Validating email configuration on startup...');
    
    const service = getEmailConfigService();
    await service.initialize();
    
    const validation = await service.validateConfig();
    if (!validation.valid) {
      throw new Error(`Email configuration validation failed: ${validation.errors.join(', ')}`);
    }
    
    if (validation.warnings.length > 0) {
      console.warn('⚠️  Email configuration warnings:');
      validation.warnings.forEach(warning => console.warn(`   - ${warning}`));
    }
    
    console.log('✅ Email configuration validation completed successfully');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Email configuration startup validation failed:', errorMessage);
    throw new Error(`Email configuration startup validation failed: ${errorMessage}`);
  }
}