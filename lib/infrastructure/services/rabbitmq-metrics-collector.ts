/**
 * RabbitMQ Metrics Collector
 * 
 * Implements standardized metrics collection for RabbitMQ event publishing
 * with Counter, Histogram, and Gauge metrics following Prometheus patterns.
 */

import { DomainEvent } from '../../domain/types/events.ts';
import { RabbitMQMonitoringService } from './rabbitmq-monitoring-service.ts';

/**
 * Counter metric for tracking cumulative values
 */
export class Counter {
  private value = 0;
  private labels: Record<string, string> = {};

  constructor(
    private name: string,
    private help: string,
    private labelNames: string[] = []
  ) {}

  /**
   * Increment counter by value (default 1)
   */
  inc(value = 1, labels?: Record<string, string>): void {
    if (value < 0) {
      throw new Error('Counter can only be incremented by non-negative values');
    }
    
    this.value += value;
    if (labels) {
      this.labels = { ...this.labels, ...labels };
    }
  }

  /**
   * Get current counter value
   */
  get(): number {
    return this.value;
  }

  /**
   * Get counter with labels
   */
  getWithLabels(): { value: number; labels: Record<string, string> } {
    return {
      value: this.value,
      labels: this.labels,
    };
  }

  /**
   * Reset counter to zero
   */
  reset(): void {
    this.value = 0;
    this.labels = {};
  }

  /**
   * Get metric metadata
   */
  getMetadata() {
    return {
      name: this.name,
      help: this.help,
      type: 'counter',
      labelNames: this.labelNames,
    };
  }
}

/**
 * Histogram metric for tracking distributions of values
 */
export class Histogram {
  private buckets: Map<number, number> = new Map();
  private sum = 0;
  private count = 0;
  private labels: Record<string, string> = {};

  constructor(
    private name: string,
    private help: string,
    private bucketBounds: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    private labelNames: string[] = []
  ) {
    // Initialize buckets
    for (const bound of bucketBounds) {
      this.buckets.set(bound, 0);
    }
    // Add +Inf bucket
    this.buckets.set(Infinity, 0);
  }

  /**
   * Observe a value
   */
  observe(value: number, labels?: Record<string, string>): void {
    if (value < 0) {
      throw new Error('Histogram cannot observe negative values');
    }

    this.sum += value;
    this.count++;

    // Increment appropriate buckets
    for (const [bound, currentCount] of this.buckets) {
      if (value <= bound) {
        this.buckets.set(bound, currentCount + 1);
      }
    }

    if (labels) {
      this.labels = { ...this.labels, ...labels };
    }
  }

  /**
   * Get histogram statistics
   */
  get(): {
    buckets: Map<number, number>;
    sum: number;
    count: number;
    labels: Record<string, string>;
  } {
    return {
      buckets: new Map(this.buckets),
      sum: this.sum,
      count: this.count,
      labels: this.labels,
    };
  }

  /**
   * Get percentile value
   */
  getPercentile(percentile: number): number {
    if (this.count === 0) return 0;

    const targetCount = Math.ceil(this.count * percentile);
    let cumulativeCount = 0;

    for (const [bound, count] of this.buckets) {
      cumulativeCount += count;
      if (cumulativeCount >= targetCount) {
        return bound === Infinity ? this.getMaxObservedValue() : bound;
      }
    }

    return 0;
  }

  /**
   * Get average value
   */
  getAverage(): number {
    return this.count > 0 ? this.sum / this.count : 0;
  }

  /**
   * Get maximum observed value (approximation)
   */
  private getMaxObservedValue(): number {
    // Find the highest bucket with observations
    const sortedBounds = Array.from(this.buckets.keys()).sort((a, b) => b - a);
    for (const bound of sortedBounds) {
      if (bound !== Infinity && this.buckets.get(bound)! > 0) {
        return bound;
      }
    }
    return 0;
  }

  /**
   * Reset histogram
   */
  reset(): void {
    for (const bound of this.buckets.keys()) {
      this.buckets.set(bound, 0);
    }
    this.sum = 0;
    this.count = 0;
    this.labels = {};
  }

  /**
   * Get metric metadata
   */
  getMetadata() {
    return {
      name: this.name,
      help: this.help,
      type: 'histogram',
      labelNames: this.labelNames,
      buckets: Array.from(this.buckets.keys()),
    };
  }
}

/**
 * Gauge metric for tracking current values that can go up and down
 */
export class Gauge {
  private value = 0;
  private labels: Record<string, string> = {};

  constructor(
    private name: string,
    private help: string,
    private labelNames: string[] = []
  ) {}

  /**
   * Set gauge to specific value
   */
  set(value: number, labels?: Record<string, string>): void {
    this.value = value;
    if (labels) {
      this.labels = { ...this.labels, ...labels };
    }
  }

