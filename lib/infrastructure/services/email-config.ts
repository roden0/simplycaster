/**
 * Email Configuration Interface and Environment Variable Parsing
 * 
 * Provides configuration management for email service with
 * environment variables, validation, and health checks.
 */

import { EmailConfig } from '../../domain/services/email-service.ts';
import { getConfig } from '../../secrets.ts';

/**
 * Extended email configuration with additional operational settings
 */
export interface EmailConfigExtended extends EmailConfig {
  // Health check settings
  healthCheck: {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
    retryAttempts: number;
  };
  
  // Logging and monitoring
  logging: {
    enabled: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    logSentEmails: boolean;
    logFailedEmails: boolean;
  };
  
  // Rate limiting
  rateLimit: {
    enabled: boolean;
    maxEmailsPerMinute: number;
    maxEmailsPerHour: number;
    maxEmailsPerDay: number;
  };
  
  // Template settings
  templates: {
    cacheEnabled: boolean;
    cacheTTLSeconds: number;
    basePath: string;
  };
}

/**
 * Email configuration validation result
 */
export interface EmailConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Parse email configuration from environment variables and secrets
 */
export async function parseEmailConfig(): Promise<EmailConfigExtended> {
  const provider = (await getConfig('EMAIL_PROVIDER', 'email_provider', 'mailhog')) as EmailConfig['provider'];
  
  // Base configuration
  const config: EmailConfigExtended = {
    provider,
    from: {
      email: await getConfig('EMAIL_FROM_ADDRESS', 'email_from_address', 'noreply@simplycast.local') || 'noreply@simplycast.local',
      name: await getConfig('EMAIL_FROM_NAME', 'email_from_name', 'SimplyCaster') || 'SimplyCaster',
    },
    queue: {
      enabled: (await getConfig('EMAIL_QUEUE_ENABLED', undefined, 'true')) === 'true',
      concurrency: parseInt(await getConfig('EMAIL_QUEUE_CONCURRENCY', undefined, '5') || '5', 10),
      retryAttempts: parseInt(await getConfig('EMAIL_RETRY_ATTEMPTS', undefined, '3') || '3', 10),
      retryDelay: parseInt(await getConfig('EMAIL_RETRY_DELAY', undefined, '5000') || '5000', 10),
    },
    healthCheck: {
      enabled: (await getConfig('EMAIL_HEALTH_CHECK_ENABLED', undefined, 'true')) === 'true',
      intervalMs: parseInt(await getConfig('EMAIL_HEALTH_CHECK_INTERVAL', undefined, '300000') || '300000', 10), // 5 minutes
      timeoutMs: parseInt(await getConfig('EMAIL_HEALTH_CHECK_TIMEOUT', undefined, '10000') || '10000', 10), // 10 seconds
      retryAttempts: parseInt(await getConfig('EMAIL_HEALTH_CHECK_RETRIES', undefined, '2') || '2', 10),
    },
    logging: {
      enabled: (await getConfig('EMAIL_LOGGING_ENABLED', undefined, 'true')) === 'true',
      logLevel: (await getConfig('EMAIL_LOG_LEVEL', undefined, 'info') || 'info') as 'debug' | 'info' | 'warn' | 'error',
      logSentEmails: (await getConfig('EMAIL_LOG_SENT', undefined, 'true')) === 'true',
      logFailedEmails: (await getConfig('EMAIL_LOG_FAILED', undefined, 'true')) === 'true',
    },
    rateLimit: {
      enabled: (await getConfig('EMAIL_RATE_LIMIT_ENABLED', undefined, 'true')) === 'true',
      maxEmailsPerMinute: parseInt(await getConfig('EMAIL_RATE_LIMIT_PER_MINUTE', undefined, '60') || '60', 10),
      maxEmailsPerHour: parseInt(await getConfig('EMAIL_RATE_LIMIT_PER_HOUR', undefined, '1000') || '1000', 10),
      maxEmailsPerDay: parseInt(await getConfig('EMAIL_RATE_LIMIT_PER_DAY', undefined, '10000') || '10000', 10),
    },
    templates: {
      cacheEnabled: (await getConfig('EMAIL_TEMPLATE_CACHE_ENABLED', undefined, 'true')) === 'true',
      cacheTTLSeconds: parseInt(await getConfig('EMAIL_TEMPLATE_CACHE_TTL', undefined, '3600') || '3600', 10), // 1 hour
      basePath: await getConfig('EMAIL_TEMPLATE_BASE_PATH', undefined, 'lib/email/templates') || 'lib/email/templates',
    },
  };

  // Provider-specific configuration
  switch (provider) {
    case 'mailhog':
      config.smtp = {
        host: await getConfig('EMAIL_SMTP_HOST', undefined, 'mailhog') || 'mailhog',
        port: parseInt(await getConfig('EMAIL_SMTP_PORT', undefined, '1025') || '1025', 10),
        secure: false, // MailHog doesn't use TLS
      };
      break;

    case 'sendgrid':
      config.sendgrid = {
        apiKey: await getConfig('EMAIL_SENDGRID_API_KEY', 'email_sendgrid_api_key') || '',
      };
      break;

    case 'ses':
      config.ses = {
        region: await getConfig('EMAIL_SES_REGION', 'email_ses_region', 'us-east-1') || 'us-east-1',
        accessKeyId: await getConfig('EMAIL_SES_ACCESS_KEY_ID', 'email_ses_access_key_id') || undefined,
        secretAccessKey: await getConfig('EMAIL_SES_SECRET_ACCESS_KEY', 'email_ses_secret_access_key') || undefined,
      };
      break;

    case 'smtp':
      config.smtp = {
        host: await getConfig('EMAIL_SMTP_HOST', 'email_smtp_host') || '',
        port: parseInt(await getConfig('EMAIL_SMTP_PORT', undefined, '587') || '587', 10),
        secure: (await getConfig('EMAIL_SMTP_SECURE', undefined, 'true')) === 'true',
        auth: {
          user: await getConfig('EMAIL_SMTP_USER', 'email_smtp_user') || '',
          pass: await getConfig('EMAIL_SMTP_PASS', 'email_smtp_pass') || '',
        },
      };
      break;

    default:
      throw new Error(`Unsupported email provider: ${provider}`);
  }

  return config;
}

