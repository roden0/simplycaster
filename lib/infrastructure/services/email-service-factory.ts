/**
 * Email Service Factory
 * 
 * Creates appropriate email service providers based on configuration
 * and manages provider selection logic.
 */

import { EmailService } from '../../domain/services/email-service.ts';
import { EmailConfigExtended } from './email-config.ts';
import { EmailProviderError } from '../../domain/errors/email-errors.ts';
import { MailHogEmailProvider, createMailHogEmailProvider, isMailHogConfig } from './mailhog-email-provider.ts';
import { SendGridEmailProvider, createSendGridEmailProvider, isSendGridConfig } from './sendgrid-email-provider.ts';
import { AWSSESEmailProvider, createAWSSESEmailProvider, isAWSSESConfig } from './aws-ses-email-provider.ts';
import { SMTPEmailProvider, createSMTPEmailProvider, isSMTPConfig } from './smtp-email-provider.ts';

/**
 * Email service factory interface
 */
export interface IEmailServiceFactory {
  /**
   * Create email service based on configuration
   */
  createEmailService(config: EmailConfigExtended, templateService?: any): Promise<EmailService>;

  /**
   * Get supported providers
   */
  getSupportedProviders(): string[];

  /**
   * Check if provider is supported
   */
  isProviderSupported(provider: string): boolean;
}

/**
 * Email service factory implementation
 */
export class EmailServiceFactory implements IEmailServiceFactory {
  private static instance: EmailServiceFactory | null = null;

  /**
   * Get singleton instance
   */
  static getInstance(): EmailServiceFactory {
    if (!EmailServiceFactory.instance) {
      EmailServiceFactory.instance = new EmailServiceFactory();
    }
    return EmailServiceFactory.instance;
  }

  /**
   * Create email service based on configuration
   */
  async createEmailService(config: EmailConfigExtended, templateService?: unknown): Promise<EmailService> {
    switch (config.provider) {
      case 'mailhog':
        if (!isMailHogConfig(config)) {
          throw new EmailProviderError('Invalid MailHog configuration', 'mailhog');
        }
        return createMailHogEmailProvider(config, templateService);

      case 'sendgrid':
        if (!isSendGridConfig(config)) {
          throw new EmailProviderError('Invalid SendGrid configuration - API key is required', 'sendgrid');
        }
        return createSendGridEmailProvider(config, templateService);

      case 'ses':
        if (!isAWSSESConfig(config)) {
          throw new EmailProviderError('Invalid AWS SES configuration - region, accessKeyId, and secretAccessKey are required', 'ses');
        }
        return createAWSSESEmailProvider(config, templateService);

      case 'smtp':
        if (!isSMTPConfig(config)) {
          throw new EmailProviderError('Invalid SMTP configuration - host, port, and authentication credentials are required', 'smtp');
        }
        return createSMTPEmailProvider(config, templateService);

      default:
        throw new EmailProviderError(`Unsupported email provider: ${config.provider}`, config.provider);
    }
  }

  /**
   * Get supported providers
   */
  getSupportedProviders(): string[] {
    return [
      'mailhog',
      'sendgrid',
      'ses',
      'smtp'
    ];
  }

  /**
   * Check if provider is supported
   */
  isProviderSupported(provider: string): boolean {
    return this.getSupportedProviders().includes(provider);
  }
}

/**
 * Factory function to create email service factory
 */
export function createEmailServiceFactory(): IEmailServiceFactory {
  return EmailServiceFactory.getInstance();
}

/**
 * Convenience function to create email service
 */
export async function createEmailService(
  config: EmailConfigExtended, 
  templateService?: unknown
): Promise<EmailService> {
  const factory = createEmailServiceFactory();
  return await factory.createEmailService(config, templateService);
}

/**
 * Email service provider registry
 */
export class EmailServiceProviderRegistry {
  private providers = new Map<string, (config: EmailConfigExtended, templateService?: unknown) => Promise<EmailService>>();

  /**
   * Register a provider factory function
   */
  registerProvider(
    name: string, 
    factory: (config: EmailConfigExtended, templateService?: unknown) => Promise<EmailService>
  ): void {
    this.providers.set(name, factory);
  }

  /**
   * Create service using registered provider
   */
  async createService(
    providerName: string, 
    config: EmailConfigExtended, 
    templateService?: unknown
  ): Promise<EmailService> {
    const factory = this.providers.get(providerName);
    if (!factory) {
      throw new EmailProviderError(`Provider '${providerName}' not registered`, providerName);
    }
    return await factory(config, templateService);
  }

