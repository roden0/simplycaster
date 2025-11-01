// Health check API endpoint
import { define } from "../../utils.ts";
import { checkDatabaseHealth } from "../../database/connection.ts";
import { ServiceKeys } from "../../lib/container/registry.ts";
import type { IEmailConfigService } from "../../lib/infrastructure/services/email-config-service.ts";
import type { EmailQueueService } from "../../lib/infrastructure/services/email-queue-service.ts";

export const handler = define.handlers({
  async GET(_req) {
    try {
      // Check database connectivity
      const dbHealthy = await checkDatabaseHealth();
      
      // Check email configuration health
      let emailHealthy = false;
      let emailProvider = 'unknown';
      let emailError: string | undefined;
      
      try {
        const container = (globalThis as any).serviceContainer;
        if (container) {
          const emailConfigService = container.getSync<IEmailConfigService>(ServiceKeys.EMAIL_CONFIG_SERVICE);
          const emailHealthCheck = await emailConfigService.healthCheck();
          emailHealthy = emailHealthCheck.configValid && emailHealthCheck.providerReachable;
          emailProvider = emailHealthCheck.metadata.provider;
          
          if (!emailHealthy && emailHealthCheck.errors.length > 0) {
            emailError = emailHealthCheck.errors[0];
          }
        }
      } catch (error) {
        emailError = error instanceof Error ? error.message : String(error);
      }

      // Check email queue health
      let emailQueueHealthy = false;
      let emailQueueStats: any = {};
      let emailQueueError: string | undefined;
      
      try {
        const container = (globalThis as any).serviceContainer;
        if (container) {
          const emailQueueService = await container.get<EmailQueueService>(ServiceKeys.EMAIL_QUEUE_SERVICE);
          const queueHealth = await emailQueueService.getHealth();
          emailQueueHealthy = queueHealth.healthy;
          emailQueueStats = {
            connected: queueHealth.connected,
            activeWorkers: queueHealth.activeWorkers,
            queueDepth: queueHealth.queueDepth,
            errorRate: queueHealth.errorRate,
            enabled: emailQueueService.isQueueEnabled(),
          };
          
          if (!emailQueueHealthy && queueHealth.details?.error) {
            emailQueueError = String(queueHealth.details.error);
          }
        }
      } catch (error) {
        emailQueueError = error instanceof Error ? error.message : String(error);
      }
      
      const health = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          database: dbHealthy ? "healthy" : "unhealthy",
          email: emailHealthy ? "healthy" : "degraded",
          emailQueue: emailQueueHealthy ? "healthy" : "degraded",
          application: "healthy",
        },
        details: {
          email: {
            provider: emailProvider,
            configValid: emailHealthy,
            error: emailError,
          },
          emailQueue: {
            ...emailQueueStats,
            error: emailQueueError,
          },
        },
        version: "1.0.0",
      };

      // Return 503 if critical services are unhealthy (database is critical, email is not)
      const status = dbHealthy ? 200 : 503;
      
      return new Response(JSON.stringify(health), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      const health = {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        services: {
          database: "unknown",
          email: "unknown",
          application: "unhealthy",
        },
      };

      return new Response(JSON.stringify(health), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });
    }
  },
});