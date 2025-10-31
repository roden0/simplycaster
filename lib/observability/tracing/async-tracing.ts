/**
 * Async Tracing - Utilities for tracing async operations and correlating them
 * 
 * This module provides:
 * - Async operation tracing
 * - Cross-async boundary correlation
 * - Promise and callback instrumentation
 * - Async context management
 */

import { SpanKind, SpanStatusCode } from "npm:@opentelemetry/api@1.7.0";
import type { Span } from "npm:@opentelemetry/api@1.7.0";
import { startActiveSpan, createSpan, addCommonAttributes } from "../observability-service.ts";
import { 
  correlateAsyncOperation,
  getCurrentTraceContext,
  createChildContext,
  type TraceContext 
} from "./trace-context.ts";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Async tracing options
 */
export interface AsyncTracingOptions {
  /** Include async stack traces */
  includeStackTrace: boolean;
  /** Maximum stack trace depth */
  maxStackDepth: number;
  /** Include timing information */
  includeTiming: boolean;
  /** Include memory usage */
  includeMemoryUsage: boolean;
  /** Correlation timeout in milliseconds */
  correlationTimeout: number;
}

/**
 * Async operation options
 */
export interface AsyncOperationOptions {
  /** Operation name */
  operationName: string;
  /** Operation type */
  operationType: 'promise' | 'callback' | 'timer' | 'event' | 'custom';
  /** Parent operation ID */
  parentOperationId?: string;
  /** Additional attributes */
  attributes?: Record<string, string | number | boolean>;
  /** User ID for correlation */
  userId?: string;
  /** Room ID for correlation */
  roomId?: string;
  /** Component name */
  component?: string;
}

/**
 * Operation metadata
 */
export interface OperationMetadata {
  /** Operation ID */
  operationId: string;
  /** Operation name */
  operationName: string;
  /** Operation type */
  operationType: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime?: Date;
  /** Duration in milliseconds */
  duration?: number;
  /** Stack trace */
  stackTrace?: string;
  /** Memory usage at start */
  memoryUsageStart?: number;
  /** Memory usage at end */
  memoryUsageEnd?: number;
  /** Parent operation ID */
  parentOperationId?: string;
  /** Child operation IDs */
  childOperationIds: string[];
  /** Success status */
  success?: boolean;
  /** Error information */
  error?: string;
}

/**
 * Async trace data
 */
export interface AsyncTraceData {
  /** Operation metadata */
  operation: OperationMetadata;
  /** Trace context */
  traceContext?: TraceContext;
  /** Span information */
  span?: Span;
}

/**
 * Async tracer interface
 */
export interface IAsyncTracer {
  /** Trace async operation */
  traceAsyncOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    options?: Partial<AsyncOperationOptions>
  ): Promise<T>;
  
  /** Create async span */
  createAsyncSpan(metadata: OperationMetadata, options?: Partial<AsyncOperationOptions>): Span;
  
  /** Correlate async operations */
  correlateAsyncOperations(parentId: string, childId: string): void;
  
  /** Track async operation */
  trackAsyncOperation(operationId: string, metadata: OperationMetadata): void;
  
  /** Get operation metadata */
  getOperationMetadata(operationId: string): OperationMetadata | null;
}

// ============================================================================
// DEFAULT OPTIONS
// ============================================================================

export const DEFAULT_ASYNC_TRACING_OPTIONS: AsyncTracingOptions = {
  includeStackTrace: false,
  maxStackDepth: 10,
  includeTiming: true,
  includeMemoryUsage: false,
  correlationTimeout: 30000, // 30 seconds
};

// ============================================================================
// ASYNC TRACER IMPLEMENTATION
// ============================================================================

/**
 * Async tracer implementation
 */
export class AsyncTracer implements IAsyncTracer {
  private operations = new Map<string, OperationMetadata>();
  private correlations = new Map<string, string[]>(); // parent -> children

  constructor(private options: AsyncTracingOptions = DEFAULT_ASYNC_TRACING_OPTIONS) {}

