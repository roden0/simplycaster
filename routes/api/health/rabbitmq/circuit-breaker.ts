/**
 * RabbitMQ Circuit Breaker Health Check API Endpoint
 * 
 * Provides detailed health status and metrics for the RabbitMQ circuit breaker.
 */

import { Handlers } from "$fresh/server.ts";
import { container } from "../../../../lib/container/global.ts";
import { EventPublisher } from "../../../../lib/domain/types/events.ts";
import { RabbitMQEventPublisher } from "../../../../lib/infrastructure/services/rabbitmq-event-publisher.ts";

/**
 * GET /api/health/rabbitmq/circuit-breaker
 * 
 * Returns detailed circuit breaker health status and state information.
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
          healthy: false,
          timestamp: new Date().toISOString(),
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Get monitoring service and metrics
      const monitoringService = eventPublisher.getMonitoringService();
      const metricsCollector = eventPublisher.getMetricsCollector();
      
      // Collect latest metrics
      await metricsCollector.collectMetricsFromMonitoring();
      const metricsSummary = metricsCollector.getMetricsSummary();
      
      // Get circuit breaker metrics
      const circuitBreakerMetrics = monitoringService.getCircuitBreakerMetrics();
      
      if (!circuitBreakerMetrics) {
        return new Response(JSON.stringify({
          success: true,
          healthy: true,
          circuitBreakerConfigured: false,
          message: "Circuit breaker is not configured",
          timestamp: new Date().toISOString(),
          data: {
            state: 'NOT_CONFIGURED',
            stateNumeric: -1,
            healthy: true,
            recommendation: 'Consider enabling circuit breaker for improved resilience',
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Assess circuit breaker health
      const isHealthy = circuitBreakerMetrics.state === 'CLOSED';
      const httpStatus = isHealthy ? 200 : 503;
      
      // Calculate additional metrics
      const totalAttempts = circuitBreakerMetrics.successCount + circuitBreakerMetrics.failureCount;
      const successRate = totalAttempts > 0 ? (circuitBreakerMetrics.successCount / totalAttempts) * 100 : 0;
      
      // Determine state description and recommendations
      const stateInfo = getCircuitBreakerStateInfo(circuitBreakerMetrics.state);
      
      const response = {
        success: true,
        healthy: isHealthy,
        circuitBreakerConfigured: true,
        timestamp: new Date().toISOString(),
        data: {
          // Current state
          state: circuitBreakerMetrics.state,
          stateNumeric: metricsSummary.circuitBreakerState,
          stateDescription: stateInfo.description,
          healthy: isHealthy,
          
          // Metrics
          metrics: {
            failureCount: circuitBreakerMetrics.failureCount,
            successCount: circuitBreakerMetrics.successCount,
            totalAttempts,
            failureRate: circuitBreakerMetrics.failureRate,
            successRate: Math.round(successRate * 100) / 100,
          },
          
          // Timing information
          timing: {
            nextAttemptTime: circuitBreakerMetrics.nextAttemptTime,
            lastStateChange: circuitBreakerMetrics.lastStateChange,
            timeUntilNextAttempt: circuitBreakerMetrics.nextAttemptTime ? 
              Math.max(0, new Date(circuitBreakerMetrics.nextAttemptTime).getTime() - Date.now()) : null,
          },
          
          // Health assessment
          assessment: {
            status: isHealthy ? 'healthy' : 'unhealthy',
            severity: getSeverityLevel(circuitBreakerMetrics.state, circuitBreakerMetrics.failureRate),
            impact: stateInfo.impact,
            recommendations: stateInfo.recommendations,
          },
          
          // Alerts
          alerts: generateCircuitBreakerAlerts(circuitBreakerMetrics),
        },
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: httpStatus,
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
      
    } catch (error) {
      console.error("❌ Circuit breaker health check failed:", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return new Response(JSON.stringify({
        success: false,
        healthy: false,
        error: "Circuit breaker health check failed",
        details: errorMessage,
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

/**
 * Get circuit breaker state information
 */
function getCircuitBreakerStateInfo(state: string): {
  description: string;
  impact: string;
  recommendations: string[];
} {
  switch (state) {
    case 'CLOSED':
      return {
        description: 'Circuit breaker is closed and allowing all requests through',
        impact: 'No impact - normal operation',
        recommendations: [
          'Monitor failure rates to ensure they stay within acceptable thresholds',
          'Review recent error patterns if failure count is increasing',
        ],
      };
      
    case 'OPEN':
      return {
        description: 'Circuit breaker is open and blocking all requests',
        impact: 'High impact - all event publishing is being blocked',
        recommendations: [
          'Investigate the underlying cause of failures',
          'Check RabbitMQ connection and server health',
          'Review recent error logs for patterns',
          'Consider manual intervention if the issue persists',
        ],
      };
      
    case 'HALF_OPEN':
      return {
        description: 'Circuit breaker is half-open and testing if the service has recovered',
        impact: 'Medium impact - limited requests are being allowed through for testing',
        recommendations: [
          'Monitor the next few requests closely',
          'If requests succeed, the circuit breaker will close automatically',
          'If requests fail, the circuit breaker will open again',
          'Avoid manual intervention during this critical testing phase',
        ],
      };
      
    default:
      return {
        description: 'Unknown circuit breaker state',
        impact: 'Unknown impact',
        recommendations: [
          'Check circuit breaker configuration',
          'Review system logs for errors',
        ],
      };
  }
}

/**
 * Get severity level based on circuit breaker state and failure rate
 */
function getSeverityLevel(state: string, failureRate: number): 'low' | 'medium' | 'high' | 'critical' {
  if (state === 'OPEN') {
    return 'critical';
  }
  
  if (state === 'HALF_OPEN') {
    return 'high';
  }
  
  if (state === 'CLOSED') {
    if (failureRate > 50) {
      return 'high';
    } else if (failureRate > 25) {
      return 'medium';
    } else {
      return 'low';
    }
  }
  
  return 'medium';
}

/**
 * Generate circuit breaker alerts
 */
function generateCircuitBreakerAlerts(metrics: any): string[] {
  const alerts: string[] = [];
  
  if (metrics.state === 'OPEN') {
    alerts.push('Circuit breaker is OPEN - all requests are being blocked');
    alerts.push(`Failure rate: ${metrics.failureRate}% (${metrics.failureCount} failures)`);
  }
  
  if (metrics.state === 'HALF_OPEN') {
    alerts.push('Circuit breaker is HALF_OPEN - testing service recovery');
  }
  
  if (metrics.state === 'CLOSED' && metrics.failureRate > 25) {
    alerts.push(`High failure rate detected: ${metrics.failureRate}%`);
    alerts.push('Circuit breaker may open soon if failures continue');
  }
  
  if (metrics.failureCount > 10) {
    alerts.push(`High failure count: ${metrics.failureCount} recent failures`);
  }
  
  return alerts;
}