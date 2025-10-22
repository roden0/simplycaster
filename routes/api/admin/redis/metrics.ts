/**
 * Redis Metrics API Endpoint
 * 
 * Provides detailed Redis performance metrics, cache statistics,
 * and operational data for monitoring and alerting.
 */

import { Handlers } from "$fresh/server.ts";
import { container } from "../../../../lib/container/global.ts";
import { RedisMonitoringService } from "../../../../lib/infrastructure/services/redis-monitoring-service.ts";

export const handler: Handlers = {
  async GET(req, ctx) {
    try {
      // Get Redis monitoring service from container
      const monitoringService = container.get<RedisMonitoringService>('RedisMonitoringService');
      
      const url = new URL(req.url);
      const historyHours = parseInt(url.searchParams.get('history_hours') || '1');
      const includeAlerts = url.searchParams.get('include_alerts') === 'true';
      
      // Get current metrics
      const currentMetrics = monitoringService.getCurrentMetrics();
      
      // Get metrics history if requested
      let metricsHistory = null;
      if (historyHours > 0) {
        metricsHistory = monitoringService.getMetricsHistory(historyHours);
      }
      
      // Get active alerts if requested
      let activeAlerts = null;
      if (includeAlerts) {
        activeAlerts = monitoringService.getActiveAlerts();
      }
      
      return new Response(
        JSON.stringify({
          current: currentMetrics,
          history: metricsHistory,
          alerts: activeAlerts,
          summary: {
            totalOperations: currentMetrics.operationCounts.total,
            averageResponseTime: currentMetrics.responseTime.average,
            cacheHitRate: currentMetrics.cacheHitRate,
            errorRate: currentMetrics.errorCount > 0 
              ? (currentMetrics.errorCount / Math.max(currentMetrics.operationCounts.total, 1)) * 100 
              : 0,
            uptime: currentMetrics.uptime,
            isHealthy: currentMetrics.connectionHealth.isConnected && 
                      currentMetrics.responseTime.average < 100 &&
                      currentMetrics.cacheHitRate > 80,
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, max-age=30', // Cache for 30 seconds
          },
        }
      );
      
    } catch (error) {
      console.error('Redis metrics retrieval failed:', error);
      
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          current: null,
          history: null,
          alerts: null,
          summary: {
            isHealthy: false,
            errorMessage: 'Metrics service unavailable',
          },
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        }
      );
    }
  },
};