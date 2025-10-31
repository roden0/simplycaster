/**
 * ObservabilityService - Service for OpenTelemetry initialization and management
 * 
 * This service provides:
 * - Service initialization with proper error handling
 * - Span creation and management utilities
 * - Metric recording functionality
 * - Graceful shutdown procedures
 */

import { trace, metrics, context, SpanStatusCode, SpanKind } from "npm:@opentelemetry/api@1.7.0";
import type { Span, Tracer, Meter, Counter, Histogram } from "npm:@opentelemetry/api@1.7.0";
import type { ObservabilityConfig } from "./config/observability-config.ts";
import { loadAndValidateConfig } from "./config/observability-config.ts";
import { initializeSDK, shutdownSDK, isSDKInitialized } from "./sdk-init.ts";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Span creation options
 */
export interface SpanOptions {
  /** Span kind */
  kind?: SpanKind;
  /** Initial attributes */
  attributes?: Record<string, string | number | boolean>;
  /** Parent span context */
  parent?: Span;
  /** Start time */
  startTime?: Date;
}

/**
 * Metric recording options
 */
export interface MetricOptions {
  /** Metric attributes/labels */
  attributes?: Record<string, string | number | boolean>;
  /** Timestamp for the measurement */
  timestamp?: Date;
}

/**
 * Service health status
 */
export interface ServiceHealth {
  /** Overall health status */
  healthy: boolean;
  /** Initialization status */
  initialized: boolean;
  /** Configuration validation status */
  configValid: boolean;
  /** Last error if any */
  lastError?: string;
  /** Service uptime in milliseconds */
  uptime: number;
  /** Initialization timestamp */
  startedAt: Date;
}

/**
 * Observability service interface
 */
export interface IObservabilityService {
  /** Initialize the service */
  initialize(config?: ObservabilityConfig): Promise<void>;
  
  /** Create a new span */
  createSpan(name: string, options?: SpanOptions): Span;
  
  /** Start an active span with callback */
  startActiveSpan<T>(name: string, fn: (span: Span) => T, options?: SpanOptions): T;
  
  /** Record a counter metric */
  recordCounter(name: string, value: number, options?: MetricOptions): void;
  
  /** Record a histogram metric */
  recordHistogram(name: string, value: number, options?: MetricOptions): void;
  
  /** Record a gauge metric */
  recordGauge(name: string, value: number, options?: MetricOptions): void;
  
  /** Get service health status */
  getHealth(): ServiceHealth;
  
  /** Graceful shutdown */
  shutdown(): Promise<void>;
}

// ============================================================================
// OBSERVABILITY SERVICE IMPLEMENTATION
// ============================================================================

/**
 * ObservabilityService implementation
 */
export class ObservabilityService implements IObservabilityService {
  private config: ObservabilityConfig | null = null;
  private tracer: Tracer | null = null;
  private meter: Meter | null = null;
  private initialized = false;
  private startedAt: Date | null = null;
  private lastError: string | null = null;
  
  // Cached metric instruments
  private counters = new Map<string, Counter>();
  private histograms = new Map<string, Histogram>();
  private gauges = new Map<string, Counter>(); // Use Counter for gauge-like metrics
  
  // Built-in metrics
  private initializationCounter: Counter | null = null;
  private spanCreationCounter: Counter | null = null;
  private metricRecordingCounter: Counter | null = null;
  private errorCounter: Counter | null = null;

  constructor() {
    // Service starts but is not initialized until initialize() is called
  }

