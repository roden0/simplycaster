/**
 * Email Template Service Infrastructure Implementation
 * 
 * Integrates the email template system with the existing infrastructure,
 * including Redis caching and dependency injection.
 */

import { Result } from '../../domain/types/common.ts';
import { EmailTemplateConfig, EmailTemplateContext } from '../../domain/types/email.ts';
import { RedisService } from '../../domain/services/redis-service.ts';
import { 
  ITemplateService, 
  TemplateService, 
  createTemplateServiceWithDefaults,
  RenderedTemplate 
} from '../../email/index.ts';
import { EmailConfigExtended } from './email-config.ts';

/**
 * Email template service factory
 */
export interface IEmailTemplateServiceFactory {
  /**
   * Create template service instance
   */
  createTemplateService(config: EmailConfigExtended, redisService: RedisService): ITemplateService;
}

/**
 * Email template service factory implementation
 */
export class EmailTemplateServiceFactory implements IEmailTemplateServiceFactory {
  /**
   * Create template service instance
   */
  createTemplateService(config: EmailConfigExtended, redisService: RedisService): ITemplateService {
    return createTemplateServiceWithDefaults(
      redisService,
      config.templates.basePath,
      config.templates.cacheEnabled,
      config.templates.cacheTTLSeconds
    );
  }
}

/**
 * Email template service wrapper for infrastructure integration
 */
export class EmailTemplateServiceWrapper implements ITemplateService {
  private templateService: ITemplateService;
  private config: EmailConfigExtended;

  constructor(templateService: ITemplateService, config: EmailConfigExtended) {
    this.templateService = templateService;
    this.config = config;
  }

  /**
   * Render template with variables and caching
   */
  async renderTemplate(templateId: string, variables: EmailTemplateContext): Promise<Result<RenderedTemplate>> {
    return await this.templateService.renderTemplate(templateId, variables);
  }

  /**
   * Get template configuration with caching
   */
  async getTemplateConfig(templateId: string): Promise<Result<EmailTemplateConfig>> {
    return await this.templateService.getTemplateConfig(templateId);
  }

  /**
   * List available templates
   */
  async listTemplates(): Promise<Result<string[]>> {
    return await this.templateService.listTemplates();
  }

  /**
   * Validate template variables
   */
  async validateVariables(templateId: string, variables: EmailTemplateContext): Promise<Result<void>> {
    return await this.templateService.validateVariables(templateId, variables);
  }

  /**
   * Clear template cache
   */
  async clearCache(templateId?: string): Promise<void> {
    await this.templateService.clearCache(templateId);
  }

  /**
   * Warm template cache
   */
  async warmCache(): Promise<void> {
    if (this.config.templates.cacheEnabled) {
      await this.templateService.warmCache();
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalTemplates: number;
    cachedTemplates: number;
    cacheHitRate: number;
    lastWarmed?: Date;
  }> {
    return await this.templateService.getCacheStats();
  }

  /**
   * Get template service configuration
   */
  getConfig(): EmailConfigExtended {
    return this.config;
  }
}

/**
 * Email template service initializer
 */
export class EmailTemplateServiceInitializer {
  private templateService: EmailTemplateServiceWrapper | null = null;
  private initialized = false;

  /**
   * Initialize email template service
   */
  async initialize(config: EmailConfigExtended, redisService: RedisService): Promise<EmailTemplateServiceWrapper> {
    if (this.initialized && this.templateService) {
      return this.templateService;
    }

    try {
      console.log('🎨 Initializing email template service...');

      // Create template service factory
      const factory = new EmailTemplateServiceFactory();
      const templateService = factory.createTemplateService(config, redisService);

      // Wrap with infrastructure integration
      this.templateService = new EmailTemplateServiceWrapper(templateService, config);

      // Validate template directory exists
      try {
        await Deno.stat(config.templates.basePath);
      } catch {
        console.warn(`⚠️  Template directory '${config.templates.basePath}' does not exist, creating it...`);
        await Deno.mkdir(config.templates.basePath, { recursive: true });
      }

      // List available templates
      const templatesResult = await this.templateService.listTemplates();
      if (templatesResult.success) {
        const templates = templatesResult.data;
        console.log(`✅ Found ${templates.length} email templates: ${templates.join(', ')}`);
      } else {
        console.warn('⚠️  Failed to list email templates:', templatesResult.error.message);
      }

      // Warm cache if enabled
      if (config.templates.cacheEnabled) {
        try {
          await this.templateService.warmCache();
          console.log('✅ Email template cache warmed successfully');
        } catch (error) {
          console.warn('⚠️  Failed to warm template cache:', error);
        }
      }

      this.initialized = true;
      console.log('✅ Email template service initialized successfully');

      return this.templateService;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to initialize email template service:', errorMessage);
      throw new Error(`Email template service initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Get initialized template service
   */
  getTemplateService(): EmailTemplateServiceWrapper | null {
    return this.templateService;
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.templateService) {
      await this.templateService.clearCache();
    }
    this.templateService = null;
    this.initialized = false;
    console.log('✅ Email template service cleaned up');
  }
}

/**
 * Global email template service initializer instance
 */
let globalTemplateServiceInitializer: EmailTemplateServiceInitializer | null = null;

/**
 * Get or create global email template service initializer
 */
export function getEmailTemplateServiceInitializer(): EmailTemplateServiceInitializer {
  if (!globalTemplateServiceInitializer) {
    globalTemplateServiceInitializer = new EmailTemplateServiceInitializer();
  }
  return globalTemplateServiceInitializer;
}

/**
 * Initialize global email template service
 */
export async function initializeEmailTemplateService(
  config: EmailConfigExtended, 
  redisService: RedisService
): Promise<EmailTemplateServiceWrapper> {
  const initializer = getEmailTemplateServiceInitializer();
  return await initializer.initialize(config, redisService);
}

/**
 * Get initialized email template service
 */
export function getEmailTemplateService(): EmailTemplateServiceWrapper | null {
  const initializer = getEmailTemplateServiceInitializer();
  return initializer.getTemplateService();
}

/**
 * Template service health check
 */
export interface EmailTemplateServiceHealthCheck {
  initialized: boolean;
  templatesAvailable: number;
  cacheEnabled: boolean;
  cacheStats?: {
    totalTemplates: number;
    cachedTemplates: number;
    cacheHitRate: number;
    lastWarmed?: Date;
  };
  lastCheck: Date;
  errors: string[];
}

/**
 * Perform email template service health check
 */
export async function performEmailTemplateServiceHealthCheck(): Promise<EmailTemplateServiceHealthCheck> {
  const result: EmailTemplateServiceHealthCheck = {
    initialized: false,
    templatesAvailable: 0,
    cacheEnabled: false,
    lastCheck: new Date(),
    errors: [],
  };

  try {
    const templateService = getEmailTemplateService();
    
    if (!templateService) {
      result.errors.push('Email template service not initialized');
      return result;
    }

    result.initialized = true;
    result.cacheEnabled = templateService.getConfig().templates.cacheEnabled;

    // Check available templates
    const templatesResult = await templateService.listTemplates();
    if (templatesResult.success) {
      result.templatesAvailable = templatesResult.data.length;
    } else {
      result.errors.push(`Failed to list templates: ${templatesResult.error.message}`);
    }

    // Get cache stats if caching is enabled
    if (result.cacheEnabled) {
      try {
        result.cacheStats = await templateService.getCacheStats();
      } catch (error) {
        result.errors.push(`Failed to get cache stats: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

  } catch (error) {
    result.errors.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}