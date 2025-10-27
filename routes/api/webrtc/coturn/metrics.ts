/**
 * Coturn Metrics API
 * 
 * GET /api/webrtc/coturn/metrics - Get detailed Coturn service metrics
 */

import { Handlers } from "$fresh/server.ts";
import { createCoturnHealthService } from "../../../../lib/webrtc/coturn-health-service.ts";
import { authenticateRequest } from "../../../../lib/middleware/auth.ts";

interface MetricsResponse {
  timestamp: string;
  health: {
    isHealthy: boolean;
    responseTime: number;
    uptime: number;
    version?: string;
    lastChecked: string;
  };
  sessions: {
    active: number;
    total: number;
    bandwidth: {
      total: number;
      average: number;
    };
  };
  authentication: {
    successRate: number;
    failureCount: number;
    totalAttempts: number;
  };
  performance: {
    averageResponseTime: number;
    connectionSuccessRate: number;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
}

export const handler: Handlers<MetricsResponse | ErrorResponse> = {
  async GET(req: Request, _ctx: unknown) {
    try {
      // Require admin authentication for detailed metrics
      const user = await authenticateRequest(req);
      if (!user || user.role !== 'admin') {
        return new Response(
          JSON.stringify({
            error: "FORBIDDEN",
            message: "Admin access required for detailed metrics"
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Get query parameters for time range
      const url = new URL(req.url);
      const timeRange = parseInt(url.searchParams.get('timeRange') || '3600', 10); // Default 1 hour

      // Create health service and get metrics
      const healthService = createCoturnHealthService();
      const [healthMetrics, sessionMetrics, authMetrics] = await Promise.all([
        healthService.checkHealth(),
        healthService.getSessionMetrics(),
        healthService.getAuthMetrics(timeRange)
      ]);

      // Calculate derived metrics
      const activeSessions = sessionMetrics.filter(s => s.isActive);
      const totalBandwidth = sessionMetrics.reduce((sum, s) => sum + s.bytesTransferred, 0);
      const averageBandwidth = activeSessions.length > 0 ? totalBandwidth / activeSessions.length : 0;

      const totalAuthAttempts = authMetrics.length;
      const successfulAuth = authMetrics.filter(a => a.success).length;
      const authSuccessRate = totalAuthAttempts > 0 ? (successfulAuth / totalAuthAttempts) * 100 : 100;

      const response: MetricsResponse = {
        timestamp: new Date().toISOString(),
        health: {
          isHealthy: healthMetrics.isHealthy,
          responseTime: healthMetrics.responseTime,
          uptime: healthMetrics.uptime,
          version: healthMetrics.version,
          lastChecked: healthMetrics.lastChecked.toISOString()
        },
        sessions: {
          active: activeSessions.length,
          total: sessionMetrics.length,
          bandwidth: {
            total: totalBandwidth,
            average: averageBandwidth
          }
        },
        authentication: {
          successRate: authSuccessRate,
          failureCount: totalAuthAttempts - successfulAuth,
          totalAttempts: totalAuthAttempts
        },
        performance: {
          averageResponseTime: healthMetrics.responseTime,
          connectionSuccessRate: authSuccessRate // Simplified metric
        }
      };

      return new Response(
        JSON.stringify(response),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=30" // Cache for 30 seconds
          }
        }
      );

    } catch (error) {
      console.error("Error getting Coturn metrics:", error);

      return new Response(
        JSON.stringify({
          error: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve Coturn metrics"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};