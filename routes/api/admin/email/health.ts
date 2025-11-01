/**
 * Email Service Health Check API Endpoint
 * 
 * Provides detailed health information about the email service configuration,
 * provider connectivity, operational status, and observability metrics.
 */

import { define } from "../../../../utils.ts";
import { ServiceKeys } from "../../../../lib/container/registry.ts";
import type { IEmailConfigService } from "../../../../lib/infrastructure/services/email-config-service.ts";
import { 
  getEmailMetricsCollectorHealth,
  getEmailDeliveryRateStats,
  getEmailProviderStats,
  checkEmailAlertingThresholds,
} from "../../../../lib/observability/metrics/email-metrics.ts";
import { getEmailInstrumentationHealth } from "../../../../lib/observability/instrumentation/email-instrumentation.ts";

export const handler = define.handlers({
  async GET(req) {
    try {
      const url = new URL(req.url);
      const detailed = url.searchParams.get('detailed') === 'true';
      const includeMetrics = url.searchParams.get('metrics') === 'true';
      const includeAlerts = url.searchParams.get('alerts') === 'true';

      const container = (globalThis as Record<string, unknown>).serviceContainer;
      
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
      const emailConfigService = (container as Record<string, unknown>).getSync(ServiceKeys.EMAIL_CONFIG_SERVICE) as IEmailConfigService;
      
      // Perform health check
      const healthCheck = await emailConfigService.healthCheck();
      const metadata = emailConfigService.getConfigMetadata();
      const isConfigured = emailConfigService.isConfigured();

      // Get observability health status
      const instrumentationHealth = getEmailInstrumentationHealth();
      const metricsCollectorHealth = getEmailMetricsCollectorHealth();

      // Determine overall health status
      const configHealthy = healthCheck.configValid && healthCheck.providerReachable;
      const observabilityHealthy = instrumentationHealth.healthy && metricsCollectorHealth.healthy;
      const overallHealthy = configHealthy && observabilityHealthy;
      const status = overallHealthy ? "healthy" : "degraded";

      const response: Record<string, unknown> = {
        status,
        timestamp: new Date().toISOString(),
        configured: isConfigured,
        health: {
          configValid: healthCheck.configValid,
          providerReachable: healthCheck.providerReachable,
          lastCheck: healthCheck.lastCheck,
          observabilityHealthy,
        },
        configuration: {
          provider: metadata.provider,
          queueEnabled: metadata.queueEnabled,
          rateLimitEnabled: metadata.rateLimitEnabled,
          templatesEnabled: metadata.templatesEnabled,
          lastHealthCheck: metadata.lastHealthCheck,
        },
        errors: healthCheck.errors,
        warnings: healthCheck.warnings,
        metadata: healthCheck.metadata,
      };

      // Add detailed observability information if requested
      if (detailed) {
        response.observability = {
          instrumentation: {
            healthy: instrumentationHealth.healthy,
            initialized: instrumentationHealth.initialized,
            metricsRecorded: instrumentationHealth.metricsRecorded,
            lastError: instrumentationHealth.lastError,
          },
          metricsCollector: {
            healthy: metricsCollectorHealth.healthy,
            initialized: metricsCollectorHealth.initialized,
            metricsRecorded: metricsCollectorHealth.metricsRecorded,
            lastError: metricsCollectorHealth.lastError,
          },
        };
      }

      // Add metrics if requested
      if (includeMetrics) {
        const deliveryStats = getEmailDeliveryRateStats(15); // Last 15 minutes
        const providerStats = getEmailProviderStats();

        response.metrics = {
          deliveryStats: {
            totalSent: deliveryStats.totalSent,
            totalFailed: deliveryStats.totalFailed,
            successRate: deliveryStats.successRate,
            failureRate: deliveryStats.failureRate,
            averageProcessingTime: deliveryStats.averageProcessingTime,
          },
          providerStats,
        };
      }

      // Add alerts if requested
      if (includeAlerts) {
        const alerts = checkEmailAlertingThresholds();
        response.alerts = alerts.map(alert => ({
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          currentValue: alert.currentValue,
          threshold: alert.threshold,
          source: alert.source,
          metadata: alert.metadata,
        }));
      }

      const httpStatus = overallHealthy ? 200 : 503;

      return new Response(JSON.stringify(response), {
        status: httpStatus,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        status: "error",
        message: "Email health check failed",
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
      const container = (globalThis as Record<string, unknown>).serviceContainer;
      
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

      const emailConfigService = (container as Record<string, unknown>).getSync(ServiceKeys.EMAIL_CONFIG_SERVICE) as IEmailConfigService;

      switch (action) {
        case 'reload': {
          // Reload email configuration
          if ('reloadConfig' in emailConfigService) {
            await (emailConfigService as Record<string, unknown>).reloadConfig();
          } else {
            await emailConfigService.initialize();
          }
          
          return new Response(JSON.stringify({
            status: "success",
            message: "Email configuration reloaded successfully",
            timestamp: new Date().toISOString(),
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        case 'validate': {
          // Validate current configuration
          const validation = await emailConfigService.validateConfig();
          
          return new Response(JSON.stringify({
            status: validation.valid ? "success" : "error",
            message: validation.valid ? "Configuration is valid" : "Configuration validation failed",
            validation,
            timestamp: new Date().toISOString(),
          }), {
            status: validation.valid ? 200 : 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        case 'test': {
          // Test provider connectivity
          const healthCheck = await emailConfigService.healthCheck();
          
          return new Response(JSON.stringify({
            status: healthCheck.providerReachable ? "success" : "error",
            message: healthCheck.providerReachable ? "Provider connectivity test passed" : "Provider connectivity test failed",
            healthCheck,
            timestamp: new Date().toISOString(),
          }), {
            status: healthCheck.providerReachable ? 200 : 503,
            headers: { "Content-Type": "application/json" },
          });
        }

        default:
          return new Response(JSON.stringify({
            status: "error",
            message: "Invalid action. Supported actions: reload, validate, test",
          }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        status: "error",
        message: "Email health check action failed",
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});