/**
 * Validate email configuration
 */
export function validateEmailConfig(config: EmailConfigExtended): EmailConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate basic configuration
  if (!config.from.email) {
    errors.push('Email from address is required');
  } else if (!isValidEmail(config.from.email)) {
    errors.push('Email from address is not valid');
  }

  if (!config.from.name) {
    warnings.push('Email from name is not set, using default');
  }

  // Validate provider-specific configuration
  switch (config.provider) {
    case 'mailhog':
      if (!config.smtp?.host) {
        errors.push('MailHog SMTP host is required');
      }
      if (!config.smtp?.port || config.smtp.port < 1 || config.smtp.port > 65535) {
        errors.push('MailHog SMTP port must be between 1 and 65535');
      }
      break;

    case 'sendgrid':
      if (!config.sendgrid?.apiKey) {
        errors.push('SendGrid API key is required');
      } else if (!config.sendgrid.apiKey.startsWith('SG.')) {
        warnings.push('SendGrid API key format appears invalid (should start with "SG.")');
      }
      break;

    case 'ses':
      if (!config.ses?.region) {
        errors.push('AWS SES region is required');
      }
      if (!config.ses?.accessKeyId) {
        errors.push('AWS SES access key ID is required');
      }
      if (!config.ses?.secretAccessKey) {
        errors.push('AWS SES secret access key is required');
      }
      break;

    case 'smtp':
      if (!config.smtp?.host) {
        errors.push('SMTP host is required');
      }
      if (!config.smtp?.port || config.smtp.port < 1 || config.smtp.port > 65535) {
        errors.push('SMTP port must be between 1 and 65535');
      }
      if (!config.smtp?.auth?.user) {
        errors.push('SMTP username is required');
      }
      if (!config.smtp?.auth?.pass) {
        errors.push('SMTP password is required');
      }
      break;

    default:
      errors.push(`Unsupported email provider: ${config.provider}`);
  }

  // Validate queue configuration
  if (config.queue.concurrency < 1 || config.queue.concurrency > 100) {
    errors.push('Email queue concurrency must be between 1 and 100');
  }

  if (config.queue.retryAttempts < 0 || config.queue.retryAttempts > 10) {
    errors.push('Email retry attempts must be between 0 and 10');
  }

  if (config.queue.retryDelay < 1000 || config.queue.retryDelay > 300000) {
    errors.push('Email retry delay must be between 1000ms and 300000ms (5 minutes)');
  }

  // Validate health check configuration
  if (config.healthCheck.enabled) {
    if (config.healthCheck.intervalMs < 60000) {
      warnings.push('Health check interval less than 1 minute may cause excessive load');
    }
    
    if (config.healthCheck.timeoutMs < 1000 || config.healthCheck.timeoutMs > 60000) {
      errors.push('Health check timeout must be between 1000ms and 60000ms');
    }

    if (config.healthCheck.retryAttempts < 0 || config.healthCheck.retryAttempts > 5) {
      errors.push('Health check retry attempts must be between 0 and 5');
    }
  }

  // Validate rate limiting configuration
  if (config.rateLimit.enabled) {
    if (config.rateLimit.maxEmailsPerMinute < 1 || config.rateLimit.maxEmailsPerMinute > 1000) {
      errors.push('Rate limit per minute must be between 1 and 1000');
    }

    if (config.rateLimit.maxEmailsPerHour < config.rateLimit.maxEmailsPerMinute) {
      errors.push('Rate limit per hour must be greater than or equal to rate limit per minute');
    }

    if (config.rateLimit.maxEmailsPerDay < config.rateLimit.maxEmailsPerHour) {
      errors.push('Rate limit per day must be greater than or equal to rate limit per hour');
    }
  }

  // Validate template configuration
  if (config.templates.cacheTTLSeconds < 60 || config.templates.cacheTTLSeconds > 86400) {
    warnings.push('Template cache TTL should be between 60 seconds and 24 hours');
  }

  if (!config.templates.basePath) {
    errors.push('Template base path is required');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Simple email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Get email configuration with validation
 */
export async function getValidatedEmailConfig(): Promise<EmailConfigExtended> {
  const config = await parseEmailConfig();
  const validation = validateEmailConfig(config);

  if (!validation.valid) {
    const errorMessage = `Email configuration validation failed:\n${validation.errors.join('\n')}`;
    throw new Error(errorMessage);
  }

  if (validation.warnings.length > 0) {
    console.warn('Email configuration warnings:');
    validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  return config;
}

/**
 * Email configuration health check
 */
export interface EmailConfigHealthCheck {
  configValid: boolean;
  providerReachable: boolean;
  lastCheck: Date;
  errors: string[];
  warnings: string[];
  metadata: {
    provider: string;
    queueEnabled: boolean;
    rateLimitEnabled: boolean;
    templatesEnabled: boolean;
  };
}

/**
 * Perform email configuration health check with timeout
 */
export async function performEmailConfigHealthCheck(config: EmailConfigExtended): Promise<EmailConfigHealthCheck> {
  const startTime = Date.now();
  const result: EmailConfigHealthCheck = {
    configValid: false,
    providerReachable: false,
    lastCheck: new Date(),
    errors: [],
    warnings: [],
    metadata: {
      provider: config.provider,
      queueEnabled: config.queue.enabled,
      rateLimitEnabled: config.rateLimit.enabled,
      templatesEnabled: config.templates.cacheEnabled,
    },
  };

  try {
    // Wrap the entire health check in a timeout
    const healthCheckPromise = performHealthCheckInternal(config, result);
    const timeoutPromise = new Promise<EmailConfigHealthCheck>((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), config.healthCheck.timeoutMs);
    });

    const finalResult = await Promise.race([healthCheckPromise, timeoutPromise]);
    
    // Check if health check took too long
    const duration = Date.now() - startTime;
    if (duration > config.healthCheck.timeoutMs * 0.9) { // Warn at 90% of timeout
      finalResult.warnings.push(`Health check took ${duration}ms, approaching timeout of ${config.healthCheck.timeoutMs}ms`);
    }

    return finalResult;

  } catch (error) {
    result.errors.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
}

/**
 * Internal health check implementation
 */
async function performHealthCheckInternal(config: EmailConfigExtended, result: EmailConfigHealthCheck): Promise<EmailConfigHealthCheck> {
  // Validate configuration
  const validation = validateEmailConfig(config);
  result.configValid = validation.valid;
  result.errors.push(...validation.errors);
  result.warnings.push(...validation.warnings);

  if (!validation.valid) {
    return result;
  }

  // Test provider connectivity based on provider type
  try {
    result.providerReachable = await testProviderConnectivity(config);
  } catch (error) {
    result.errors.push(`Provider connectivity test failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Test provider connectivity
 */
async function testProviderConnectivity(config: EmailConfigExtended): Promise<boolean> {
  switch (config.provider) {
    case 'mailhog':
      // For MailHog, try to connect to the SMTP port
      return await testSMTPConnectivity(config.smtp!.host, config.smtp!.port);

    case 'sendgrid':
      // For SendGrid, we could test the API endpoint, but for now just validate the API key format
      return config.sendgrid?.apiKey?.startsWith('SG.') || false;

    case 'ses':
      // For SES, we would need to make an AWS API call, but for now just check if credentials are present
      return !!(config.ses?.accessKeyId && config.ses?.secretAccessKey);

    case 'smtp':
      // For generic SMTP, try to connect to the SMTP port
      return await testSMTPConnectivity(config.smtp!.host, config.smtp!.port);

    default:
      return false;
  }
}

/**
 * Test SMTP connectivity with timeout
 */
async function testSMTPConnectivity(host: string, port: number): Promise<boolean> {
  try {
    // Add timeout to prevent hanging
    const connectPromise = Deno.connect({ hostname: host, port });
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), 5000); // 5 second timeout
    });
    
    const conn = await Promise.race([connectPromise, timeoutPromise]);
    conn.close();
    return true;
  } catch {
    return false;
  }
}