  /**
   * Increment gauge by value (default 1)
   */
  inc(value = 1, labels?: Record<string, string>): void {
    this.value += value;
    if (labels) {
      this.labels = { ...this.labels, ...labels };
    }
  }

  /**
   * Decrement gauge by value (default 1)
   */
  dec(value = 1, labels?: Record<string, string>): void {
    this.value -= value;
    if (labels) {
      this.labels = { ...this.labels, ...labels };
    }
  }

  /**
   * Get current gauge value
   */
  get(): number {
    return this.value;
  }

  /**
   * Get gauge with labels
   */
  getWithLabels(): { value: number; labels: Record<string, string> } {
    return {
      value: this.value,
      labels: this.labels,
    };
  }

  /**
   * Reset gauge to zero
   */
  reset(): void {
    this.value = 0;
    this.labels = {};
  }

  /**
   * Get metric metadata
   */
  getMetadata() {
    return {
      name: this.name,
      help: this.help,
      type: 'gauge',
      labelNames: this.labelNames,
    };
  }
}

/**
 * Metrics registry for managing all metrics
 */
export class MetricsRegistry {
  private metrics: Map<string, Counter | Histogram | Gauge> = new Map();

  /**
   * Register a metric
   */
  register<T extends Counter | Histogram | Gauge>(metric: T): T {
    const metadata = metric.getMetadata();
    if (this.metrics.has(metadata.name)) {
      throw new Error(`Metric with name '${metadata.name}' already registered`);
    }
    this.metrics.set(metadata.name, metric);
    return metric;
  }

  /**
   * Get a metric by name
   */
  get<T extends Counter | Histogram | Gauge>(name: string): T | undefined {
    return this.metrics.get(name) as T;
  }

  /**
   * Get all metrics
   */
  getAll(): Map<string, Counter | Histogram | Gauge> {
    return new Map(this.metrics);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Reset all metrics
   */
  resetAll(): void {
    for (const metric of this.metrics.values()) {
      metric.reset();
    }
  }

  /**
   * Get metrics in Prometheus format
   */
  getPrometheusFormat(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      const metadata = metric.getMetadata();
      
      // Add help and type comments
      lines.push(`# HELP ${metadata.name} ${metadata.help}`);
      lines.push(`# TYPE ${metadata.name} ${metadata.type}`);

      if (metadata.type === 'counter') {
        const counter = metric as Counter;
        const { value, labels } = counter.getWithLabels();
        const labelStr = this.formatLabels(labels);
        lines.push(`${metadata.name}${labelStr} ${value}`);
      } else if (metadata.type === 'histogram') {
        const histogram = metric as Histogram;
        const { buckets, sum, count, labels } = histogram.get();
        const labelStr = this.formatLabels(labels);

        // Add bucket metrics
        for (const [bound, bucketCount] of buckets) {
          const boundStr = bound === Infinity ? '+Inf' : bound.toString();
          const bucketLabels = { ...labels, le: boundStr };
          const bucketLabelStr = this.formatLabels(bucketLabels);
          lines.push(`${metadata.name}_bucket${bucketLabelStr} ${bucketCount}`);
        }

        // Add sum and count
        lines.push(`${metadata.name}_sum${labelStr} ${sum}`);
        lines.push(`${metadata.name}_count${labelStr} ${count}`);
      } else if (metadata.type === 'gauge') {
        const gauge = metric as Gauge;
        const { value, labels } = gauge.getWithLabels();
        const labelStr = this.formatLabels(labels);
        lines.push(`${metadata.name}${labelStr} ${value}`);
      }

      lines.push(''); // Empty line between metrics
    }

    return lines.join('\n');
  }

  /**
   * Format labels for Prometheus output
   */
  private formatLabels(labels: Record<string, string>): string {
    const labelPairs = Object.entries(labels);
    if (labelPairs.length === 0) {
      return '';
    }

    const formattedPairs = labelPairs.map(([key, value]) => `${key}="${value}"`);
    return `{${formattedPairs.join(',')}}`;
  }
}

/**
 * RabbitMQ Metrics Collector
 * 
 * Collects standardized metrics for RabbitMQ event publishing operations
 */
export class RabbitMQMetricsCollector {
  private registry = new MetricsRegistry();

  // Event publishing metrics
  private eventsPublishedTotal: Counter;
  private eventsFailedTotal: Counter;
  private publishingDurationSeconds: Histogram;
  private publishingLatencySeconds: Histogram;

  // Connection and infrastructure metrics
  private connectionStatus: Gauge;
  private activeChannels: Gauge;
  private queueDepth: Gauge;
  private circuitBreakerState: Gauge;

