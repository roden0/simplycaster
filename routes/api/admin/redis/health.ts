/**
 * Redis Health Check API Endpoint
 * 
 * Provides comprehensive Redis health status and diagnostics
 * for administrators to monitor Redis performance and connectivity.
 */

import { Handlers } from "$fresh/server.ts";
import { container } from "../../../../lib/container/global.ts";
import { RedisHealthService } from "../../../../lib/infrastructure/services/redis-health-service.ts";

export const handler: Handlers = {
  async GET(req, ctx) {
    try {
      // Get Redis health service from container
      const healthService = container.get<RedisHealthService>('RedisHealthService');
      
      // Perform comprehensive health check
      const healthStatus = await healthService.checkHealth();
      
      // Get detailed Redis info if requested
      const includeInfo = new URL(req.url).searchParams.get('include_info') === 'true';
      let redisInfo = null;
      
      if (includeInfo) {
        redisInfo = await healthService.getRedisInfo();
      }
      
      // Determine HTTP status based on health
      let status = 200;
      if (healthStatus.overall === 'degraded') {
        status = 200; // Still OK but with warnings
      } else if (healthStatus.overall === 'unhealthy') {
        status = 503; // Service unavailable
      }
      
      return new Response(
        JSON.stringify({
          status: healthStatus.overall,
          checks: healthStatus.checks,
          recommendations: healthStatus.recommendations,
          lastChecked: healthStatus.lastChecked,
          redisInfo: redisInfo,
        }),
        {
          status,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        }
      );
      
    } catch (error) {
      console.error('Redis health check failed:', error);
      
      return new Response(
        JSON.stringify({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          checks: {
            connection: {
              status: 'fail',
              message: 'Health check service unavailable',
            },
          },
          recommendations: [
            'Check Redis service configuration',
            'Verify Redis server is running',
            'Check application logs for detailed error information',
          ],
          lastChecked: new Date(),
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        }
      );
    }
  },
};