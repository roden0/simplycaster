/**
 * Redis Logs API Endpoint
 * 
 * Provides access to Redis operation logs, performance data,
 * and error analysis for administrators and monitoring systems.
 */

import { Handlers } from "$fresh/server.ts";
import { container } from "../../../../lib/container/global.ts";
import { RedisServiceWithLogging } from "../../../../lib/infrastructure/services/redis-service-with-logging.ts";

export const handler: Handlers = {
  async GET(req, ctx) {
    try {
      // Get Redis service with logging from container
      const redisService = container.get<RedisServiceWithLogging>('RedisServiceWithLogging');
      const logger = redisService.getLogger();
      
      const url = new URL(req.url);
      const action = url.searchParams.get('action') || 'recent';
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const level = url.searchParams.get('level') as any;
      const operation = url.searchParams.get('operation') || undefined;
      const format = url.searchParams.get('format') || 'json';
      const hours = parseInt(url.searchParams.get('hours') || '1');

      let responseData: any;
      let contentType = 'application/json';

      switch (action) {
        case 'recent':
          responseData = {
            logs: logger.getRecentLogs(limit, level, operation),
            total: logger.getRecentLogs(10000).length, // Get total count
          };
          break;

        case 'performance':
          responseData = {
            summary: logger.getPerformanceSummary(),
            errorSummary: logger.getErrorSummary(hours),
          };
          break;

        case 'errors':
          responseData = logger.getErrorSummary(hours);
          break;

        case 'export':
          const startTime = url.searchParams.get('start_time') 
            ? new Date(url.searchParams.get('start_time')!) 
            : undefined;
          const endTime = url.searchParams.get('end_time') 
            ? new Date(url.searchParams.get('end_time')!) 
            : undefined;

          const exportData = logger.exportLogs(format as any, {
            startTime,
            endTime,
            level,
            operation,
          });

          if (format === 'csv') {
            contentType = 'text/csv';
            return new Response(exportData, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="redis-logs-${new Date().toISOString().split('T')[0]}.csv"`,
              },
            });
          } else {
            responseData = JSON.parse(exportData);
          }
          break;

        case 'stats':
          const recentLogs = logger.getRecentLogs(10000); // Get more for stats
          const errorLogs = recentLogs.filter(log => !log.success);
          const slowLogs = recentLogs.filter(log => log.operation.startsWith('slow_'));
          
          // Calculate operation distribution
          const operationCounts: Record<string, number> = {};
          for (const log of recentLogs) {
            operationCounts[log.operation] = (operationCounts[log.operation] || 0) + 1;
          }

          // Calculate hourly distribution
          const hourlyStats: Record<string, number> = {};
          for (const log of recentLogs) {
            const hour = log.timestamp.toISOString().substring(0, 13); // YYYY-MM-DDTHH
            hourlyStats[hour] = (hourlyStats[hour] || 0) + 1;
          }

          responseData = {
            totalLogs: recentLogs.length,
            errorCount: errorLogs.length,
            slowQueryCount: slowLogs.length,
            errorRate: recentLogs.length > 0 ? (errorLogs.length / recentLogs.length) * 100 : 0,
            operationDistribution: operationCounts,
            hourlyDistribution: hourlyStats,
            topErrors: errorLogs
              .slice(0, 10)
              .map(log => ({
                timestamp: log.timestamp,
                operation: log.operation,
                key: log.key,
                error: log.error,
              })),
          };
          break;

        default:
          return new Response(
            JSON.stringify({ error: 'Invalid action parameter' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          );
      }

      return new Response(
        JSON.stringify(responseData),
        {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, max-age=30',
          },
        }
      );

    } catch (error) {
      console.error('Redis logs API error:', error);
      
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          logs: [],
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },

  async DELETE(req, ctx) {
    try {
      // Clear logs (admin only operation)
      const redisService = container.get<RedisServiceWithLogging>('RedisServiceWithLogging');
      const logger = redisService.getLogger();
      
      logger.clearLogs();
      
      return new Response(
        JSON.stringify({ message: 'Redis logs cleared successfully' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    } catch (error) {
      console.error('Redis logs clear error:', error);
      
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};