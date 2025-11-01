/**
 * Email Template Service
 * 
 * Provides template rendering with Redis caching, error handling,
 * and fallback mechanisms.
 */

import { Result, Ok, Err } from '../domain/types/common.ts';
import { EmailTemplateConfig, EmailTemplateContext } from '../domain/types/email.ts';
import { 
  EmailTemplateError, 
  EmailTemplateNotFoundError, 
  EmailTemplateRenderingError 
} from '../domain/errors/email-errors.ts';
import { ITemplateEngine, TemplateEngine, RenderedTemplate } from './template-engine.ts';
import { RedisService } from '../domain/services/redis-service.ts';

/**
 * Template service interface
 */
export interface ITemplateService {
  /**
   * Render template with variables and caching
   */
  renderTemplate(templateId: string, variables: EmailTemplateContext): Promise<Result<RenderedTemplate>>;

  /**
   * Get template configuration with caching
   */
  getTemplateConfig(templateId: string): Promise<Result<EmailTemplateConfig>>;

  /**
   * List available templates
   */
  listTemplates(): Promise<Result<string[]>>;

  /**
   * Validate template variables
   */
  validateVariables(templateId: string, variables: EmailTemplateContext): Promise<Result<void>>;

  /**
   * Clear template cache
   */
  clearCache(templateId?: string): Promise<void>;

  /**
   * Warm template cache
   */
  warmCache(): Promise<void>;

  /**
   * Get cache statistics
   */
  getCacheStats(): Promise<{
    totalTemplates: number;
    cachedTemplates: number;
    cacheHitRate: number;
    lastWarmed?: Date;
  }>;
}

/**
 * Template service implementation with Redis caching
 */
export class TemplateService implements ITemplateService {
  private templateEngine: ITemplateEngine;
  private redisService: RedisService;
  private cacheEnabled: boolean;
  private cacheTTLSeconds: number;
  private cacheKeyPrefix = 'email:template';
  private cacheStats = {
    hits: 0,
    misses: 0,
    lastWarmed: undefined as Date | undefined,
  };

  constructor(
    templateEngine: ITemplateEngine,
    redisService: RedisService,
    cacheEnabled: boolean = true,
    cacheTTLSeconds: number = 3600
  ) {
    this.templateEngine = templateEngine;
    this.redisService = redisService;
    this.cacheEnabled = cacheEnabled;
    this.cacheTTLSeconds = cacheTTLSeconds;
  }

  /**
   * Render template with variables and caching
   */
  async renderTemplate(templateId: string, variables: EmailTemplateContext): Promise<Result<RenderedTemplate>> {
    try {
      // Create cache key based on template ID and variables hash
      const variablesHash = await this.hashVariables(variables);
      const cacheKey = `${this.cacheKeyPrefix}:rendered:${templateId}:${variablesHash}`;

      // Try to get from cache first
      if (this.cacheEnabled) {
        try {
          const cached = await this.redisService.get<RenderedTemplate>(cacheKey);
          if (cached) {
            this.cacheStats.hits++;
            return Ok(cached);
          }
        } catch (error) {
          // Cache error shouldn't fail the operation, just log it
          console.warn(`Template cache get error for ${templateId}:`, error);
        }
      }

      this.cacheStats.misses++;

      // Render template using engine
      const renderResult = await this.templateEngine.renderTemplate(templateId, variables);
      if (!renderResult.success) {
        return Err(renderResult.error);
      }

      const rendered = renderResult.data;

      // Cache the rendered result
      if (this.cacheEnabled) {
        try {
          await this.redisService.set(cacheKey, rendered, this.cacheTTLSeconds);
        } catch (error) {
          // Cache error shouldn't fail the operation, just log it
          console.warn(`Template cache set error for ${templateId}:`, error);
        }
      }

      return Ok(rendered);

    } catch (error) {
      return Err(new EmailTemplateRenderingError(
        `Failed to render template '${templateId}': ${error instanceof Error ? error.message : String(error)}`,
        templateId
      ));
    }
  }

