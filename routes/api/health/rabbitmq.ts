/**
 * RabbitMQ Health Check API Endpoint
 * 
 * Provides health status and metrics for RabbitMQ event publishing system.
 */

import { Handlers } from "$fresh/server.ts";
import { container } from "../../../lib/container/global.ts";
import { RabbitMQMonitoringService } from "../../../lib/infrastructure/services/rabbitmq-monitoring-service.ts";
import { EventPublisher } from "../../../lib/domain/types/events.ts";
import { RabbitMQEventPublisher } from "../../../lib/infrastructure/services/rabbitmq-event-publisher.ts";

/**
 * GET /api/health/rabbitmq
 * 
 * Returns comprehensive health status and metrics for RabbitMQ system.
 * This endpoint can be used by monitoring systems and load balancers.
 */
export const handler: Handlers = {
  async GET(req) {
    try {
      // Get event publisher from container (which contains the monitoring service)
      const eventPublisher = await container.get<EventPublisher>('eventPublisher');
      
      if (!eventPublisher || !(eventPublisher instanceof RabbitMQEventPublisher)) {
        return new Response(JSON.stringify({
          success: false,
          error: "RabbitMQ event publisher not available",
          healthy: false,
          timestamp: new Date().toISOString(),
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Get monitoring service from event publisher
      const monitoringService = eventPublisher.getMonitoringService();

      // Get comprehensive monitoring report
      const report = await monitoringService.getMonitoringReport();
      
      // Get additional metrics from the metrics collector
      const metricsCollector = eventPublisher.getMetricsCollector();
      await metricsCollector.collectMetricsFromMonitoring();
      const metricsSummary = metricsCollector.getMetricsSummary();
      
      // Determine HTTP status based on health
      const httpStatus = report.healthStatus.healthy ? 200 : 503;
      
      // Format response
      const response = {
        success: true,
        healthy: report.healthStatus.healthy,
        timestamp: new Date().toISOString(),
        data: {
          // Overall health status
          health: {
            healthy: report.healthStatus.healthy,
            components: report.healthStatus.components,
            errors: report.healthStatus.errors,
          },
          
          // Event publishing metrics
          events: {
            totalPublished: report.eventMetrics.totalPublished,
            totalFailed: report.eventMetrics.totalFailed,
            successRate: report.eventMetrics.successRate,
            eventsPerSecond: report.eventMetrics.eventsPerSecond,
            averageDurationMs: report.eventMetrics.durationStats.average,
            publishedByType: report.eventMetrics.publishedByType,
            failedByType: report.eventMetrics.failedByType,
            failedByError: report.eventMetrics.failedByError,
          },
          
          // Connection health
          connection: {
            healthy: report.connectionMetrics.isHealthy,
            state: report.connectionMetrics.connectionState,
            activeChannels: report.connectionMetrics.activeChannels,
            uptimeMs: report.connectionMetrics.uptimeMs,
            stats: report.connectionMetrics.connectionStats,
          },
          
          // Queue metrics with health assessment
          queues: {
            healthy: assessQueueHealth(report.queueMetrics),
            totalMessages: report.queueMetrics.totalMessages,
            deadLetterQueueDepth: report.queueMetrics.deadLetterQueueDepth,
            queueDepths: report.queueMetrics.queueDepths,
            queueStatus: getQueueStatusDetails(report.queueMetrics),
            alerts: getQueueAlerts(report.queueMetrics),
          },
          
          // Circuit breaker status with enhanced monitoring
          circuitBreaker: report.circuitBreakerMetrics ? {
            state: report.circuitBreakerMetrics.state,
            stateNumeric: metricsSummary.circuitBreakerState, // 0=CLOSED, 1=OPEN, 2=HALF_OPEN
            healthy: report.circuitBreakerMetrics.state === 'CLOSED',
            failureCount: report.circuitBreakerMetrics.failureCount,
            successCount: report.circuitBreakerMetrics.successCount,
            failureRate: report.circuitBreakerMetrics.failureRate,
            nextAttemptTime: report.circuitBreakerMetrics.nextAttemptTime,
            lastStateChange: report.circuitBreakerMetrics.lastStateChange,
          } : {
            state: 'NOT_CONFIGURED',
            stateNumeric: -1,
            healthy: true, // No circuit breaker is considered healthy
            failureCount: 0,
            successCount: 0,
            failureRate: 0,
          },
          
          // Retry service stats
          retryService: report.retryStats ? {
            totalEvents: report.retryStats.totalEvents,
            retryableEvents: report.retryStats.retryableEvents,
            nonRetryableEvents: report.retryStats.nonRetryableEvents,
            averageAttempts: report.retryStats.averageAttempts,
            successRate: report.retryStats.successRate,
          } : null,
          
          // Dead letter queue stats
          deadLetterQueue: report.deadLetterStats ? {
            totalDeadLetters: report.deadLetterStats.totalDeadLetters,
            deadLettersByType: report.deadLetterStats.deadLettersByType,
            deadLettersByReason: report.deadLetterStats.deadLettersByReason,
            averageRetryAttempts: report.deadLetterStats.averageRetryAttempts,
          } : null,
        },
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: httpStatus,
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
      
    } catch (error) {
      console.error("❌ RabbitMQ health check failed:", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        success: false,
        healthy: false,
        error: "Health check failed",
        details: errorMessage,
        timestamp: new Date().toISOString(),
      }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

/**
 * Assess overall queue health based on queue depths and thresholds
 */
function assessQueueHealth(queueMetrics: any): boolean {
    const MAX_QUEUE_DEPTH = parseInt(Deno.env.get('RABBITMQ_MAX_QUEUE_DEPTH') || '1000');
    const MAX_DLQ_DEPTH = parseInt(Deno.env.get('RABBITMQ_MAX_DLQ_DEPTH') || '100');
    
    // Check if any queue exceeds maximum depth
    for (const [queueName, depth] of Object.entries(queueMetrics.queueDepths)) {
      if (typeof depth === 'number' && depth > MAX_QUEUE_DEPTH) {
        return false;
      }
    }
    
    // Check dead letter queue depth
    if (queueMetrics.deadLetterQueueDepth > MAX_DLQ_DEPTH) {
      return false;
    }
    
    return true;
}

/**
 * Get detailed status for each queue
 */
function getQueueStatusDetails(queueMetrics: any): Record<string, any> {
    const MAX_QUEUE_DEPTH = parseInt(Deno.env.get('RABBITMQ_MAX_QUEUE_DEPTH') || '1000');
    const WARN_QUEUE_DEPTH = parseInt(Deno.env.get('RABBITMQ_WARN_QUEUE_DEPTH') || '500');
    
    const queueStatus: Record<string, any> = {};
    
    for (const [queueName, depth] of Object.entries(queueMetrics.queueDepths)) {
      if (typeof depth === 'number') {
        queueStatus[queueName] = {
          depth,
          status: depth > MAX_QUEUE_DEPTH ? 'critical' : 
                  depth > WARN_QUEUE_DEPTH ? 'warning' : 'healthy',
          utilizationPercent: Math.round((depth / MAX_QUEUE_DEPTH) * 100),
        };
      }
    }
    
    // Add dead letter queue status
    queueStatus['dead_letter_queue'] = {
      depth: queueMetrics.deadLetterQueueDepth,
      status: queueMetrics.deadLetterQueueDepth > parseInt(Deno.env.get('RABBITMQ_MAX_DLQ_DEPTH') || '100') ? 'critical' :
              queueMetrics.deadLetterQueueDepth > parseInt(Deno.env.get('RABBITMQ_WARN_DLQ_DEPTH') || '50') ? 'warning' : 'healthy',
    };
    
    return queueStatus;
}

/**
 * Get queue-related alerts and warnings
 */
function getQueueAlerts(queueMetrics: any): string[] {
    const alerts: string[] = [];
    const MAX_QUEUE_DEPTH = parseInt(Deno.env.get('RABBITMQ_MAX_QUEUE_DEPTH') || '1000');
    const WARN_QUEUE_DEPTH = parseInt(Deno.env.get('RABBITMQ_WARN_QUEUE_DEPTH') || '500');
    const MAX_DLQ_DEPTH = parseInt(Deno.env.get('RABBITMQ_MAX_DLQ_DEPTH') || '100');
    
    // Check individual queue depths
    for (const [queueName, depth] of Object.entries(queueMetrics.queueDepths)) {
      if (typeof depth === 'number') {
        if (depth > MAX_QUEUE_DEPTH) {
          alerts.push(`Queue ${queueName} is over capacity: ${depth} messages (max: ${MAX_QUEUE_DEPTH})`);
        } else if (depth > WARN_QUEUE_DEPTH) {
          alerts.push(`Queue ${queueName} is approaching capacity: ${depth} messages (warn: ${WARN_QUEUE_DEPTH})`);
        }
      }
    }
    
    // Check dead letter queue
    if (queueMetrics.deadLetterQueueDepth > MAX_DLQ_DEPTH) {
      alerts.push(`Dead letter queue is over capacity: ${queueMetrics.deadLetterQueueDepth} messages (max: ${MAX_DLQ_DEPTH})`);
    }
    
    // Check for stale messages (high queue depth with low throughput)
    if (queueMetrics.totalMessages > 100) {
      // This would require additional metrics to determine if messages are being processed
      // For now, we'll just warn about high total message count
      alerts.push(`High total message count across all queues: ${queueMetrics.totalMessages} messages`);
    }
    
    return alerts;
}