  /**
   * Initialize the observability service
   */
  async initialize(config?: ObservabilityConfig): Promise<void> {
    try {
      this.startedAt = new Date();
      this.lastError = null;

      // Load and validate configuration
      this.config = config || loadAndValidateConfig();
      
      // Check if observability is disabled
      if (this.config.performance.sdkDisabled || !this.config.otel.enabled) {
        console.log('ObservabilityService: OpenTelemetry is disabled, running in no-op mode');
        this.initialized = true;
        return;
      }

      // Initialize OpenTelemetry SDK with exporters
      if (!isSDKInitialized()) {
        await initializeSDK();
      }

      // Initialize tracer
      this.tracer = trace.getTracer(
        this.config.otel.serviceName,
        this.config.otel.serviceVersion
      );

      // Initialize meter
      this.meter = metrics.getMeter(
        this.config.otel.serviceName,
        this.config.otel.serviceVersion
      );

      // Create built-in metrics
      await this.initializeBuiltInMetrics();

      // Record successful initialization
      this.initializationCounter?.add(1, {
        status: 'success',
        environment: this.config.otel.environment,
      });

      this.initialized = true;
      
      console.log(`ObservabilityService: Successfully initialized for service '${this.config.otel.serviceName}' v${this.config.otel.serviceVersion}`);
      
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      
      // Record failed initialization
      this.initializationCounter?.add(1, {
        status: 'error',
        error: this.lastError,
      });

      console.error('ObservabilityService: Failed to initialize:', this.lastError);
      
      // Don't throw - allow application to continue with degraded observability
      this.initialized = false;
    }
  }

  /**
   * Initialize built-in metrics
   */
  private async initializeBuiltInMetrics(): Promise<void> {
    if (!this.meter) return;

    this.initializationCounter = this.meter.createCounter('observability_service_initializations_total', {
      description: 'Total number of observability service initialization attempts',
      unit: '1',
    });

    this.spanCreationCounter = this.meter.createCounter('observability_spans_created_total', {
      description: 'Total number of spans created',
      unit: '1',
    });

    this.metricRecordingCounter = this.meter.createCounter('observability_metrics_recorded_total', {
      description: 'Total number of metrics recorded',
      unit: '1',
    });

    this.errorCounter = this.meter.createCounter('observability_errors_total', {
      description: 'Total number of observability errors',
      unit: '1',
    });

    // Allow for any async initialization if needed in the future
    await Promise.resolve();
  }

  /**
   * Create a new span
   */
  createSpan(name: string, options: SpanOptions = {}): Span {
    if (!this.initialized || !this.tracer) {
      // Return a no-op span if not initialized
      return trace.getActiveSpan() || trace.getTracer('noop').startSpan('noop');
    }

    try {
      const spanContext = options.parent ? trace.setSpan(context.active(), options.parent) : context.active();
      
      const span = this.tracer.startSpan(name, {
        kind: options.kind,
        attributes: options.attributes,
        startTime: options.startTime,
      }, spanContext);

      // Record span creation
      this.spanCreationCounter?.add(1, {
        span_name: name,
        span_kind: options.kind || 'internal',
      });

      return span;
    } catch (error) {
      this.handleError('createSpan', error);
      // Return a no-op span on error
      return trace.getTracer('noop').startSpan('noop');
    }
  }

  /**
   * Start an active span with callback
   */
  startActiveSpan<T>(name: string, fn: (span: Span) => T, options: SpanOptions = {}): T {
    if (!this.initialized || !this.tracer) {
      // Execute function without span if not initialized
      const noopSpan = trace.getTracer('noop').startSpan('noop');
      return fn(noopSpan);
    }

    try {
      const spanContext = options.parent ? trace.setSpan(context.active(), options.parent) : context.active();
      
      return this.tracer.startActiveSpan(name, {
        kind: options.kind,
        attributes: options.attributes,
        startTime: options.startTime,
      }, spanContext, (span) => {
        try {
          // Record span creation
          this.spanCreationCounter?.add(1, {
            span_name: name,
            span_kind: options.kind || 'internal',
          });

          const result = fn(span);
          
          // Set span status to OK if no exception
          span.setStatus({ code: SpanStatusCode.OK });
          
          return result;
        } catch (error) {
          // Record exception and set error status
          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        } finally {
          span.end();
        }
      });
    } catch (error) {
      this.handleError('startActiveSpan', error);
      // Execute function without span on error
      const noopSpan = trace.getTracer('noop').startSpan('noop');
      return fn(noopSpan);
    }
  }

  /**
   * Record a counter metric
   */
  recordCounter(name: string, value: number, options: MetricOptions = {}): void {
    if (!this.initialized || !this.meter) {
      return; // Silently ignore if not initialized
    }

    try {
      let counter = this.counters.get(name);
      if (!counter) {
        counter = this.meter.createCounter(name, {
          description: `Counter metric: ${name}`,
          unit: '1',
        });
        this.counters.set(name, counter);
      }

      counter.add(value, options.attributes);

      // Record metric recording
      this.metricRecordingCounter?.add(1, {
        metric_name: name,
        metric_type: 'counter',
      });
    } catch (error) {
      this.handleError('recordCounter', error);
    }
  }