  /**
   * Get template configuration with caching
   */
  async getTemplateConfig(templateId: string): Promise<Result<EmailTemplateConfig>> {
    try {
      const cacheKey = `${this.cacheKeyPrefix}:config:${templateId}`;

      // Try to get from cache first
      if (this.cacheEnabled) {
        try {
          const cached = await this.redisService.get<EmailTemplateConfig>(cacheKey);
          if (cached) {
            this.cacheStats.hits++;
            return Ok(cached);
          }
        } catch (error) {
          console.warn(`Template config cache get error for ${templateId}:`, error);
        }
      }

      this.cacheStats.misses++;

      // Get config from template engine
      const configResult = await this.templateEngine.getTemplateConfig(templateId);
      if (!configResult.success) {
        return Err(configResult.error);
      }

      const config = configResult.data;

      // Cache the config
      if (this.cacheEnabled) {
        try {
          await this.redisService.set(cacheKey, config, this.cacheTTLSeconds);
        } catch (error) {
          console.warn(`Template config cache set error for ${templateId}:`, error);
        }
      }

      return Ok(config);

    } catch (error) {
      return Err(new EmailTemplateError(
        `Failed to get template configuration for '${templateId}': ${error instanceof Error ? error.message : String(error)}`,
        templateId
      ));
    }
  }

  /**
   * List available templates
   */
  async listTemplates(): Promise<Result<string[]>> {
    try {
      const cacheKey = `${this.cacheKeyPrefix}:list`;

      // Try to get from cache first
      if (this.cacheEnabled) {
        try {
          const cached = await this.redisService.get<string[]>(cacheKey);
          if (cached) {
            this.cacheStats.hits++;
            return Ok(cached);
          }
        } catch (error) {
          console.warn('Template list cache get error:', error);
        }
      }

      this.cacheStats.misses++;

      // Get list from template engine
      const listResult = await this.templateEngine.listTemplates();
      if (!listResult.success) {
        return Err(listResult.error);
      }

      const templates = listResult.data;

      // Cache the list (shorter TTL since it might change)
      if (this.cacheEnabled) {
        try {
          await this.redisService.set(cacheKey, templates, Math.min(this.cacheTTLSeconds, 300)); // Max 5 minutes
        } catch (error) {
          console.warn('Template list cache set error:', error);
        }
      }

      return Ok(templates);

    } catch (error) {
      return Err(new EmailTemplateError(
        `Failed to list templates: ${error instanceof Error ? error.message : String(error)}`
      ));
    }
  }

  /**
   * Validate template variables
   */
  async validateVariables(templateId: string, variables: EmailTemplateContext): Promise<Result<void>> {
    return await this.templateEngine.validateVariables(templateId, variables);
  }

  /**
   * Clear template cache
   */
  async clearCache(templateId?: string): Promise<void> {
    try {
      if (templateId) {
        // Clear specific template cache
        const patterns = [
          `${this.cacheKeyPrefix}:config:${templateId}`,
          `${this.cacheKeyPrefix}:rendered:${templateId}:*`,
        ];

        for (const pattern of patterns) {
          try {
            await this.deleteByPattern(pattern);
          } catch (error) {
            console.warn(`Failed to clear cache pattern ${pattern}:`, error);
          }
        }
      } else {
        // Clear all template cache
        try {
          await this.deleteByPattern(`${this.cacheKeyPrefix}:*`);
        } catch (error) {
          console.warn('Failed to clear all template cache:', error);
        }
      }

      // Also clear engine cache
      await this.templateEngine.clearCache(templateId);

      // Reset cache stats if clearing all
      if (!templateId) {
        this.cacheStats.hits = 0;
        this.cacheStats.misses = 0;
      }

    } catch (error) {
      console.error('Template cache clear error:', error);
      throw error;
    }
  }

