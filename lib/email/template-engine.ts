/**
 * Email Template Engine
 * 
 * Provides template rendering with variable substitution, safety checks,
 * and caching using Redis infrastructure.
 */

import { Result, Ok, Err } from '../domain/types/common.ts';
import { EmailTemplateConfig, EmailTemplateContext } from '../domain/types/email.ts';
import { 
  EmailTemplateError, 
  EmailTemplateNotFoundError, 
  EmailTemplateRenderingError 
} from '../domain/errors/email-errors.ts';

/**
 * Template file structure
 */
export interface TemplateFiles {
  html?: string;
  text?: string;
  config: EmailTemplateConfig;
}

/**
 * Rendered template result
 */
export interface RenderedTemplate {
  html?: string;
  text?: string;
  subject: string;
  previewText?: string;
}

/**
 * Template engine interface
 */
export interface ITemplateEngine {
  /**
   * Load template files from disk
   */
  loadTemplate(templateId: string): Promise<Result<TemplateFiles>>;

  /**
   * Render template with variables
   */
  renderTemplate(templateId: string, variables: EmailTemplateContext): Promise<Result<RenderedTemplate>>;

  /**
   * Validate template variables
   */
  validateVariables(templateId: string, variables: EmailTemplateContext): Promise<Result<void>>;

  /**
   * Get template configuration
   */
  getTemplateConfig(templateId: string): Promise<Result<EmailTemplateConfig>>;

  /**
   * List available templates
   */
  listTemplates(): Promise<Result<string[]>>;

  /**
   * Clear template cache
   */
  clearCache(templateId?: string): Promise<void>;
}

/**
 * Template engine implementation
 */
export class TemplateEngine implements ITemplateEngine {
  private templateCache = new Map<string, TemplateFiles>();
  private cacheEnabled: boolean;
  private cacheTTLSeconds: number;
  private basePath: string;

  constructor(
    basePath: string = 'lib/email/templates',
    cacheEnabled: boolean = true,
    cacheTTLSeconds: number = 3600
  ) {
    this.basePath = basePath;
    this.cacheEnabled = cacheEnabled;
    this.cacheTTLSeconds = cacheTTLSeconds;
  }

  /**
   * Load template files from disk
   */
  async loadTemplate(templateId: string): Promise<Result<TemplateFiles>> {
    try {
      // Check cache first
      if (this.cacheEnabled && this.templateCache.has(templateId)) {
        return Ok(this.templateCache.get(templateId)!);
      }

      const templatePath = `${this.basePath}/${templateId}`;
      
      // Check if template directory exists
      try {
        const stat = await Deno.stat(templatePath);
        if (!stat.isDirectory) {
          return Err(new EmailTemplateNotFoundError(templateId));
        }
      } catch {
        return Err(new EmailTemplateNotFoundError(templateId));
      }

      // Load configuration file
      const configPath = `${templatePath}/config.json`;
      let config: EmailTemplateConfig;
      
      try {
        const configContent = await Deno.readTextFile(configPath);
        config = JSON.parse(configContent);
        
        // Validate config structure
        if (!config.id || !config.subject || !Array.isArray(config.requiredVariables)) {
          return Err(new EmailTemplateError(
            `Invalid template configuration for '${templateId}': missing required fields`,
            templateId
          ));
        }
        
        // Ensure template ID matches directory name
        if (config.id !== templateId) {
          return Err(new EmailTemplateError(
            `Template ID mismatch: directory '${templateId}' but config has ID '${config.id}'`,
            templateId
          ));
        }
        
      } catch (error) {
        return Err(new EmailTemplateError(
          `Failed to load template configuration for '${templateId}': ${error instanceof Error ? error.message : String(error)}`,
          templateId
        ));
      }

      // Load HTML template (optional)
      let html: string | undefined;
      const htmlPath = `${templatePath}/template.html`;
      try {
        html = await Deno.readTextFile(htmlPath);
      } catch {
        // HTML template is optional
      }

      // Load text template (optional)
      let text: string | undefined;
      const textPath = `${templatePath}/template.txt`;
      try {
        text = await Deno.readTextFile(textPath);
      } catch {
        // Text template is optional
      }

      // At least one template (HTML or text) must exist
      if (!html && !text) {
        return Err(new EmailTemplateError(
          `Template '${templateId}' must have at least one template file (template.html or template.txt)`,
          templateId
        ));
      }

      const templateFiles: TemplateFiles = {
        html,
        text,
        config,
      };

      // Cache the template
      if (this.cacheEnabled) {
        this.templateCache.set(templateId, templateFiles);
        
        // Set cache expiration (simple timeout-based expiration)
        setTimeout(() => {
          this.templateCache.delete(templateId);
        }, this.cacheTTLSeconds * 1000);
      }

      return Ok(templateFiles);

    } catch (error) {
      return Err(new EmailTemplateError(
        `Failed to load template '${templateId}': ${error instanceof Error ? error.message : String(error)}`,
        templateId
      ));
    }
  }