  /**
   * Record a histogram metric
   */
  recordHistogram(name: string, value: number, options: MetricOptions = {}): void {
    if (!this.initialized || !this.meter) {
      return; // Silently ignore if not initialized
    }

    try {
      let histogram = this.histograms.get(name);
      if (!histogram) {
        histogram = this.meter.createHistogram(name, {
          description: `Histogram metric: ${name}`,
          unit: '1',
        });
        this.histograms.set(name, histogram);
      }

      histogram.record(value, options.attributes);

      // Record metric recording
      this.metricRecordingCounter?.add(1, {
        metric_name: name,
        metric_type: 'histogram',
      });
    } catch (error) {
      this.handleError('recordHistogram', error);
    }
  }

  /**
   * Record a gauge metric (implemented as counter for simplicity)
   */
  recordGauge(name: string, value: number, options: MetricOptions = {}): void {
    if (!this.initialized || !this.meter) {
      return; // Silently ignore if not initialized
    }

    try {
      let gauge = this.gauges.get(name);
      if (!gauge) {
        gauge = this.meter.createCounter(`${name}_gauge`, {
          description: `Gauge-like metric: ${name}`,
          unit: '1',
        });
        this.gauges.set(name, gauge);
      }

      // Use counter to simulate gauge behavior
      // Note: This is a simplified implementation - in practice, you might need
      // to use an observable gauge or up-down counter
      gauge.add(value, options.attributes);

      // Record metric recording
      this.metricRecordingCounter?.add(1, {
        metric_name: name,
        metric_type: 'gauge',
      });
    } catch (error) {
      this.handleError('recordGauge', error);
    }
  }