  /**
   * Warm template cache
   */
  async warmCache(): Promise<void> {
    try {
      console.log('🔥 Warming email template cache...');

      // Get list of all templates
      const templatesResult = await this.templateEngine.listTemplates();
      if (!templatesResult.success) {
        throw new Error(`Failed to get template list: ${templatesResult.error.message}`);
      }

      const templates = templatesResult.data;
      let warmedCount = 0;

      // Warm cache for each template configuration
      for (const templateId of templates) {
        try {
          const configResult = await this.getTemplateConfig(templateId);
          if (configResult.success) {
            warmedCount++;
          } else {
            console.warn(`Failed to warm cache for template ${templateId}:`, configResult.error.message);
          }
        } catch (error) {
          console.warn(`Error warming cache for template ${templateId}:`, error);
        }
      }

      this.cacheStats.lastWarmed = new Date();
      console.log(`✅ Template cache warmed: ${warmedCount}/${templates.length} templates`);

    } catch (error) {
      console.error('Template cache warming failed:', error);
      throw error;
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
    try {
      // Get total templates
      const templatesResult = await this.listTemplates();
      const totalTemplates = templatesResult.success ? templatesResult.data.length : 0;

      // Calculate cache hit rate
      const totalRequests = this.cacheStats.hits + this.cacheStats.misses;
      const cacheHitRate = totalRequests > 0 ? (this.cacheStats.hits / totalRequests) * 100 : 0;

      // Count cached templates (approximate)
      let cachedTemplates = 0;
      try {
        const cacheKeys = await this.redisService.keys(`${this.cacheKeyPrefix}:config:*`);
        cachedTemplates = cacheKeys.length;
      } catch {
        // If we can't get keys, use 0
      }

      return {
        totalTemplates,
        cachedTemplates,
        cacheHitRate: Math.round(cacheHitRate * 100) / 100,
        lastWarmed: this.cacheStats.lastWarmed,
      };

    } catch (error) {
      console.warn('Failed to get template cache stats:', error);
      return {
        totalTemplates: 0,
        cachedTemplates: 0,
        cacheHitRate: 0,
        lastWarmed: this.cacheStats.lastWarmed,
      };
    }
  }

  /**
   * Delete keys by pattern
   */
  private async deleteByPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redisService.keys(pattern);
      if (keys.length > 0) {
        // Delete keys in batches to avoid blocking Redis
        const batchSize = 100;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          await Promise.all(batch.map(key => this.redisService.del(key)));
        }
      }
    } catch (error) {
      console.warn(`Failed to delete keys by pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Hash variables for cache key generation
   */
  private async hashVariables(variables: EmailTemplateContext): Promise<string> {
    try {
      // Create a stable string representation of variables
      const sortedKeys = Object.keys(variables).sort();
      const stableString = sortedKeys.map(key => `${key}:${JSON.stringify(variables[key])}`).join('|');
      
      // Create a simple hash (for cache key purposes)
      const encoder = new TextEncoder();
      const data = encoder.encode(stableString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Return first 16 characters for cache key
      return hashHex.substring(0, 16);
      
    } catch (error) {
      // Fallback to simple string hash if crypto fails
      const str = JSON.stringify(variables);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash).toString(16);
    }
  }
}

/**
 * Create template service instance
 */
export function createTemplateService(
  templateEngine: ITemplateEngine,
  redisService: RedisService,
  cacheEnabled?: boolean,
  cacheTTLSeconds?: number
): ITemplateService {
  return new TemplateService(templateEngine, redisService, cacheEnabled, cacheTTLSeconds);
}

/**
 * Create template service with default template engine
 */
export function createTemplateServiceWithDefaults(
  redisService: RedisService,
  basePath?: string,
  cacheEnabled?: boolean,
  cacheTTLSeconds?: number
): ITemplateService {
  const templateEngine = new TemplateEngine(basePath, false, 0); // Disable engine cache, use Redis instead
  return new TemplateService(templateEngine, redisService, cacheEnabled, cacheTTLSeconds);
}