  /**
   * Get registered provider names
   */
  getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if provider is registered
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }
}

/**
 * Global provider registry instance
 */
const globalProviderRegistry = new EmailServiceProviderRegistry();

// Register built-in providers
globalProviderRegistry.registerProvider('mailhog', async (config, templateService) => {
  return createMailHogEmailProvider(config, templateService);
});

globalProviderRegistry.registerProvider('sendgrid', async (config, templateService) => {
  return createSendGridEmailProvider(config, templateService);
});

globalProviderRegistry.registerProvider('ses', async (config, templateService) => {
  return createAWSSESEmailProvider(config, templateService);
});

globalProviderRegistry.registerProvider('smtp', async (config, templateService) => {
  return createSMTPEmailProvider(config, templateService);
});

/**
 * Get global provider registry
 */
export function getEmailServiceProviderRegistry(): EmailServiceProviderRegistry {
  return globalProviderRegistry;
}

/**
 * Register a custom email provider
 */
export function registerEmailProvider(
  name: string,
  factory: (config: EmailConfigExtended, templateService?: unknown) => Promise<EmailService>
): void {
  globalProviderRegistry.registerProvider(name, factory);
}

/**
 * Application startup email service initialization
 */
export interface EmailServiceStartupConfig {
  validateConfiguration?: boolean;
  performHealthChecks?: boolean;
  enableFallbacks?: boolean;
  logConfiguration?: boolean;
  failOnConfigurationError?: boolean;
}

/**
 * Initialize email services on application startup
 */