  /**
   * Get service health status
   */
  getHealth(): ServiceHealth {
    const now = new Date();
    const uptime = this.startedAt ? now.getTime() - this.startedAt.getTime() : 0;

    return {
      healthy: this.initialized && this.lastError === null,
      initialized: this.initialized,
      configValid: this.config !== null,
      lastError: this.lastError || undefined,
      uptime,
      startedAt: this.startedAt || now,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      console.log('ObservabilityService: Starting graceful shutdown...');

      // Shutdown SDK
      await shutdownSDK();

      // Clear cached instruments
      this.counters.clear();
      this.histograms.clear();
      this.gauges.clear();

      // Reset state
      this.tracer = null;
      this.meter = null;
      this.initialized = false;
      this.config = null;

      console.log('ObservabilityService: Graceful shutdown completed');
    } catch (error) {
      this.handleError('shutdown', error);
      throw error;
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(operation: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.lastError = `${operation}: ${errorMessage}`;
    
    // Record error metric
    this.errorCounter?.add(1, {
      operation,
      error_type: error instanceof Error ? error.constructor.name : 'unknown',
    });

    console.error(`ObservabilityService.${operation}:`, errorMessage);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global observability service instance
 */
export const observabilityService = new ObservabilityService();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Initialize observability service with configuration
 */
export async function initializeObservability(config?: ObservabilityConfig): Promise<void> {
  await observabilityService.initialize(config);
}

/**
 * Create a span with the global service
 */
export function createSpan(name: string, options?: SpanOptions): Span {
  return observabilityService.createSpan(name, options);
}

/**
 * Start an active span with the global service
 */
export function startActiveSpan<T>(name: string, fn: (span: Span) => T, options?: SpanOptions): T {
  return observabilityService.startActiveSpan(name, fn, options);
}

/**
 * Record a counter metric with the global service
 */
export function recordCounter(name: string, value: number, options?: MetricOptions): void {
  observabilityService.recordCounter(name, value, options);
}

/**
 * Record a histogram metric with the global service
 */
export function recordHistogram(name: string, value: number, options?: MetricOptions): void {
  observabilityService.recordHistogram(name, value, options);
}

/**
 * Record a gauge metric with the global service
 */
export function recordGauge(name: string, value: number, options?: MetricOptions): void {
  observabilityService.recordGauge(name, value, options);
}

/**
 * Get observability service health
 */
export function getObservabilityHealth(): ServiceHealth {
  return observabilityService.getHealth();
}

/**
 * Shutdown observability service
 */
export async function shutdownObservability(): Promise<void> {
  await observabilityService.shutdown();
}

// ============================================================================
// DECORATORS AND UTILITIES
// ============================================================================

/**
 * Decorator for automatic span creation around methods
 */
export function traced(spanName?: string) {
  return function <T extends (...args: unknown[]) => unknown>(
    target: Record<string, unknown>,
    propertyKey: string,
    descriptor?: TypedPropertyDescriptor<T>
  ) {
    // Handle both method decorators and property decorators
    const originalMethod = descriptor?.value || target[propertyKey];
    if (!originalMethod || typeof originalMethod !== 'function') return descriptor;

    const wrappedMethod = function (this: unknown, ...args: unknown[]) {
      const name = spanName || `${(target.constructor as { name?: string })?.name || 'Unknown'}.${propertyKey}`;
      return startActiveSpan(name, (span) => {
        try {
          // Add method information to span
          span.setAttributes({
            'method.class': (target.constructor as { name?: string })?.name || 'Unknown',
            'method.name': propertyKey,
            'method.args_count': args.length,
          });

          return (originalMethod as (...args: unknown[]) => unknown).apply(this, args);
        } catch (error) {
          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      });
    } as T;

    if (descriptor) {
      descriptor.value = wrappedMethod;
      return descriptor;
    } else {
      // For property decorators
      target[propertyKey] = wrappedMethod;
    }
  };
}

/**
 * Decorator for automatic metric recording around methods
 */
export function metered(metricName?: string) {
  return function <T extends (...args: unknown[]) => unknown>(
    target: Record<string, unknown>,
    propertyKey: string,
    descriptor?: TypedPropertyDescriptor<T>
  ) {
    // Handle both method decorators and property decorators
    const originalMethod = descriptor?.value || target[propertyKey];
    if (!originalMethod || typeof originalMethod !== 'function') return descriptor;

    const wrappedMethod = function (this: unknown, ...args: unknown[]) {
      const name = metricName || `method_calls_total`;
      const startTime = Date.now();
      
      try {
        const result = (originalMethod as (...args: unknown[]) => unknown).apply(this, args);
        
        // Record success metrics
        recordCounter(name, 1, {
          attributes: {
            method: `${(target.constructor as { name?: string })?.name || 'Unknown'}.${propertyKey}`,
            status: 'success',
          },
        });
        
        recordHistogram(`${name.replace('_total', '')}_duration_ms`, Date.now() - startTime, {
          attributes: {
            method: `${(target.constructor as { name?: string })?.name || 'Unknown'}.${propertyKey}`,
          },
        });
        
        return result;
      } catch (error) {
        // Record error metrics
        recordCounter(name, 1, {
          attributes: {
            method: `${(target.constructor as { name?: string })?.name || 'Unknown'}.${propertyKey}`,
            status: 'error',
            error_type: error instanceof Error ? error.constructor.name : 'unknown',
          },
        });
        
        throw error;
      }
    } as T;

    if (descriptor) {
      descriptor.value = wrappedMethod;
      return descriptor;
    } else {
      // For property decorators
      target[propertyKey] = wrappedMethod;
    }
  };
}

/**
 * Utility to add common attributes to spans
 */
export function addCommonAttributes(span: Span, attributes: {
  userId?: string;
  roomId?: string;
  operation?: string;
  component?: string;
}): void {
  const attrs: Record<string, string> = {};
  
  if (attributes.userId) attrs['user.id'] = attributes.userId;
  if (attributes.roomId) attrs['room.id'] = attributes.roomId;
  if (attributes.operation) attrs['operation.name'] = attributes.operation;
  if (attributes.component) attrs['component.name'] = attributes.component;
  
  span.setAttributes(attrs);
}

/**
 * Utility to create a child span from current active span
 */
export function createChildSpan(name: string, options: Omit<SpanOptions, 'parent'> = {}): Span {
  const activeSpan = trace.getActiveSpan();
  return createSpan(name, { ...options, parent: activeSpan || undefined });
}