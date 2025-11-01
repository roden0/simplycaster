/**
 * Email Service Initializer
 * 
 * Handles email service initialization, configuration validation,
 * and startup health checks for the email system.
 */

import { Container } from '../../container/container.ts';
import { ServiceKeys } from '../../container/registry.ts';
import { IEmailConfigService } from './email-config-service.ts';

/**
 * Email initializer class
 */
export class EmailInitializer {
  constructor(private container: Container) {}

  /**
   * Initialize email services
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔧 Initializing email services...');

      // Get email configuration service from container
      const emailConfigService = this.container.getSync<IEmailConfigService>(ServiceKeys.EMAIL_CONFIG_SERVICE);

      // Initialize email configuration service
      await emailConfigService.initialize();

      // Validate configuration
      const validation = await emailConfigService.validateConfig();
      if (!validation.valid) {
        throw new Error(`Email configuration validation failed: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        console.warn('⚠️  Email configuration warnings:');
        validation.warnings.forEach(warning => console.warn(`   - ${warning}`));
      }

      // Perform health check
      const healthCheck = await emailConfigService.healthCheck();
      if (!healthCheck.configValid) {
        throw new Error(`Email configuration health check failed: ${healthCheck.errors.join(', ')}`);
      }

      if (!healthCheck.providerReachable) {
        console.warn('⚠️  Email provider connectivity test failed');
        console.warn('   This may be expected in development or if the provider is temporarily unavailable');
      }

      // Log configuration metadata
      const metadata = emailConfigService.getConfigMetadata();
      console.log('✅ Email services initialized successfully:', {
        provider: metadata.provider,
        queueEnabled: metadata.queueEnabled,
        rateLimitEnabled: metadata.rateLimitEnabled,
        templatesEnabled: metadata.templatesEnabled,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to initialize email services:', errorMessage);
      throw new Error(`Email services initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Cleanup email services
   */
  async cleanup(): Promise<void> {
    try {
      const emailConfigService = this.container.getSync<IEmailConfigService>(ServiceKeys.EMAIL_CONFIG_SERVICE);
      
      if (emailConfigService && 'cleanup' in emailConfigService) {
        await (emailConfigService as any).cleanup();
      }

      console.log('✅ Email services cleaned up successfully');
    } catch (error) {
      console.error('❌ Error during email services cleanup:', error);
    }
  }

  /**
   * Get email service health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    provider: string;
    configValid: boolean;
    providerReachable: boolean;
    lastCheck: Date;
    errors: string[];
  }> {
    try {
      const emailConfigService = this.container.getSync<IEmailConfigService>(ServiceKeys.EMAIL_CONFIG_SERVICE);
      const healthCheck = await emailConfigService.healthCheck();
      const metadata = emailConfigService.getConfigMetadata();

      return {
        healthy: healthCheck.configValid && healthCheck.providerReachable,
        provider: metadata.provider,
        configValid: healthCheck.configValid,
        providerReachable: healthCheck.providerReachable,
        lastCheck: healthCheck.lastCheck,
        errors: healthCheck.errors,
      };
    } catch (error) {
      return {
        healthy: false,
        provider: 'unknown',
        configValid: false,
        providerReachable: false,
        lastCheck: new Date(),
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Reload email configuration
   */
  async reloadConfiguration(): Promise<void> {
    try {
      console.log('🔄 Reloading email configuration...');
      
      const emailConfigService = this.container.getSync<IEmailConfigService>(ServiceKeys.EMAIL_CONFIG_SERVICE);
      
      if ('reloadConfig' in emailConfigService) {
        await (emailConfigService as any).reloadConfig();
      } else {
        // If reload is not supported, reinitialize
        await emailConfigService.initialize();
      }

      console.log('✅ Email configuration reloaded successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to reload email configuration:', errorMessage);
      throw new Error(`Email configuration reload failed: ${errorMessage}`);
    }
  }
}

/**
 * Create email initializer instance
 */
export function createEmailInitializer(container: Container): EmailInitializer {
  return new EmailInitializer(container);
}

/**
 * Initialize email services with container
 */
export async function initializeEmailServices(container: Container): Promise<void> {
  const initializer = createEmailInitializer(container);
  await initializer.initialize();
}

/**
 * Validate email configuration on application startup
 */
export async function validateEmailOnStartup(container: Container): Promise<void> {
  try {
    console.log('🔍 Validating email configuration on application startup...');
    
    const initializer = createEmailInitializer(container);
    await initializer.initialize();
    
    const healthStatus = await initializer.getHealthStatus();
    
    if (!healthStatus.healthy) {
      console.warn('⚠️  Email service is not fully healthy but continuing startup');
      console.warn('   Configuration valid:', healthStatus.configValid);
      console.warn('   Provider reachable:', healthStatus.providerReachable);
      
      if (healthStatus.errors.length > 0) {
        console.warn('   Errors:', healthStatus.errors);
      }
    }
    
    console.log('✅ Email configuration startup validation completed');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Email configuration startup validation failed:', errorMessage);
    
    // In development, we might want to continue even if email is not configured
    const isDevelopment = Deno.env.get('DENO_ENV') === 'development' || Deno.env.get('NODE_ENV') === 'development';
    
    if (isDevelopment) {
      console.warn('⚠️  Continuing startup in development mode despite email configuration issues');
      return;
    }
    
    throw new Error(`Email configuration startup validation failed: ${errorMessage}`);
  }
}