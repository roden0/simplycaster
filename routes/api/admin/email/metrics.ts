/**
 * Email Metrics API Endpoint
 * 
 * Provides detailed metrics about email delivery performance,
 * queue statistics, provider performance, and alerting status.
 */

import { define } from "../../../../utils.ts";
import { 
  getEmailDeliveryRateStats,
  getEmailQueueStats,
  getEmailProviderStats,
  checkEmailAlertingThresholds,
  getEmailAlertingThresholds,
  setEmailAlertingThresholds,
  EmailAlertingThresholds,
} from "../../../../lib/observability/metrics/email-metrics.ts";

export const handler = define.handlers({
  async GET(req) {
    try {
      const url = new URL(req.url);
      const timeWindow = parseInt(url.searchParams.get('timeWindow') || '15');
      const includeAlerts = url.searchParams.get('alerts') !== 'false';
      const includeThresholds = url.searchParams.get('thresholds') === 'true';

      // Get delivery rate statistics
      const deliveryStats = getEmailDeliveryRateStats(timeWindow);
      
      // Get queue statistics
      const queueStats = getEmailQueueStats();
      
      // Get provider statistics
      const providerStats = getEmailProviderStats();

      const response: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        timeWindowMinutes: timeWindow,
        deliveryMetrics: {
          totalSent: deliveryStats.totalSent,
          totalFailed: deliveryStats.totalFailed,
          successRate: Math.round(deliveryStats.successRate * 10000) / 100, // Convert to percentage with 2 decimals
          failureRate: Math.round(deliveryStats.failureRate * 10000) / 100,
          averageProcessingTime: Math.round(deliveryStats.averageProcessingTime),
        },
        queueMetrics: {
          mainQueueDepth: queueStats.mainQueueDepth,
          retryQueueDepth: queueStats.retryQueueDepth,
          deadLetterQueueDepth: queueStats.deadLetterQueueDepth,
          totalProcessingRate: Math.round(queueStats.totalProcessingRate * 100) / 100,
          averageWaitTime: Math.round(queueStats.averageWaitTime),
        },
        providerMetrics: Object.fromEntries(
          Object.entries(providerStats).map(([provider, stats]) => [
            provider,
            {
              responseTime: Math.round(stats.responseTime),
              successRate: Math.round(stats.successRate * 10000) / 100,
              errorRate: Math.round(stats.errorRate * 10000) / 100,
              throughput: Math.round(stats.throughput * 100) / 100,
              healthy: stats.healthy,
            }
          ])
        ),
      };

      // Add alerts if requested
      if (includeAlerts) {
        const alerts = checkEmailAlertingThresholds();
        response.alerts = alerts.map(alert => ({
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          currentValue: alert.currentValue,
          threshold: alert.threshold,
          source: alert.source,
          metadata: alert.metadata,
        }));
        response.alertCount = alerts.length;
        response.criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
        response.warningAlerts = alerts.filter(a => a.severity === 'warning').length;
      }

      // Add thresholds if requested
      if (includeThresholds) {
        const thresholds = getEmailAlertingThresholds();
        response.alertingThresholds = {
          maxFailureRate: Math.round(thresholds.maxFailureRate * 10000) / 100,
          maxQueueDepth: thresholds.maxQueueDepth,
          maxProcessingTime: thresholds.maxProcessingTime,
          maxProviderResponseTime: thresholds.maxProviderResponseTime,
          minSuccessRate: Math.round(thresholds.minSuccessRate * 10000) / 100,
          timeWindowMinutes: thresholds.timeWindowMinutes,
        };
      }

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        status: "error",
        message: "Failed to retrieve email metrics",
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });
    }
  },

  async PUT(req) {
    try {
      const body = await req.json();
      
      if (!body.alertingThresholds) {
        return new Response(JSON.stringify({
          status: "error",
          message: "Missing alertingThresholds in request body",
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Validate and convert percentage values back to decimals
      const thresholds: Partial<EmailAlertingThresholds> = {};
      
      if (typeof body.alertingThresholds.maxFailureRate === 'number') {
        thresholds.maxFailureRate = body.alertingThresholds.maxFailureRate / 100;
      }
      
      if (typeof body.alertingThresholds.maxQueueDepth === 'number') {
        thresholds.maxQueueDepth = body.alertingThresholds.maxQueueDepth;
      }
      
      if (typeof body.alertingThresholds.maxProcessingTime === 'number') {
        thresholds.maxProcessingTime = body.alertingThresholds.maxProcessingTime;
      }
      
      if (typeof body.alertingThresholds.maxProviderResponseTime === 'number') {
        thresholds.maxProviderResponseTime = body.alertingThresholds.maxProviderResponseTime;
      }
      
      if (typeof body.alertingThresholds.minSuccessRate === 'number') {
        thresholds.minSuccessRate = body.alertingThresholds.minSuccessRate / 100;
      }
      
      if (typeof body.alertingThresholds.timeWindowMinutes === 'number') {
        thresholds.timeWindowMinutes = body.alertingThresholds.timeWindowMinutes;
      }

      // Validate ranges
      if (thresholds.maxFailureRate !== undefined && (thresholds.maxFailureRate < 0 || thresholds.maxFailureRate > 1)) {
        return new Response(JSON.stringify({
          status: "error",
          message: "maxFailureRate must be between 0 and 100 (percentage)",
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (thresholds.minSuccessRate !== undefined && (thresholds.minSuccessRate < 0 || thresholds.minSuccessRate > 1)) {
        return new Response(JSON.stringify({
          status: "error",
          message: "minSuccessRate must be between 0 and 100 (percentage)",
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (thresholds.maxQueueDepth !== undefined && thresholds.maxQueueDepth < 0) {
        return new Response(JSON.stringify({
          status: "error",
          message: "maxQueueDepth must be a positive number",
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (thresholds.maxProcessingTime !== undefined && thresholds.maxProcessingTime < 0) {
        return new Response(JSON.stringify({
          status: "error",
          message: "maxProcessingTime must be a positive number (milliseconds)",
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (thresholds.maxProviderResponseTime !== undefined && thresholds.maxProviderResponseTime < 0) {
        return new Response(JSON.stringify({
          status: "error",
          message: "maxProviderResponseTime must be a positive number (milliseconds)",
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (thresholds.timeWindowMinutes !== undefined && thresholds.timeWindowMinutes < 1) {
        return new Response(JSON.stringify({
          status: "error",
          message: "timeWindowMinutes must be at least 1 minute",
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Update thresholds
      setEmailAlertingThresholds(thresholds);

      // Get updated thresholds to return
      const updatedThresholds = getEmailAlertingThresholds();

      return new Response(JSON.stringify({
        status: "success",
        message: "Email alerting thresholds updated successfully",
        alertingThresholds: {
          maxFailureRate: Math.round(updatedThresholds.maxFailureRate * 10000) / 100,
          maxQueueDepth: updatedThresholds.maxQueueDepth,
          maxProcessingTime: updatedThresholds.maxProcessingTime,
          maxProviderResponseTime: updatedThresholds.maxProviderResponseTime,
          minSuccessRate: Math.round(updatedThresholds.minSuccessRate * 10000) / 100,
          timeWindowMinutes: updatedThresholds.timeWindowMinutes,
        },
        timestamp: new Date().toISOString(),
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        status: "error",
        message: "Failed to update email alerting thresholds",
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});