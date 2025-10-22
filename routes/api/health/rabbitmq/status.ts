/**
 * Simple RabbitMQ Status Check API Endpoint
 * 
 * Provides a lightweight health check for RabbitMQ connectivity.
 * Suitable for load balancer health checks.
 */

import { Handlers } from "$fresh/server.ts";
import { container } from "../../../../lib/container/global.ts";
import { RabbitMQMonitoringService } from "../../../../lib/infrastructure/services/rabbitmq-monitoring-service.ts";

/**
 * GET /api/health/rabbitmq/status
 * 
 * Returns simple health status for RabbitMQ system.
 * This is a lightweight endpoint for load balancer health checks.
 */
export const handler: Handlers = {
  async GET(req) {
    try {
      // Get monitoring service from container
      const monitoringService = container.resolve<RabbitMQMonitoringService>('rabbitMQMonitoringService');
      
      if (!monitoringService) {
        return new Response(JSON.stringify({
          status: "unhealthy",
          message: "RabbitMQ monitoring service not available",
          timestamp: new Date().toISOString(),
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Get basic health status
      const healthStatus = await monitoringService.getHealthStatus();
      
      // Determine HTTP status and response
      const httpStatus = healthStatus.healthy ? 200 : 503;
      const status = healthStatus.healthy ? "healthy" : "unhealthy";
      
      const response = {
        status,
        timestamp: new Date().toISOString(),
        components: healthStatus.components,
        errors: healthStatus.errors.length > 0 ? healthStatus.errors : undefined,
      };

      return new Response(JSON.stringify(response), {
        status: httpStatus,
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
      
    } catch (error) {
      console.error("❌ RabbitMQ status check failed:", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        status: "unhealthy",
        message: "Status check failed",
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};