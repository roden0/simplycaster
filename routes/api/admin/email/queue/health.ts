/**
 * Email Queue Health Check API
 * 
 * Provides detailed health information about the email queue system
 */

import { define } from "../../../../../utils.ts";
import { ServiceKeys } from "../../../../../lib/container/registry.ts";
import type { EmailQueueService } from "../../../../../lib/infrastructure/services/email-queue-service.ts";

export const handler = define.handlers({
  async GET(_req) {
    try {
      const container = (globalThis as any).serviceContainer;
      if (!container) {
        return new Response(JSON.stringify({
          error: "Service container not available",
          timestamp: new Date().toISOString(),
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      const emailQueueService = await container.get<EmailQueueService>(ServiceKeys.EMAIL_QUEUE_SERVICE);
      
      // Get comprehensive health and statistics
      const health = await emailQueueService.getHealth();
      const stats = emailQueueService.getStats();
      const publisherStats = emailQueueService.getPublisherStats();
      const config = emailQueueService.getConfig();

      const response = {
        status: health.healthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        queue: {
          enabled: config.enabled,
          healthy: health.healthy,
          connected: health.connected,
          activeWorkers: health.activeWorkers,
          queueDepth: health.queueDepth,
          errorRate: health.errorRate,
          lastCheck: health.lastCheck,
        },
        statistics: {
          consumer: {
            totalProcessed: stats.totalProcessed,
            successfullyProcessed: stats.successfullyProcessed,
            failedMessages: stats.failedMessages,
            successRate: stats.successRate,
            averageProcessingTime: stats.averageProcessingTime,
            retryQueueDepth: stats.retryQueueDepth,
            deadLetterQueueDepth: stats.deadLetterQueueDepth,
            lastProcessedAt: stats.lastProcessedAt,
          },
          publisher: {
            publishedCount: publisherStats.publishedCount,
            failedCount: publisherStats.failedCount,
            successRate: publisherStats.successRate,
          },
        },
        configuration: {
          concurrency: config.concurrency,
          maxRetryAttempts: config.maxRetryAttempts,
          retryDelay: config.retryDelay,
          maxRetryDelay: config.maxRetryDelay,
          backoffMultiplier: config.backoffMultiplier,
          messageTtl: config.messageTtl,
          maxQueueLength: config.maxQueueLength,
          deadLetterTtl: config.deadLetterTtl,
        },
        details: health.details,
      };

      const status = health.healthy ? 200 : 503;

      return new Response(JSON.stringify(response), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        status: "error",
        timestamp: new Date().toISOString(),
        error: errorMessage,
        queue: {
          enabled: false,
          healthy: false,
          connected: false,
        },
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });
    }
  },
});