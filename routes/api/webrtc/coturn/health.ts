/**
 * Coturn Health Check API
 * 
 * GET /api/webrtc/coturn/health - Get Coturn service health status
 */

import { Handlers } from "$fresh/server.ts";
import { createCoturnHealthService } from "../../../../lib/webrtc/coturn-health-service.ts";
import { authenticateRequest } from "../../../../lib/middleware/auth.ts";

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  timestamp: string;
  metrics: {
    isHealthy: boolean;
    responseTime: number;
    activeSessions: number;
    totalBandwidth: number;
    authSuccessRate: number;
    authFailureCount: number;
    uptime: number;
    version?: string;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
}

export const handler: Handlers<HealthResponse | ErrorResponse> = {
  async GET(req: Request, _ctx: unknown) {
    try {
      // Require authentication for health endpoint
      const user = await authenticateRequest(req);
      if (!user || (user.role !== 'admin' && user.role !== 'host')) {
        return new Response(
          JSON.stringify({
            error: "FORBIDDEN",
            message: "Admin or host access required for health monitoring"
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Create health service and check status
      const healthService = createCoturnHealthService();
      const healthSummary = await healthService.getHealthSummary();

      const response: HealthResponse = {
        status: healthSummary.status,
        message: healthSummary.message,
        timestamp: new Date().toISOString(),
        metrics: {
          isHealthy: healthSummary.metrics.isHealthy,
          responseTime: healthSummary.metrics.responseTime,
          activeSessions: healthSummary.metrics.activeSessions,
          totalBandwidth: healthSummary.metrics.totalBandwidth,
          authSuccessRate: healthSummary.metrics.authSuccessRate,
          authFailureCount: healthSummary.metrics.authFailureCount,
          uptime: healthSummary.metrics.uptime,
          version: healthSummary.metrics.version
        }
      };

      // Set appropriate HTTP status based on health
      const httpStatus = healthSummary.status === 'healthy' ? 200 : 
                        healthSummary.status === 'degraded' ? 200 : 503;

      return new Response(
        JSON.stringify(response),
        {
          status: httpStatus,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate"
          }
        }
      );

    } catch (error) {
      console.error("Error checking Coturn health:", error);

      return new Response(
        JSON.stringify({
          error: "INTERNAL_SERVER_ERROR",
          message: "Failed to check Coturn service health"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};