/**
 * RabbitMQ Metrics Summary API Endpoint
 * 
 * Provides a JSON summary of key RabbitMQ metrics for dashboards and monitoring.
 */

import { Handlers } from "$fresh/server.ts";
import { container } from "../../../../lib/container/global.ts";
import { EventPublisher } from "../../../../lib/domain/types/events.ts";
import { RabbitMQEventPublisher } from "../../../../lib/infrastructure/services/rabbitmq-event-publisher.ts";

/**
 * GET /api/metrics/rabbitmq/summary
 * 
 * Returns a JSON summary of key RabbitMQ metrics for dashboards and monitoring.
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
          timestamp: new Date().toISOString(),
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Get metrics collector
      const metricsCollector = eventPublisher.getMetricsCollector();
      
      // Collect latest metrics from monitoring service
      await metricsCollector.collectMetricsFromMonitoring();
      
      // Get metrics summary
      const summary = metricsCollector.getMetricsSummary();
      
      // Get additional health information
      const health = await eventPublisher.getHealth();
      
      const response = {
        success: true,
        timestamp: new Date().toISOString(),
        data: {
          // Core metrics
          metrics: summary,
          
          // Health status
          health: {
            healthy: health.healthy,
            components: health.components,
            errors: health.errors,
          },
          
          // Derived metrics
          derived: {
            totalEvents: summary.eventsPublished + summary.eventsFailed,
            errorRate: summary.eventsFailed > 0 ? 
              (summary.eventsFailed / (summary.eventsPublished + summary.eventsFailed)) * 100 : 0,
            isConnected: summary.connectionStatus === 1,
            circuitBreakerStatus: summary.circuitBreakerState === 0 ? 'CLOSED' : 
                                 summary.circuitBreakerState === 1 ? 'OPEN' : 'HALF_OPEN',
          },
        },
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
      
    } catch (error) {
      console.error("❌ RabbitMQ metrics summary failed:", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        success: false,
        error: "Metrics summary failed",
        details: errorMessage,
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};