  /**
   * Trace async operation
   */
  async traceAsyncOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    options: Partial<AsyncOperationOptions> = {}
  ): Promise<T> {
    const operationId = crypto.randomUUID();
    const startTime = new Date();
    
    // Create operation metadata
    const metadata: OperationMetadata = {
      operationId,
      operationName,
      operationType: options.operationType || 'promise',
      startTime,
      childOperationIds: [],
      parentOperationId: options.parentOperationId,
    };

    // Add stack trace if enabled
    if (this.options.includeStackTrace) {
      metadata.stackTrace = this.captureStackTrace();
    }

    // Add memory usage if enabled
    if (this.options.includeMemoryUsage) {
      metadata.memoryUsageStart = this.getMemoryUsage();
    }

    // Track operation
    this.trackAsyncOperation(operationId, metadata);

    // Correlate with parent if specified
    if (options.parentOperationId) {
      this.correlateAsyncOperations(options.parentOperationId, operationId);
    }

    // Get current trace context
    const traceContext = getCurrentTraceContext();
    if (traceContext) {
      correlateAsyncOperation(operationId, traceContext);
    }

    // Create span
    const span = this.createAsyncSpan(metadata, options);

    try {
      // Execute operation within span context
      const result = await startActiveSpan(
        operationName,
        async (activeSpan) => {
          // Add correlation attributes
          addCommonAttributes(activeSpan, {
            userId: options.userId,
            roomId: options.roomId,
            operation: operationName,
            component: options.component || 'async_operation',
          });

          // Add custom attributes
          if (options.attributes) {
            activeSpan.setAttributes(options.attributes);
          }

          // Add async operation attributes
          activeSpan.setAttributes({
            'async.operation_id': operationId,
            'async.operation_type': metadata.operationType,
            'async.parent_operation_id': metadata.parentOperationId || '',
          });

          return operation();
        },
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            'async.operation_id': operationId,
            'async.operation_type': metadata.operationType,
          },
        }
      );

      // Update metadata on success
      const endTime = new Date();
      metadata.endTime = endTime;
      metadata.duration = endTime.getTime() - startTime.getTime();
      metadata.success = true;

      if (this.options.includeMemoryUsage) {
        metadata.memoryUsageEnd = this.getMemoryUsage();
      }

      // Update span with timing information
      if (this.options.includeTiming) {
        span.setAttributes({
          'async.duration_ms': metadata.duration,
          'async.start_time': startTime.toISOString(),
          'async.end_time': endTime.toISOString(),
        });
      }

      span.setStatus({ code: SpanStatusCode.OK });

      return result;

    } catch (error) {
      // Update metadata on error
      const endTime = new Date();
      metadata.endTime = endTime;
      metadata.duration = endTime.getTime() - startTime.getTime();
      metadata.success = false;
      metadata.error = error instanceof Error ? error.message : String(error);

      if (this.options.includeMemoryUsage) {
        metadata.memoryUsageEnd = this.getMemoryUsage();
      }

      // Record exception in span
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });

      throw error;

    } finally {
      // Update operation metadata
      this.operations.set(operationId, metadata);
      
      // Clean up old operations
      this.cleanupOldOperations();
      
      span.end();
    }
  }

  /**
   * Create async span
   */
  createAsyncSpan(metadata: OperationMetadata, options: Partial<AsyncOperationOptions> = {}): Span {
    const span = createSpan(metadata.operationName, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'async.operation_id': metadata.operationId,
        'async.operation_type': metadata.operationType,
        'async.start_time': metadata.startTime.toISOString(),
        'async.parent_operation_id': metadata.parentOperationId || '',
        ...options.attributes,
      },
    });

    // Add stack trace if available
    if (metadata.stackTrace) {
      span.setAttribute('async.stack_trace', metadata.stackTrace);
    }

    // Add memory usage if available
    if (metadata.memoryUsageStart !== undefined) {
      span.setAttribute('async.memory_usage_start', metadata.memoryUsageStart);
    }

    return span;
  }

  /**
   * Correlate async operations
   */
  correlateAsyncOperations(parentId: string, childId: string): void {
    const children = this.correlations.get(parentId) || [];
    children.push(childId);
    this.correlations.set(parentId, children);

    // Update parent operation metadata
    const parentMetadata = this.operations.get(parentId);
    if (parentMetadata) {
      parentMetadata.childOperationIds.push(childId);
      this.operations.set(parentId, parentMetadata);
    }
  }

  /**
   * Track async operation
   */
  trackAsyncOperation(operationId: string, metadata: OperationMetadata): void {
    this.operations.set(operationId, metadata);
  }

  /**
   * Get operation metadata
   */
  getOperationMetadata(operationId: string): OperationMetadata | null {
    return this.operations.get(operationId) || null;
  }

  /**
   * Get all child operations
   */
  getChildOperations(parentId: string): OperationMetadata[] {
    const childIds = this.correlations.get(parentId) || [];
    return childIds
      .map(id => this.operations.get(id))
      .filter((metadata): metadata is OperationMetadata => metadata !== undefined);
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Capture stack trace
   */
  private captureStackTrace(): string {
    const stack = new Error().stack || '';
    const lines = stack.split('\n').slice(1, this.options.maxStackDepth + 1);
    return lines.join('\n');
  }

  /**
   * Get memory usage
   */
  private getMemoryUsage(): number {
    try {
      // In Deno, we can use Deno.memoryUsage()
      if (typeof Deno !== 'undefined' && Deno.memoryUsage) {
        return Deno.memoryUsage().heapUsed;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Clean up old operations
   */
  private cleanupOldOperations(): void {
    const cutoffTime = new Date(Date.now() - this.options.correlationTimeout);
    
    for (const [id, metadata] of this.operations.entries()) {
      if (metadata.startTime < cutoffTime) {
        this.operations.delete(id);
        this.correlations.delete(id);
      }
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global async tracer instance
 */
export const asyncTracer = new AsyncTracer();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Trace async operation
 */
export async function traceAsyncOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  options?: Partial<AsyncOperationOptions>
): Promise<T> {
  return asyncTracer.traceAsyncOperation(operationName, operation, options);
}

/**
 * Instrument async function with tracing
 */
export function instrumentAsyncFunction<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  operationName?: string,
  options?: Partial<AsyncOperationOptions>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const name = operationName || fn.name || 'async_function';
    return traceAsyncOperation(name, () => fn(...args), options);
  };
}

/**
 * Create async span
 */
export function createAsyncSpan(metadata: OperationMetadata, options?: Partial<AsyncOperationOptions>): Span {
  return asyncTracer.createAsyncSpan(metadata, options);
}

/**
 * Correlate async operations
 */
export function correlateAsyncOperations(parentId: string, childId: string): void {
  asyncTracer.correlateAsyncOperations(parentId, childId);
}

/**
 * Track async operation
 */
export function trackAsyncOperation(operationId: string, metadata: OperationMetadata): void {
  asyncTracer.trackAsyncOperation(operationId, metadata);
}

/**
 * Decorator for async tracing
 */
export function withAsyncTracing(
  operationName?: string,
  options?: Partial<AsyncOperationOptions>
) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return descriptor;

    const name = operationName || `${target.constructor.name}.${propertyKey}`;
    descriptor.value = instrumentAsyncFunction(originalMethod, name, options) as T;
    return descriptor;
  };
}

/**
 * Utility to trace Promise operations
 */
export function tracePromise<T>(
  promise: Promise<T>,
  operationName: string,
  options?: Partial<AsyncOperationOptions>
): Promise<T> {
  return traceAsyncOperation(operationName, () => promise, options);
}

/**
 * Utility to trace setTimeout operations
 */
export function traceTimeout(
  callback: () => void | Promise<void>,
  delay: number,
  operationName = 'timeout',
  options?: Partial<AsyncOperationOptions>
): number {
  const operationId = crypto.randomUUID();
  
  return setTimeout(async () => {
    await traceAsyncOperation(
      operationName,
      async () => {
        await callback();
      },
      {
        ...options,
        operationType: 'timer',
        attributes: {
          'timer.delay_ms': delay,
          'timer.operation_id': operationId,
          ...options?.attributes,
        },
      }
    );
  }, delay);
}

/**
 * Utility to trace setInterval operations
 */
export function traceInterval(
  callback: () => void | Promise<void>,
  interval: number,
  operationName = 'interval',
  options?: Partial<AsyncOperationOptions>
): number {
  const operationId = crypto.randomUUID();
  let executionCount = 0;
  
  return setInterval(async () => {
    executionCount++;
    await traceAsyncOperation(
      `${operationName}_${executionCount}`,
      async () => {
        await callback();
      },
      {
        ...options,
        operationType: 'timer',
        attributes: {
          'timer.interval_ms': interval,
          'timer.operation_id': operationId,
          'timer.execution_count': executionCount,
          ...options?.attributes,
        },
      }
    );
  }, interval);
}