  /**
   * Render template with variables
   */
  async renderTemplate(templateId: string, variables: EmailTemplateContext): Promise<Result<RenderedTemplate>> {
    try {
      // Load template
      const templateResult = await this.loadTemplate(templateId);
      if (!templateResult.success) {
        return Err(templateResult.error);
      }

      const template = templateResult.data;

      // Validate variables
      const validationResult = await this.validateVariables(templateId, variables);
      if (!validationResult.success) {
        return Err(validationResult.error);
      }

      // Render subject
      const subject = this.renderString(template.config.subject, variables);
      if (!subject.success) {
        return Err(new EmailTemplateRenderingError(
          `Failed to render subject for template '${templateId}': ${subject.error.message}`,
          templateId
        ));
      }

      // Render preview text
      let previewText: string | undefined;
      if (template.config.previewText) {
        const previewResult = this.renderString(template.config.previewText, variables);
        if (previewResult.success) {
          previewText = previewResult.data;
        }
      }

      // Render HTML template
      let html: string | undefined;
      if (template.html) {
        const htmlResult = this.renderString(template.html, variables);
        if (!htmlResult.success) {
          return Err(new EmailTemplateRenderingError(
            `Failed to render HTML template '${templateId}': ${htmlResult.error.message}`,
            templateId
          ));
        }
        html = htmlResult.data;
      }

      // Render text template
      let text: string | undefined;
      if (template.text) {
        const textResult = this.renderString(template.text, variables);
        if (!textResult.success) {
          return Err(new EmailTemplateRenderingError(
            `Failed to render text template '${templateId}': ${textResult.error.message}`,
            templateId
          ));
        }
        text = textResult.data;
      }

      const rendered: RenderedTemplate = {
        html,
        text,
        subject: subject.data,
        previewText,
      };

      return Ok(rendered);

    } catch (error) {
      return Err(new EmailTemplateRenderingError(
        `Failed to render template '${templateId}': ${error instanceof Error ? error.message : String(error)}`,
        templateId
      ));
    }
  }

  /**
   * Validate template variables
   */
  async validateVariables(templateId: string, variables: EmailTemplateContext): Promise<Result<void>> {
    try {
      // Load template configuration
      const templateResult = await this.loadTemplate(templateId);
      if (!templateResult.success) {
        return Err(templateResult.error);
      }

      const config = templateResult.data.config;
      const missingVariables: string[] = [];

      // Check required variables
      for (const requiredVar of config.requiredVariables) {
        if (!(requiredVar in variables) || variables[requiredVar] === null || variables[requiredVar] === undefined) {
          missingVariables.push(requiredVar);
        }
      }

      if (missingVariables.length > 0) {
        return Err(new EmailTemplateRenderingError(
          `Missing required variables for template '${templateId}': ${missingVariables.join(', ')}`,
          templateId
        ));
      }

      // Validate variable types (basic validation)
      for (const [key, value] of Object.entries(variables)) {
        if (value !== null && value !== undefined) {
          const type = typeof value;
          if (!['string', 'number', 'boolean'].includes(type) && !(value instanceof Date)) {
            return Err(new EmailTemplateRenderingError(
              `Invalid variable type for '${key}' in template '${templateId}': expected string, number, boolean, or Date, got ${type}`,
              templateId,
              key
            ));
          }
        }
      }

      return Ok(undefined);

    } catch (error) {
      return Err(new EmailTemplateRenderingError(
        `Failed to validate variables for template '${templateId}': ${error instanceof Error ? error.message : String(error)}`,
        templateId
      ));
    }
  }

