/**
 * RabbitMQ Metrics API Endpoint
 * 
 * Provides Prometheus-formatted metrics for RabbitMQ event publishing system.
 */

import { Handlers } from "$fresh/server.ts";
import { container } from "../../../lib/container/global.ts";
import { EventPublisher } from "../../../lib/domain/types/events.ts";
import { RabbitMQEventPublisher } from "../../../lib/infrastructure/services/rabbitmq-event-publisher.ts";

/**
 * GET /api/metrics/rabbitmq
 * 
 * Returns Prometheus-formatted metrics for RabbitMQ event publishing.
 * This endpoint is designed to be scraped by Prometheus or other monitoring systems.
 */
export const handler: Handlers = {
  async GET(req) {
    try {
      // Get event publisher from container
      const eventPublisher = await container.get<EventPublisher>('eventPublisher');
      
      if (!eventPublisher || !(eventPublisher instanceof RabbitMQEventPublisher)) {
        return new Response("# RabbitMQ metrics not available\n", {
          status: 503,
          headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
        });
      }

      // Get metrics collector
      const metricsCollector = eventPublisher.getMetricsCollector();
      
      // Collect latest metrics from monitoring service
      await metricsCollector.collectMetricsFromMonitoring();
      
      // Get Prometheus-formatted metrics
      const prometheusMetrics = metricsCollector.getPrometheusMetrics();
      
      // Add metadata header
      const metricsWithHeader = `# RabbitMQ Event Publishing Metrics
# Generated at ${new Date().toISOString()}
# Endpoint: /api/metrics/rabbitmq

${prometheusMetrics}`;

      return new Response(metricsWithHeader, {
        status: 200,
        headers: { 
          "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
      
    } catch (error) {
      console.error("❌ RabbitMQ metrics collection failed:", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(`# ERROR: RabbitMQ metrics collection failed
# ${errorMessage}
# Timestamp: ${new Date().toISOString()}
`, {
        status: 500,
        headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
      });
    }
  },
};