  // Performance metrics
  private eventsPerSecond: Gauge;
  private successRate: Gauge;
  private retryAttempts: Counter;
  private deadLetterQueueEvents: Counter;

  constructor(private monitoringService?: RabbitMQMonitoringService) {
    this.initializeMetrics();
  }

  /**
   * Initialize all metrics
   */
  private initializeMetrics(): void {
    // Event publishing counters
    this.eventsPublishedTotal = this.registry.register(
      new Counter(
        'rabbitmq_events_published_total',
        'Total number of events published successfully',
        ['event_type', 'routing_key']
      )
    );

    this.eventsFailedTotal = this.registry.register(
      new Counter(
        'rabbitmq_events_failed_total',
        'Total number of events that failed to publish',
        ['event_type', 'error_type', 'routing_key']
      )
    );

    // Publishing duration histogram (in seconds)
    this.publishingDurationSeconds = this.registry.register(
      new Histogram(
        'rabbitmq_publishing_duration_seconds',
        'Time spent publishing events in seconds',
        [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], // 1ms to 10s
        ['event_type']
      )
    );

    // Publishing latency histogram (in seconds)
    this.publishingLatencySeconds = this.registry.register(
      new Histogram(
        'rabbitmq_publishing_latency_seconds',
        'End-to-end latency for event publishing in seconds',
        [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        ['event_type']
      )
    );

    // Connection status gauge (1 = connected, 0 = disconnected)
    this.connectionStatus = this.registry.register(
      new Gauge(
        'rabbitmq_connection_status',
        'RabbitMQ connection status (1 = connected, 0 = disconnected)'
      )
    );

    // Active channels gauge
    this.activeChannels = this.registry.register(
      new Gauge(
        'rabbitmq_active_channels',
        'Number of active RabbitMQ channels'
      )
    );

    // Queue depth gauge
    this.queueDepth = this.registry.register(
      new Gauge(
        'rabbitmq_queue_depth',
        'Number of messages in RabbitMQ queues',
        ['queue_name']
      )
    );

    // Circuit breaker state gauge (0 = closed, 1 = open, 2 = half-open)
    this.circuitBreakerState = this.registry.register(
      new Gauge(
        'rabbitmq_circuit_breaker_state',
        'Circuit breaker state (0 = closed, 1 = open, 2 = half-open)'
      )
    );

    // Performance gauges
    this.eventsPerSecond = this.registry.register(
      new Gauge(
        'rabbitmq_events_per_second',
        'Current rate of events published per second'
      )
    );

    this.successRate = this.registry.register(
      new Gauge(
        'rabbitmq_success_rate_percent',
        'Success rate of event publishing as percentage'
      )
    );

    // Retry and error handling counters
    this.retryAttempts = this.registry.register(
      new Counter(
        'rabbitmq_retry_attempts_total',
        'Total number of retry attempts for failed events',
        ['event_type', 'attempt_number']
      )
    );

    this.deadLetterQueueEvents = this.registry.register(
      new Counter(
        'rabbitmq_dead_letter_queue_events_total',
        'Total number of events sent to dead letter queue',
        ['event_type', 'failure_reason']
      )
    );
  }

  /**
   * Record successful event publication
   */
  recordEventPublished(event: DomainEvent, durationMs: number, routingKey: string): void {
    const durationSeconds = durationMs / 1000;
    
    this.eventsPublishedTotal.inc(1, {
      event_type: event.type,
      routing_key: routingKey,
    });

    this.publishingDurationSeconds.observe(durationSeconds, {
      event_type: event.type,
    });

    // Also record as latency (same value for now, could be different in async scenarios)
    this.publishingLatencySeconds.observe(durationSeconds, {
      event_type: event.type,
    });

    console.log(`📊 Metrics: Event published - ${event.type} in ${durationMs}ms`);
  }

  /**
   * Record failed event publication
   */
  recordEventFailed(event: DomainEvent, error: Error, durationMs: number, routingKey: string): void {
    const errorType = this.classifyError(error);
    
    this.eventsFailedTotal.inc(1, {
      event_type: event.type,
      error_type: errorType,
      routing_key: routingKey,
    });

    const durationSeconds = durationMs / 1000;
    this.publishingDurationSeconds.observe(durationSeconds, {
      event_type: event.type,
    });

    console.log(`📊 Metrics: Event failed - ${event.type} (${errorType}) in ${durationMs}ms`);
  }

  /**
   * Record retry attempt
   */
  recordRetryAttempt(event: DomainEvent, attemptNumber: number): void {
    this.retryAttempts.inc(1, {
      event_type: event.type,
      attempt_number: attemptNumber.toString(),
    });

    console.log(`📊 Metrics: Retry attempt ${attemptNumber} for ${event.type}`);
  }

  /**
   * Record dead letter queue event
   */
  recordDeadLetterQueueEvent(event: DomainEvent, failureReason: string): void {
    this.deadLetterQueueEvents.inc(1, {
      event_type: event.type,
      failure_reason: failureReason,
    });

    console.log(`📊 Metrics: Event sent to DLQ - ${event.type} (${failureReason})`);
  }

  /**
   * Update connection status
   */
  updateConnectionStatus(isConnected: boolean): void {
    this.connectionStatus.set(isConnected ? 1 : 0);
  }

  /**
   * Update active channels count
   */
  updateActiveChannels(count: number): void {
    this.activeChannels.set(count);
  }

  /**
   * Update queue depth
   */
  updateQueueDepth(queueName: string, depth: number): void {
    this.queueDepth.set(depth, { queue_name: queueName });
  }

  /**
   * Update circuit breaker state
   */
  updateCircuitBreakerState(state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
    const stateValue = state === 'CLOSED' ? 0 : state === 'OPEN' ? 1 : 2;
    this.circuitBreakerState.set(stateValue);
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(eventsPerSecond: number, successRatePercent: number): void {
    this.eventsPerSecond.set(eventsPerSecond);
    this.successRate.set(successRatePercent);
  }

  /**
   * Collect metrics from monitoring service
   */
  async collectMetricsFromMonitoring(): Promise<void> {
    if (!this.monitoringService) {
      return;
    }

    try {
      // Get comprehensive monitoring report
      const report = await this.monitoringService.getMonitoringReport();

      // Update connection metrics
      this.updateConnectionStatus(report.connectionMetrics.isHealthy);
      this.updateActiveChannels(report.connectionMetrics.activeChannels);

      // Update queue metrics
      for (const [queueName, depth] of Object.entries(report.queueMetrics.queueDepths)) {
        this.updateQueueDepth(queueName, depth);
      }

      // Update circuit breaker metrics
      if (report.circuitBreakerMetrics) {
        this.updateCircuitBreakerState(report.circuitBreakerMetrics.state);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(
        report.eventMetrics.eventsPerSecond,
        report.eventMetrics.successRate
      );

      console.log('📊 Metrics: Updated from monitoring service');
    } catch (error) {
      console.error('❌ Failed to collect metrics from monitoring service:', error);
    }
  }

  /**
   * Classify error for metrics labeling
   */
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('validation')) return 'validation_error';
    if (message.includes('serialization')) return 'serialization_error';
    if (message.includes('connection')) return 'connection_error';
    if (message.includes('timeout')) return 'timeout_error';
    if (message.includes('circuit breaker')) return 'circuit_breaker_error';
    if (message.includes('authentication')) return 'auth_error';
    if (message.includes('authorization')) return 'auth_error';
    if (message.includes('not found')) return 'not_found_error';
    if (message.includes('queue')) return 'queue_error';
    if (message.includes('exchange')) return 'exchange_error';
    
    return 'unknown_error';
  }

  /**
   * Get metrics registry
   */
  getRegistry(): MetricsRegistry {
    return this.registry;
  }

  /**
   * Get all metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    return this.registry.getPrometheusFormat();
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): {
    eventsPublished: number;
    eventsFailed: number;
    successRate: number;
    averageLatency: number;
    connectionStatus: number;
    activeChannels: number;
    circuitBreakerState: number;
  } {
    return {
      eventsPublished: this.eventsPublishedTotal.get(),
      eventsFailed: this.eventsFailedTotal.get(),
      successRate: this.successRate.get(),
      averageLatency: this.publishingLatencySeconds.getAverage(),
      connectionStatus: this.connectionStatus.get(),
      activeChannels: this.activeChannels.get(),
      circuitBreakerState: this.circuitBreakerState.get(),
    };
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.registry.resetAll();
    console.log('📊 Metrics: All metrics reset');
  }

  /**
   * Start periodic metrics collection
   */
  startPeriodicCollection(intervalMs = 30000): NodeJS.Timeout {
    console.log(`📊 Metrics: Starting periodic collection every ${intervalMs}ms`);
    
    return setInterval(async () => {
      try {
        await this.collectMetricsFromMonitoring();
      } catch (error) {
        console.error('❌ Failed periodic metrics collection:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic metrics collection
   */
  stopPeriodicCollection(intervalId: NodeJS.Timeout): void {
    clearInterval(intervalId);
    console.log('📊 Metrics: Stopped periodic collection');
  }
}

/**
 * Factory function to create metrics collector
 */
export function createRabbitMQMetricsCollector(
  monitoringService?: RabbitMQMonitoringService
): RabbitMQMetricsCollector {
  return new RabbitMQMetricsCollector(monitoringService);
}