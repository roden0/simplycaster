/**
 * Email Queue Statistics API
 * 
 * Provides detailed statistics about email queue processing
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
      
      // Get comprehensive statistics
      const stats = emailQueueService.getStats();
      const publisherStats = emailQueueService.getPublisherStats();
      const health = await emailQueueService.getHealth();
      const config = emailQueueService.getConfig();

      const response = {
        timestamp: new Date().toISOString(),
        enabled: config.enabled,
        healthy: health.healthy,
        consumer: {
          totalProcessed: stats.totalProcessed,
          successfullyProcessed: stats.successfullyProcessed,
          failedMessages: stats.failedMessages,
          successRate: Math.round(stats.successRate * 100) / 100, // Round to 2 decimal places
          averageProcessingTime: Math.round(stats.averageProcessingTime * 100) / 100,
          activeWorkers: stats.activeWorkers,
          queueDepth: stats.queueDepth,
          retryQueueDepth: stats.retryQueueDepth,
          deadLetterQueueDepth: stats.deadLetterQueueDepth,
          lastProcessedAt: stats.lastProcessedAt,
        },
        publisher: {
          publishedCount: publisherStats.publishedCount,
          failedCount: publisherStats.failedCount,
          successRate: Math.round(publisherStats.successRate * 100) / 100,
          totalAttempts: publisherStats.publishedCount + publisherStats.failedCount,
        },
        performance: {
          throughput: {
            messagesPerMinute: stats.lastProcessedAt ? 
              Math.round((stats.totalProcessed / Math.max(1, (Date.now() - stats.lastProcessedAt.getTime()) / 60000)) * 100) / 100 : 0,
            successfulPerMinute: stats.lastProcessedAt ?
              Math.round((stats.successfullyProcessed / Math.max(1, (Date.now() - stats.lastProcessedAt.getTime()) / 60000)) * 100) / 100 : 0,
          },
          errorRate: health.errorRate,
          averageProcessingTimeMs: stats.averageProcessingTime,
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
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        error: errorMessage,
        timestamp: new Date().toISOString(),
        enabled: false,
        healthy: false,
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