  /**
   * Get template configuration
   */
  async getTemplateConfig(templateId: string): Promise<Result<EmailTemplateConfig>> {
    try {
      const templateResult = await this.loadTemplate(templateId);
      if (!templateResult.success) {
        return Err(templateResult.error);
      }

      return Ok(templateResult.data.config);

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
      const templates: string[] = [];

      try {
        for await (const entry of Deno.readDir(this.basePath)) {
          if (entry.isDirectory) {
            // Check if it has a config.json file
            const configPath = `${this.basePath}/${entry.name}/config.json`;
            try {
              await Deno.stat(configPath);
              templates.push(entry.name);
            } catch {
              // Skip directories without config.json
            }
          }
        }
      } catch (error) {
        return Err(new EmailTemplateError(
          `Failed to read templates directory '${this.basePath}': ${error instanceof Error ? error.message : String(error)}`
        ));
      }

      return Ok(templates.sort());

    } catch (error) {
      return Err(new EmailTemplateError(
        `Failed to list templates: ${error instanceof Error ? error.message : String(error)}`
      ));
    }
  }

  /**
   * Clear template cache
   */
  async clearCache(templateId?: string): Promise<void> {
    if (templateId) {
      this.templateCache.delete(templateId);
    } else {
      this.templateCache.clear();
    }
  }

  /**
   * Render a string with variable substitution
   */
  private renderString(template: string, variables: EmailTemplateContext): Result<string> {
    try {
      let rendered = template;

      // Handle conditional blocks: {{#variable}}content{{/variable}}
      const conditionalRegex = /\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
      rendered = rendered.replace(conditionalRegex, (match, variableName, content) => {
        const trimmedName = variableName.trim();
        const value = variables[trimmedName];
        
        // Show content if variable exists and is truthy
        if (value !== null && value !== undefined && value !== false && value !== '') {
          return content;
        }
        
        return '';
      });

      // Simple mustache-style variable substitution: {{variableName}}
      const variableRegex = /\{\{([^}]+)\}\}/g;
      
      rendered = rendered.replace(variableRegex, (match, variableName) => {
        const trimmedName = variableName.trim();
        
        // Skip conditional markers that weren't processed
        if (trimmedName.startsWith('#') || trimmedName.startsWith('/')) {
          return match;
        }
        
        if (!(trimmedName in variables)) {
          throw new Error(`Variable '${trimmedName}' not found`);
        }

        const value = variables[trimmedName];
        
        if (value === null || value === undefined) {
          return '';
        }

        // Format different types appropriately
        if (value instanceof Date) {
          return value.toLocaleDateString() + ' ' + value.toLocaleTimeString();
        }

        if (typeof value === 'boolean') {
          return value ? 'true' : 'false';
        }

        if (typeof value === 'number') {
          return value.toString();
        }

        if (typeof value === 'string') {
          // Basic HTML escaping for safety
          return this.escapeHtml(value);
        }

        // For arrays and objects, convert to JSON
        if (Array.isArray(value) || typeof value === 'object') {
          return JSON.stringify(value);
        }

        return String(value);
      });

      return Ok(rendered);

    } catch (error) {
      return Err(new Error(error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Basic HTML escaping for safety
   */
  private escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };

    return text.replace(/[&<>"']/g, (match) => htmlEscapes[match] || match);
  }
}

/**
 * Create template engine instance
 */
export function createTemplateEngine(
  basePath?: string,
  cacheEnabled?: boolean,
  cacheTTLSeconds?: number
): ITemplateEngine {
  return new TemplateEngine(basePath, cacheEnabled, cacheTTLSeconds);
}