export async function initializeEmailServicesOnStartup(
  config: EmailServiceStartupConfig = {}
): Promise<{
  success: boolean;
  manager: EmailServiceManager | null;
  errors: string[];
  warnings: string[];
  metadata: any;
}> {
  const {
    validateConfiguration = true,
    performHealthChecks = true,
    enableFallbacks = true,
    logConfiguration = true,
    failOnConfigurationError = true
  } = config;

  const result = {
    success: false,
    manager: null as EmailServiceManager | null,
    errors: [] as string[],
    warnings: [] as string[],
    metadata: {} as any
  };

  try {
    if (logConfiguration) {
      console.log('🔧 Initializing email services on application startup...');
    }

    // Create email service manager
    let manager: EmailServiceManager;
    
    if (enableFallbacks) {
      manager = await createEmailServiceWithFallbacks();
    } else {
      const { parseEmailConfig } = await import('./email-config.ts');
      const emailConfig = await parseEmailConfig();
      manager = await createEmailServiceManager(emailConfig);
    }

    result.manager = manager;

    // Validate configuration if requested
    if (validateConfiguration) {
      const { validateEmailConfig } = await import('./email-config.ts');
      const { parseEmailConfig } = await import('./email-config.ts');
      const emailConfig = await parseEmailConfig();
      
      const validation = validateEmailConfig(emailConfig);
      if (!validation.valid) {
        result.errors.push(...validation.errors);
        if (failOnConfigurationError) {
          throw new Error(`Email configuration validation failed: ${validation.errors.join(', ')}`);
        }
      }
      result.warnings.push(...validation.warnings);
    }

    // Perform health checks if requested
    if (performHealthChecks) {
      const healthCheck = await manager.healthCheck();
      result.metadata.healthCheck = healthCheck;
      
      if (!healthCheck.success) {
        const errorMsg = 'Email service health check failed';
        result.warnings.push(errorMsg);
        
        if (failOnConfigurationError) {
          result.errors.push(errorMsg);
        }
      }
    }

    // Collect metadata
    result.metadata.statistics = manager.getServiceStatistics();
    result.metadata.supportedProviders = new EmailServiceFactory().getSupportedProviders();
    
    if (logConfiguration) {
      console.log('📊 Email service statistics:', result.metadata.statistics);
      
      if (result.warnings.length > 0) {
        console.warn('⚠️  Email service warnings:');
        result.warnings.forEach(warning => console.warn(`   - ${warning}`));
      }
    }

    result.success = result.errors.length === 0;

    if (logConfiguration) {
      if (result.success) {
        console.log('✅ Email services initialized successfully on application startup');
      } else {
        console.error('❌ Email services initialization completed with errors');
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    
    if (logConfiguration) {
      console.error('❌ Failed to initialize email services on application startup:', errorMessage);
    }
  }

  return result;
}

/**
 * Validate email service configuration without initializing services
 */
export async function validateEmailServiceConfiguration(): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata: any;
}> {
  try {
    const { parseEmailConfig, validateEmailConfig } = await import('./email-config.ts');
    const config = await parseEmailConfig();
    const validation = validateEmailConfig(config);
    
    const fallbackProviders = parseFallbackProviderConfig();
    
    return {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      metadata: {
        provider: config.provider,
        fallbackProvidersConfigured: fallbackProviders.length,
        fallbackProviders: fallbackProviders.map(fp => ({
          provider: fp.provider,
          priority: fp.priority
        })),
        queueEnabled: config.queue.enabled,
        rateLimitEnabled: config.rateLimit.enabled,
        templatesEnabled: config.templates.cacheEnabled
      }
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      metadata: {}
    };
  }
}

/**
 * Get email service factory instance based on environment
 */
export function getEmailServiceFactory(): IEmailServiceFactory {
  const useEnvironmentFactory = Deno.env.get('EMAIL_USE_ENVIRONMENT_FACTORY') !== 'false';
  
  if (useEnvironmentFactory) {
    return EnvironmentEmailServiceFactory.getInstance();
  } else {
    return EmailServiceFactory.getInstance();
  }
}

/**
 * Email service manager for handling multiple providers and fallbacks
 */
export class EmailServiceManager implements EmailService {
  private primaryService: EmailService | null = null;
  private fallbackServices: EmailService[] = [];
  private config: EmailConfigExtended;
  private healthCheckCache = new Map<string, { result: any; timestamp: number }>();
  private readonly healthCheckCacheTTL = 30000; // 30 seconds

  constructor(config: EmailConfigExtended) {
    this.config = config;
  }

  /**
   * Set primary email service
   */
  setPrimaryService(service: EmailService): void {
    this.primaryService = service;
  }

  /**
   * Add fallback service
   */
  addFallbackService(service: EmailService): void {
    this.fallbackServices.push(service);
  }

  /**
   * Get all configured services
   */
  getAllServices(): EmailService[] {
    const services: EmailService[] = [];
    if (this.primaryService) {
      services.push(this.primaryService);
    }
    services.push(...this.fallbackServices);
    return services;
  }

  /**
   * Get active service (primary or first available fallback)
   */
  async getActiveService(): Promise<EmailService> {
    // Try primary service first
    if (this.primaryService) {
      const isHealthy = await this.isServiceHealthy(this.primaryService, 'primary');
      if (isHealthy) {
        return this.primaryService;
      }
    }

    // Try fallback services
    for (let i = 0; i < this.fallbackServices.length; i++) {
      const fallbackService = this.fallbackServices[i];
      const isHealthy = await this.isServiceHealthy(fallbackService, `fallback-${i}`);
      if (isHealthy) {
        return fallbackService;
      }
    }

    // If no healthy service found, return primary (will fail gracefully)
    if (this.primaryService) {
      return this.primaryService;
    }

    throw new EmailProviderError('No email service available', 'none');
  }

  /**
   * Check if a service is healthy with caching
   */
  private async isServiceHealthy(service: EmailService, cacheKey: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.healthCheckCache.get(cacheKey);
    
    // Use cached result if available and not expired
    if (cached && (now - cached.timestamp) < this.healthCheckCacheTTL) {
      return cached.result.success && cached.result.data?.healthy;
    }

    try {
      const healthCheck = await service.healthCheck();
      const result = {
        result: healthCheck,
        timestamp: now
      };
      
      this.healthCheckCache.set(cacheKey, result);
      return healthCheck.success && healthCheck.data?.healthy;
    } catch (error) {
      // Cache the failure for a shorter time
      const result = {
        result: { success: false, data: { healthy: false } },
        timestamp: now
      };
      this.healthCheckCache.set(cacheKey, result);
      return false;
    }
  }

  /**
   * Send email with automatic fallback
   */
  async send(email: any): Promise<any> {
    const service = await this.getActiveService();
    return await service.send(email);
  }

  /**
   * Send template email with automatic fallback
   */
  async sendTemplate(templateData: any): Promise<any> {
    const service = await this.getActiveService();
    return await service.sendTemplate(templateData);
  }

  /**
   * Send bulk emails with automatic fallback
   */
  async sendBulk(emails: any[]): Promise<any> {
    const service = await this.getActiveService();
    return await service.sendBulk(emails);
  }

  /**
   * Health check for all services
   */
  async healthCheck(): Promise<any> {
    const results = [];

    if (this.primaryService) {
      try {
        const result = await this.primaryService.healthCheck();
        results.push({ type: 'primary', ...result });
      } catch (error) {
        results.push({ 
          type: 'primary', 
          success: false, 
          data: { 
            healthy: false, 
            error: error instanceof Error ? error.message : String(error) 
          } 
        });
      }
    }

    for (let i = 0; i < this.fallbackServices.length; i++) {
      try {
        const result = await this.fallbackServices[i].healthCheck();
        results.push({ type: `fallback-${i}`, ...result });
      } catch (error) {
        results.push({ 
          type: `fallback-${i}`, 
          success: false, 
          data: { 
            healthy: false, 
            error: error instanceof Error ? error.message : String(error) 
          } 
        });
      }
    }

    const hasHealthyService = results.some(r => r.success && r.data?.healthy);

    return {
      success: hasHealthyService,
      data: {
        healthy: hasHealthyService,
        provider: 'manager',
        lastCheck: new Date(),
        services: results,
        primaryHealthy: results.find(r => r.type === 'primary')?.success && 
                       results.find(r => r.type === 'primary')?.data?.healthy,
        fallbacksAvailable: results.filter(r => r.type.startsWith('fallback') && r.success && r.data?.healthy).length
      }
    };
  }

  /**
   * Clear health check cache
   */
  clearHealthCheckCache(): void {
    this.healthCheckCache.clear();
  }

  /**
   * Get service statistics
   */
  getServiceStatistics(): {
    totalServices: number;
    primaryConfigured: boolean;
    fallbacksConfigured: number;
    healthCheckCacheSize: number;
  } {
    return {
      totalServices: this.getAllServices().length,
      primaryConfigured: this.primaryService !== null,
      fallbacksConfigured: this.fallbackServices.length,
      healthCheckCacheSize: this.healthCheckCache.size
    };
  }
}

/**
 * Fallback provider configuration
 */
export interface FallbackProviderConfig {
  provider: EmailConfigExtended['provider'];
  config: Partial<EmailConfigExtended>;
  priority: number; // Lower number = higher priority
}

/**
 * Enhanced email service manager configuration
 */
export interface EmailServiceManagerConfig extends EmailConfigExtended {
  fallbackProviders?: FallbackProviderConfig[];
  enableAutoFailover?: boolean;
  healthCheckInterval?: number;
  maxFailoverAttempts?: number;
}

/**
 * Create email service manager with configuration and fallbacks
 */
export async function createEmailServiceManager(
  config: EmailServiceManagerConfig,
  templateService?: unknown
): Promise<EmailServiceManager> {
  const manager = new EmailServiceManager(config);
  
  try {
    // Create primary service
    const primaryService = await createEmailService(config, templateService);
    manager.setPrimaryService(primaryService);
    
    // Create fallback services if configured
    if (config.fallbackProviders && config.fallbackProviders.length > 0) {
      // Sort fallback providers by priority
      const sortedFallbacks = [...config.fallbackProviders].sort((a, b) => a.priority - b.priority);
      
      for (const fallbackConfig of sortedFallbacks) {
        try {
          // Merge fallback config with base config
          const mergedConfig: EmailConfigExtended = {
            ...config,
            provider: fallbackConfig.provider,
            ...fallbackConfig.config
          };
          
          const fallbackService = await createEmailService(mergedConfig, templateService);
          manager.addFallbackService(fallbackService);
          
          console.log(`✅ Configured fallback email provider: ${fallbackConfig.provider} (priority: ${fallbackConfig.priority})`);
        } catch (error) {
          console.warn(`⚠️  Failed to configure fallback provider ${fallbackConfig.provider}:`, error instanceof Error ? error.message : String(error));
        }
      }
    }
    
    return manager;
  } catch (error) {
    console.error('❌ Failed to create email service manager:', error instanceof Error ? error.message : String(error));
    throw new EmailProviderError(`Failed to create email service manager: ${error instanceof Error ? error.message : String(error)}`, config.provider);
  }
}

/**
 * Parse fallback provider configuration from environment
 */
export function parseFallbackProviderConfig(): FallbackProviderConfig[] {
  const fallbackProviders: FallbackProviderConfig[] = [];
  
  // Check for fallback provider configuration
  const fallbackProvidersEnv = Deno.env.get('EMAIL_FALLBACK_PROVIDERS');
  if (!fallbackProvidersEnv) {
    return fallbackProviders;
  }
  
  try {
    const fallbackConfigs = JSON.parse(fallbackProvidersEnv) as Array<{
      provider: string;
      priority: number;
      config: Record<string, any>;
    }>;
    
    for (const fallbackConfig of fallbackConfigs) {
      if (!fallbackConfig.provider || typeof fallbackConfig.priority !== 'number') {
        console.warn('⚠️  Invalid fallback provider configuration:', fallbackConfig);
        continue;
      }
      
      fallbackProviders.push({
        provider: fallbackConfig.provider as EmailConfigExtended['provider'],
        priority: fallbackConfig.priority,
        config: fallbackConfig.config || {}
      });
    }
  } catch (error) {
    console.warn('⚠️  Failed to parse EMAIL_FALLBACK_PROVIDERS:', error instanceof Error ? error.message : String(error));
  }
  
  return fallbackProviders;
}

/**
 * Create email service with automatic provider selection and fallbacks
 */
export async function createEmailServiceWithFallbacks(
  templateService?: unknown
): Promise<EmailServiceManager> {
  // Parse base configuration
  const { parseEmailConfig } = await import('./email-config.ts');
  const baseConfig = await parseEmailConfig();
  
  // Parse fallback configuration
  const fallbackProviders = parseFallbackProviderConfig();
  
  // Create manager configuration
  const managerConfig: EmailServiceManagerConfig = {
    ...baseConfig,
    fallbackProviders,
    enableAutoFailover: Deno.env.get('EMAIL_ENABLE_AUTO_FAILOVER') !== 'false',
    healthCheckInterval: parseInt(Deno.env.get('EMAIL_HEALTH_CHECK_INTERVAL') || '300000'), // 5 minutes
    maxFailoverAttempts: parseInt(Deno.env.get('EMAIL_MAX_FAILOVER_ATTEMPTS') || '3')
  };
  
  return await createEmailServiceManager(managerConfig, templateService);
}

/**
 * Environment-based email service factory
 */
export class EnvironmentEmailServiceFactory implements IEmailServiceFactory {
  private static instance: EnvironmentEmailServiceFactory | null = null;
  private cachedManager: EmailServiceManager | null = null;
  private lastConfigCheck = 0;
  private readonly configCacheTTL = 300000; // 5 minutes

  /**
   * Get singleton instance
   */
  static getInstance(): EnvironmentEmailServiceFactory {
    if (!EnvironmentEmailServiceFactory.instance) {
      EnvironmentEmailServiceFactory.instance = new EnvironmentEmailServiceFactory();
    }
    return EnvironmentEmailServiceFactory.instance;
  }

  /**
   * Create email service based on environment configuration
   */
  async createEmailService(config?: EmailConfigExtended, templateService?: any): Promise<EmailService> {
    const now = Date.now();
    
    // Use cached manager if available and not expired
    if (this.cachedManager && (now - this.lastConfigCheck) < this.configCacheTTL) {
      return this.cachedManager;
    }
    
    // Create new manager with environment-based configuration
    if (config) {
      // Use provided config
      const manager = await createEmailServiceManager(config, templateService);
      this.cachedManager = manager;
    } else {
      // Use environment-based configuration with fallbacks
      const manager = await createEmailServiceWithFallbacks(templateService);
      this.cachedManager = manager;
    }
    
    this.lastConfigCheck = now;
    return this.cachedManager;
  }

  /**
   * Get supported providers
   */
  getSupportedProviders(): string[] {
    return [
      'mailhog',
      'sendgrid',
      'ses',
      'smtp'
    ];
  }

  /**
   * Check if provider is supported
   */
  isProviderSupported(provider: string): boolean {
    return this.getSupportedProviders().includes(provider);
  }

  /**
   * Clear cached manager (force reconfiguration)
   */
  clearCache(): void {
    this.cachedManager = null;
    this.lastConfigCheck = 0;
  }

  /**
   * Get current manager statistics
   */
  getManagerStatistics(): any {
    if (!this.cachedManager) {
      return null;
    }
    
    return {
      ...this.cachedManager.getServiceStatistics(),
      cacheAge: Date.now() - this.lastConfigCheck,
      cacheTTL: this.configCacheTTL
    };
  }
}