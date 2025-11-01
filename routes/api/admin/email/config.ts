/**
 * Email Configuration Management API Endpoint
 * 
 * Provides configuration information and management capabilities
 * for the email service system.
 */

import { define } from "../../../../utils.ts";
import { ServiceKeys } from "../../../../lib/container/registry.ts";
import type { IEmailConfigService } from "../../../../lib/infrastructure/services/email-config-service.ts";

export const handler = define.handlers({
  async GET(_req) {
    try {
      const container = (globalThis as any).serviceContainer;
      
      if (!container) {
        return new Response(JSON.stringify({
          status: "error",
          message: "Service container not available",
          timestamp: new Date().toISOString(),
        }), {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
        });
      }

      // Get email configuration service
      const emailConfigService = container.getSync<IEmailConfigService>(ServiceKeys.EMAIL_CONFIG_SERVICE);
      
      // Get configuration metadata
      const metadata = emailConfigService.getConfigMetadata();
      const isConfigured = emailConfigService.isConfigured();
      
      // Get current configuration (without sensitive data)
      const config = await emailConfigService.getConfig();
      
      // Create safe configuration object (remove sensitive information)
      const safeConfig = {
        provider: config.provider,
        from: config.from,
        queue: config.queue,
        healthCheck: {
          enabled: config.healthCheck.enabled,
          intervalMs: config.healthCheck.intervalMs,
          timeoutMs: config.healthCheck.timeoutMs,
          retryAttempts: config.healthCheck.retryAttempts,
        },
        logging: config.logging,
        rateLimit: config.rateLimit,
        templates: config.templates,
        // Provider-specific config (without sensitive data)
        smtp: config.smtp ? {
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.secure,
          authConfigured: !!(config.smtp.auth?.user && config.smtp.auth?.pass),
        } : undefined,
        sendgrid: config.sendgrid ? {
          apiKeyConfigured: !!config.sendgrid.apiKey,
        } : undefined,
        ses: config.ses ? {
          region: config.ses.region,
          credentialsConfigured: !!(config.ses.accessKeyId && config.ses.secretAccessKey),
        } : undefined,
      };

      const response = {
        status: "success",
        timestamp: new Date().toISOString(),
        configured: isConfigured,
        metadata,
        configuration: safeConfig,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        status: "error",
        message: "Failed to get email configuration",
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });
    }
  },

  async POST(req) {
    try {
      const container = (globalThis as any).serviceContainer;
      
      if (!container) {
        return new Response(JSON.stringify({
          status: "error",
          message: "Service container not available",
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      const body = await req.json();
      const action = body.action;

      const emailConfigService = container.getSync<IEmailConfigService>(ServiceKeys.EMAIL_CONFIG_SERVICE);

      switch (action) {
        case 'validate':
          // Validate current configuration
          const validation = await emailConfigService.validateConfig();
          
          return new Response(JSON.stringify({
            status: validation.valid ? "success" : "error",
            message: validation.valid ? "Configuration is valid" : "Configuration has errors",
            validation: {
              valid: validation.valid,
              errors: validation.errors,
              warnings: validation.warnings,
            },
            timestamp: new Date().toISOString(),
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });

        case 'reload':
          // Reload configuration from environment
          if ('reloadConfig' in emailConfigService) {
            await (emailConfigService as any).reloadConfig();
          } else {
            await emailConfigService.initialize();
          }
          
          // Get updated metadata
          const updatedMetadata = emailConfigService.getConfigMetadata();
          
          return new Response(JSON.stringify({
            status: "success",
            message: "Configuration reloaded successfully",
            metadata: updatedMetadata,
            timestamp: new Date().toISOString(),
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });

        default:
          return new Response(JSON.stringify({
            status: "error",
            message: "Invalid action. Supported actions: validate, reload",
          }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        status: "error",
        message: "Email configuration action failed",
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});