/**
 * RabbitMQ Queue Health Check API Endpoint
 * 
 * Provides detailed health status and metrics for RabbitMQ queues.
 */

import { Handlers } from "$fresh/server.ts";
import { container } from "../../../../lib/container/global.ts";
import { EventPublisher } from "../../../../lib/domain/types/events.ts";
import { RabbitMQEventPublisher } from "../../../../lib/infrastructure/services/rabbitmq-event-publisher.ts";

/**
 * GET /api/health/rabbitmq/queues
 * 
 * Returns detailed queue health status, depths, and monitoring information.
 */
export const handler: Handlers = {
  async GET(req) {
    try {
      // Get event publisher from container
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

      // Get monitoring service and collect queue metrics
      const monitoringService = eventPublisher.getMonitoringService();
      const queueMetrics = await monitoringService.getQueueMetrics();
      
      // Get metrics collector for additional data
      const metricsCollector = eventPublisher.getMetricsCollector();
      await metricsCollector.collectMetricsFromMonitoring();
      
      // Assess overall queue health
      const queueHealth = assessQueueHealth(queueMetrics);
      const httpStatus = queueHealth.healthy ? 200 : 503;
      
      // Get detailed queue status
      const queueStatus = getDetailedQueueStatus(queueMetrics);
      
      // Generate alerts and recommendations
      const alerts = generateQueueAlerts(queueMetrics);
      const recommendations = generateQueueRecommendations(queueMetrics, queueHealth);
      
      const response = {
        success: true,
        healthy: queueHealth.healthy,
        timestamp: new Date().toISOString(),
        data: {
          // Overall queue health
          overview: {
            healthy: queueHealth.healthy,
            totalQueues: Object.keys(queueMetrics.queueDepths).length,
            totalMessages: queueMetrics.totalMessages,
            deadLetterQueueDepth: queueMetrics.deadLetterQueueDepth,
            healthScore: queueHealth.healthScore,
          },
          
          // Individual queue status
          queues: queueStatus.queues,
          
          // Dead letter queue details
          deadLetterQueue: queueStatus.deadLetterQueue,
          
          // Health thresholds (for reference)
          thresholds: {
            maxQueueDepth: parseInt(Deno.env.get('RABBITMQ_MAX_QUEUE_DEPTH') || '1000'),
            warnQueueDepth: parseInt(Deno.env.get('RABBITMQ_WARN_QUEUE_DEPTH') || '500'),
            maxDlqDepth: parseInt(Deno.env.get('RABBITMQ_MAX_DLQ_DEPTH') || '100'),
            warnDlqDepth: parseInt(Deno.env.get('RABBITMQ_WARN_DLQ_DEPTH') || '50'),
          },
          
          // Alerts and recommendations
          alerts,
          recommendations,
          
          // Performance metrics
          performance: {
            averageQueueDepth: queueHealth.averageQueueDepth,
            maxQueueDepth: queueHealth.maxQueueDepth,
            queueUtilization: queueHealth.queueUtilization,
            messagesPerQueue: queueHealth.messagesPerQueue,
          },
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
      console.error("❌ Queue health check failed:", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        success: false,
        healthy: false,
        error: "Queue health check failed",
        details: errorMessage,
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

/**
 * Assess overall queue health with detailed metrics
 */
function assessQueueHealth(queueMetrics: any): {
  healthy: boolean;
  healthScore: number;
  averageQueueDepth: number;
  maxQueueDepth: number;
  queueUtilization: number;
  messagesPerQueue: number;
} {
  const MAX_QUEUE_DEPTH = parseInt(Deno.env.get('RABBITMQ_MAX_QUEUE_DEPTH') || '1000');
  const MAX_DLQ_DEPTH = parseInt(Deno.env.get('RABBITMQ_MAX_DLQ_DEPTH') || '100');
  
  const queueDepths = Object.values(queueMetrics.queueDepths) as number[];
  const totalQueues = queueDepths.length;
  
  if (totalQueues === 0) {
    return {
      healthy: true,
      healthScore: 100,
      averageQueueDepth: 0,
      maxQueueDepth: 0,
      queueUtilization: 0,
      messagesPerQueue: 0,
    };
  }
  
  const averageQueueDepth = queueDepths.reduce((sum, depth) => sum + depth, 0) / totalQueues;
  const maxQueueDepth = Math.max(...queueDepths);
  const queueUtilization = (maxQueueDepth / MAX_QUEUE_DEPTH) * 100;
  const messagesPerQueue = queueMetrics.totalMessages / totalQueues;
  
  // Calculate health score (0-100)
  let healthScore = 100;
  
  // Penalize for high queue depths
  for (const depth of queueDepths) {
    if (depth > MAX_QUEUE_DEPTH) {
      healthScore -= 30; // Critical penalty
    } else if (depth > MAX_QUEUE_DEPTH * 0.8) {
      healthScore -= 15; // High penalty
    } else if (depth > MAX_QUEUE_DEPTH * 0.5) {
      healthScore -= 5; // Medium penalty
    }
  }
  
  // Penalize for dead letter queue depth
  if (queueMetrics.deadLetterQueueDepth > MAX_DLQ_DEPTH) {
    healthScore -= 25; // Critical penalty for DLQ
  } else if (queueMetrics.deadLetterQueueDepth > MAX_DLQ_DEPTH * 0.5) {
    healthScore -= 10; // Medium penalty for DLQ
  }
  
  healthScore = Math.max(0, healthScore);
  
  const healthy = healthScore >= 70 && maxQueueDepth <= MAX_QUEUE_DEPTH && 
                  queueMetrics.deadLetterQueueDepth <= MAX_DLQ_DEPTH;
  
  return {
    healthy,
    healthScore,
    averageQueueDepth: Math.round(averageQueueDepth * 100) / 100,
    maxQueueDepth,
    queueUtilization: Math.round(queueUtilization * 100) / 100,
    messagesPerQueue: Math.round(messagesPerQueue * 100) / 100,
  };
}

/**
 * Get detailed status for each queue
 */
function getDetailedQueueStatus(queueMetrics: any): {
  queues: Record<string, any>;
  deadLetterQueue: any;
} {
  const MAX_QUEUE_DEPTH = parseInt(Deno.env.get('RABBITMQ_MAX_QUEUE_DEPTH') || '1000');
  const WARN_QUEUE_DEPTH = parseInt(Deno.env.get('RABBITMQ_WARN_QUEUE_DEPTH') || '500');
  const MAX_DLQ_DEPTH = parseInt(Deno.env.get('RABBITMQ_MAX_DLQ_DEPTH') || '100');
  const WARN_DLQ_DEPTH = parseInt(Deno.env.get('RABBITMQ_WARN_DLQ_DEPTH') || '50');
  
  const queues: Record<string, any> = {};
  
  for (const [queueName, depth] of Object.entries(queueMetrics.queueDepths)) {
    if (typeof depth === 'number') {
      const utilizationPercent = (depth / MAX_QUEUE_DEPTH) * 100;
      
      queues[queueName] = {
        name: queueName,
        depth,
        maxCapacity: MAX_QUEUE_DEPTH,
        utilizationPercent: Math.round(utilizationPercent * 100) / 100,
        status: getQueueStatus(depth, MAX_QUEUE_DEPTH, WARN_QUEUE_DEPTH),
        healthy: depth <= MAX_QUEUE_DEPTH,
        thresholds: {
          warning: WARN_QUEUE_DEPTH,
          critical: MAX_QUEUE_DEPTH,
        },
        lastUpdated: queueMetrics.timestamp,
      };
    }
  }
  
  const deadLetterQueue = {
    name: 'dead_letter_queue',
    depth: queueMetrics.deadLetterQueueDepth,
    maxCapacity: MAX_DLQ_DEPTH,
    utilizationPercent: Math.round((queueMetrics.deadLetterQueueDepth / MAX_DLQ_DEPTH) * 100 * 100) / 100,
    status: getQueueStatus(queueMetrics.deadLetterQueueDepth, MAX_DLQ_DEPTH, WARN_DLQ_DEPTH),
    healthy: queueMetrics.deadLetterQueueDepth <= MAX_DLQ_DEPTH,
    thresholds: {
      warning: WARN_DLQ_DEPTH,
      critical: MAX_DLQ_DEPTH,
    },
    lastUpdated: queueMetrics.timestamp,
  };
  
  return { queues, deadLetterQueue };
}

/**
 * Get queue status based on depth and thresholds
 */
function getQueueStatus(depth: number, maxDepth: number, warnDepth: number): string {
  if (depth > maxDepth) {
    return 'critical';
  } else if (depth > warnDepth) {
    return 'warning';
  } else if (depth > 0) {
    return 'active';
  } else {
    return 'empty';
  }
}

/**
 * Generate queue-related alerts
 */
function generateQueueAlerts(queueMetrics: any): string[] {
  const alerts: string[] = [];
  const MAX_QUEUE_DEPTH = parseInt(Deno.env.get('RABBITMQ_MAX_QUEUE_DEPTH') || '1000');
  const WARN_QUEUE_DEPTH = parseInt(Deno.env.get('RABBITMQ_WARN_QUEUE_DEPTH') || '500');
  const MAX_DLQ_DEPTH = parseInt(Deno.env.get('RABBITMQ_MAX_DLQ_DEPTH') || '100');
  
  // Check individual queue depths
  for (const [queueName, depth] of Object.entries(queueMetrics.queueDepths)) {
    if (typeof depth === 'number') {
      if (depth > MAX_QUEUE_DEPTH) {
        alerts.push(`CRITICAL: Queue ${queueName} is over capacity (${depth}/${MAX_QUEUE_DEPTH} messages)`);
      } else if (depth > WARN_QUEUE_DEPTH) {
        alerts.push(`WARNING: Queue ${queueName} is approaching capacity (${depth}/${WARN_QUEUE_DEPTH} messages)`);
      }
    }
  }
  
  // Check dead letter queue
  if (queueMetrics.deadLetterQueueDepth > MAX_DLQ_DEPTH) {
    alerts.push(`CRITICAL: Dead letter queue is over capacity (${queueMetrics.deadLetterQueueDepth}/${MAX_DLQ_DEPTH} messages)`);
  } else if (queueMetrics.deadLetterQueueDepth > parseInt(Deno.env.get('RABBITMQ_WARN_DLQ_DEPTH') || '50')) {
    alerts.push(`WARNING: Dead letter queue has high message count (${queueMetrics.deadLetterQueueDepth} messages)`);
  }
  
  // Check for potential message processing issues
  if (queueMetrics.totalMessages > 5000) {
    alerts.push(`INFO: High total message count across all queues (${queueMetrics.totalMessages} messages)`);
  }
  
  return alerts;
}

/**
 * Generate queue recommendations
 */
function generateQueueRecommendations(queueMetrics: any, queueHealth: any): string[] {
  const recommendations: string[] = [];
  
  if (!queueHealth.healthy) {
    recommendations.push('Investigate high queue depths and consider scaling consumers');
    recommendations.push('Review message processing rates and identify bottlenecks');
  }
  
  if (queueMetrics.deadLetterQueueDepth > 0) {
    recommendations.push('Review messages in dead letter queue and address underlying issues');
    recommendations.push('Consider implementing retry policies or manual message reprocessing');
  }
  
  if (queueHealth.queueUtilization > 80) {
    recommendations.push('Queue utilization is high - consider increasing queue capacity or adding more consumers');
  }
  
  if (queueHealth.averageQueueDepth > 100) {
    recommendations.push('Average queue depth is high - monitor message processing performance');
  }
  
  // Add proactive recommendations
  recommendations.push('Set up monitoring alerts for queue depth thresholds');
  recommendations.push('Regularly review queue performance metrics and trends');
  recommendations.push('Consider implementing queue auto-scaling based on depth');
  
  return recommendations;
}