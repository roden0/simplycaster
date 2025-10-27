/**
 * WebRTC Connection Analytics API
 * 
 * GET /api/webrtc/analytics - Get WebRTC connection analytics and metrics
 */

import { Handlers } from "$fresh/server.ts";
import { createConnectionAnalyticsService } from "../../../lib/webrtc/connection-analytics-service.ts";
import { authenticateRequest } from "../../../lib/middleware/auth.ts";

interface AnalyticsResponse {
  timestamp: string;
  summary: {
    totalConnections: number;
    activeConnections: number;
    averageQuality: number;
    averageDuration: number;
  };
  connectionTypes: {
    direct: number;
    relay: number;
    unknown: number;
  };
  qualityDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  bandwidth: {
    total: number;
    average: number;
    peak: number;
  };
  activeConnections: Array<{
    sessionId: string;
    roomId: string;
    participantId: string;
    participantType: 'host' | 'guest';
    connectionType: 'direct' | 'relay' | 'unknown';
    duration: number;
    quality: {
      score: number;
      rating: 'excellent' | 'good' | 'fair' | 'poor';
      latency: number;
      bandwidth: number;
    };
  }>;
}

interface ErrorResponse {
  error: string;
  message: string;
}

export const handler: Handlers<AnalyticsResponse | ErrorResponse> = {
  async GET(req: Request, _ctx: unknown) {
    try {
      // Require authentication for analytics
      const user = await authenticateRequest(req);
      if (!user || (user.role !== 'admin' && user.role !== 'host')) {
        return new Response(
          JSON.stringify({
            error: "FORBIDDEN",
            message: "Admin or host access required for analytics"
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Get query parameters
      const url = new URL(req.url);
      const timeRange = parseInt(url.searchParams.get('timeRange') || '3600', 10); // Default 1 hour
      const roomId = url.searchParams.get('roomId') || undefined;
      const participantId = url.searchParams.get('participantId') || undefined;

      // Create analytics service and get metrics
      const analyticsService = createConnectionAnalyticsService();
      const aggregatedMetrics = analyticsService.getAggregatedMetrics(timeRange);
      const activeConnections = analyticsService.getActiveConnections();

      // Filter active connections if needed
      let filteredActiveConnections = activeConnections;
      if (roomId) {
        filteredActiveConnections = filteredActiveConnections.filter(c => c.roomId === roomId);
      }
      if (participantId) {
        filteredActiveConnections = filteredActiveConnections.filter(c => c.participantId === participantId);
      }

      // Format response
      const response: AnalyticsResponse = {
        timestamp: new Date().toISOString(),
        summary: {
          totalConnections: aggregatedMetrics.totalConnections,
          activeConnections: aggregatedMetrics.activeConnections,
          averageQuality: Math.round(aggregatedMetrics.averageQuality * 100) / 100,
          averageDuration: Math.round(aggregatedMetrics.averageDuration)
        },
        connectionTypes: aggregatedMetrics.connectionTypes,
        qualityDistribution: aggregatedMetrics.qualityDistribution,
        bandwidth: {
          total: aggregatedMetrics.bandwidthUsage.total,
          average: Math.round(aggregatedMetrics.bandwidthUsage.average),
          peak: Math.round(aggregatedMetrics.bandwidthUsage.peak)
        },
        activeConnections: filteredActiveConnections.map(connection => ({
          sessionId: connection.sessionId,
          roomId: connection.roomId,
          participantId: connection.participantId,
          participantType: connection.participantType,
          connectionType: connection.connectionType,
          duration: connection.duration,
          quality: {
            score: connection.quality.score,
            rating: connection.quality.rating,
            latency: Math.round(connection.quality.factors.latency),
            bandwidth: Math.round(connection.quality.factors.bandwidth)
          }
        }))
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
      console.error("Error getting WebRTC analytics:", error);

      return new Response(
        JSON.stringify({
          error: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve WebRTC analytics"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};