/**
 * Trace Context Management - Handles trace context propagation across service boundaries
 * 
 * This module provides utilities for:
 * - Extracting and injecting trace context from/to HTTP headers
 * - Managing trace context in async operations
 * - Correlating traces across service boundaries
 * - Context propagation utilities
 */

import { 
  trace, 
  context, 
  propagation, 
  SpanContext as OtelSpanContext,
  Context as OtelContext 
} from "npm:@opentelemetry/api@1.7.0";
import type { Span } from "npm:@opentelemetry/api@1.7.0";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Trace context information
 */
export interface TraceContext {
  /** Trace ID */
  traceId: string;
  /** Span ID */
  spanId: string;
  /** Parent span ID if available */
  parentSpanId?: string;
  /** Trace flags */
  traceFlags: number;
  /** Baggage data */
  baggage?: Record<string, string>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Span context information
 */
export interface SpanContext {
  /** Current span */
  span: Span;
  /** Trace context */
  traceContext: TraceContext;
  /** OpenTelemetry context */
  otelContext: OtelContext;
}

/**
 * Trace headers for HTTP propagation
 */
export interface TraceHeaders {
  /** Trace parent header (W3C format) */
  traceparent?: string;
  /** Trace state header */
  tracestate?: string;
  /** Baggage header */
  baggage?: string;
  /** Custom correlation headers */
  [key: string]: string | undefined;
}

/**
 * Trace propagation options
 */
export interface TracePropagationOptions {
  /** Include baggage in propagation */
  includeBaggage: boolean;
  /** Custom header names */
  customHeaders?: Record<string, string>;
  /** Propagation format */
  format: 'w3c' | 'b3' | 'jaeger' | 'custom';
  /** Maximum header size */
  maxHeaderSize: number;
}

/**
 * Request tracing options
 */
export interface RequestTracingOptions {
  /** Extract trace context from headers */
  extractContext: boolean;
  /** Inject trace context into headers */
  injectContext: boolean;
  /** Propagation options */
  propagation: TracePropagationOptions;
  /** Additional correlation data */
  correlationData?: Record<string, string>;
}

/**
 * Async operation context
 */
export interface AsyncOperationContext {
  /** Operation ID */
  operationId: string;
  /** Parent trace context */
  parentContext: TraceContext;
  /** Operation metadata */
  metadata: Record<string, unknown>;
  /** Start time */
  startTime: Date;
}

/**
 * Trace correlation data
 */
export interface TraceCorrelationData {
  /** User ID */
  userId?: string;
  /** Room ID */
  roomId?: string;
  /** Session ID */
  sessionId?: string;
  /** Request ID */
  requestId?: string;
  /** Operation name */
  operation?: string;
  /** Component name */
  component?: string;
  /** Additional correlation fields */
  [key: string]: string | undefined;
}

/**
 * Trace context manager interface
 */
export interface ITraceContextManager {
  /** Extract trace context from headers */
  extractFromHeaders(headers: Headers): TraceContext | null;
  
  /** Inject trace context into headers */
  injectIntoHeaders(context: TraceContext, headers: Headers): void;
  
  /** Create trace headers from context */
  createHeaders(context: TraceContext): TraceHeaders;
  
  /** Parse trace headers */
  parseHeaders(headers: TraceHeaders): TraceContext | null;
  
  /** Get current trace context */
  getCurrentContext(): TraceContext | null;
  
  /** Set trace context */
  setContext(context: TraceContext): void;
  
  /** Clear trace context */
  clearContext(): void;
  
  /** Create child context */
  createChildContext(parentContext: TraceContext, spanId: string): TraceContext;
  
  /** Correlate async operation */
  correlateAsyncOperation(operationId: string, context: TraceContext): void;
}

// ============================================================================
// DEFAULT OPTIONS
// ============================================================================

export const DEFAULT_TRACE_PROPAGATION_OPTIONS: TracePropagationOptions = {
  includeBaggage: true,
  format: 'w3c',
  maxHeaderSize: 8192,
};

// ============================================================================
// TRACE CONTEXT MANAGER IMPLEMENTATION
// ============================================================================

/**
 * Trace context manager implementation
 */
export class TraceContextManager implements ITraceContextManager {
  private currentContext: TraceContext | null = null;
  private asyncOperations = new Map<string, AsyncOperationContext>();

  /**
   * Extract trace context from HTTP headers
   */
  extractFromHeaders(headers: Headers): TraceContext | null {
    try {
      // Create a carrier object from headers
      const carrier: Record<string, string> = {};
      headers.forEach((value, key) => {
        carrier[key.toLowerCase()] = value;
      });

      // Extract context using OpenTelemetry propagation
      const extractedContext = propagation.extract(context.active(), carrier);
      const spanContext = trace.getSpanContext(extractedContext);

      if (!spanContext || !spanContext.traceId || !spanContext.spanId) {
        return null;
      }

      // Extract baggage if available
      const baggage: Record<string, string> = {};
      const baggageHeader = headers.get('baggage');
      if (baggageHeader) {
        this.parseBaggageHeader(baggageHeader, baggage);
      }

      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        traceFlags: spanContext.traceFlags || 0,
        baggage: Object.keys(baggage).length > 0 ? baggage : undefined,
      };
    } catch (error) {
      console.error('Failed to extract trace context from headers:', error);
      return null;
    }
  }

  /**
   * Inject trace context into HTTP headers
   */
  injectIntoHeaders(traceContext: TraceContext, headers: Headers): void {
    try {
      // Get current active context or create one
      const activeContext = context.active();
      const span = trace.getActiveSpan(activeContext);

      if (span) {
        // Create a carrier object
        const carrier: Record<string, string> = {};
        
        // Inject context using OpenTelemetry propagation
        propagation.inject(activeContext, carrier);
        
        // Set headers from carrier
        Object.entries(carrier).forEach(([key, value]) => {
          headers.set(key, value);
        });
      } else {
        // Manually create headers if no active span
        const traceparent = this.createTraceparentHeader(traceContext);
        headers.set('traceparent', traceparent);
      }

      // Add baggage if available
      if (traceContext.baggage) {
        const baggageHeader = this.createBaggageHeader(traceContext.baggage);
        headers.set('baggage', baggageHeader);
      }
    } catch (error) {
      console.error('Failed to inject trace context into headers:', error);
    }
  }

  /**
   * Create trace headers from context
   */
  createHeaders(traceContext: TraceContext): TraceHeaders {
    const headers: TraceHeaders = {};

    try {
      // Create traceparent header
      headers.traceparent = this.createTraceparentHeader(traceContext);

      // Add baggage if available
      if (traceContext.baggage) {
        headers.baggage = this.createBaggageHeader(traceContext.baggage);
      }
    } catch (error) {
      console.error('Failed to create trace headers:', error);
    }

    return headers;
  }

  /**
   * Parse trace headers
   */
  parseHeaders(headers: TraceHeaders): TraceContext | null {
    try {
      if (!headers.traceparent) {
        return null;
      }

      const traceContext = this.parseTraceparentHeader(headers.traceparent);
      if (!traceContext) {
        return null;
      }

      // Parse baggage if available
      if (headers.baggage) {
        const baggage: Record<string, string> = {};
        this.parseBaggageHeader(headers.baggage, baggage);
        traceContext.baggage = Object.keys(baggage).length > 0 ? baggage : undefined;
      }

      return traceContext;
    } catch (error) {
      console.error('Failed to parse trace headers:', error);
      return null;
    }
  }

  /**
   * Get current trace context
   */
  getCurrentContext(): TraceContext | null {
    // Try to get from active span first
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        traceFlags: spanContext.traceFlags || 0,
      };
    }

    // Fallback to stored context
    return this.currentContext;
  }

  /**
   * Set trace context
   */
  setContext(traceContext: TraceContext): void {
    this.currentContext = traceContext;
  }

  /**
   * Clear trace context
   */
  clearContext(): void {
    this.currentContext = null;
  }

  /**
   * Create child context
   */
  createChildContext(parentContext: TraceContext, spanId: string): TraceContext {
    return {
      traceId: parentContext.traceId,
      spanId,
      parentSpanId: parentContext.spanId,
      traceFlags: parentContext.traceFlags,
      baggage: parentContext.baggage,
      metadata: parentContext.metadata,
    };
  }

  /**
   * Correlate async operation
   */
  correlateAsyncOperation(operationId: string, traceContext: TraceContext): void {
    const operationContext: AsyncOperationContext = {
      operationId,
      parentContext: traceContext,
      metadata: {},
      startTime: new Date(),
    };

    this.asyncOperations.set(operationId, operationContext);

    // Clean up old operations (older than 1 hour)
    const cutoffTime = new Date(Date.now() - 60 * 60 * 1000);
    for (const [id, ctx] of this.asyncOperations.entries()) {
      if (ctx.startTime < cutoffTime) {
        this.asyncOperations.delete(id);
      }
    }
  }

  /**
   * Get async operation context
   */
  getAsyncOperationContext(operationId: string): AsyncOperationContext | null {
    return this.asyncOperations.get(operationId) || null;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Create traceparent header (W3C format)
   */
  private createTraceparentHeader(traceContext: TraceContext): string {
    const version = '00';
    const traceId = traceContext.traceId.padStart(32, '0');
    const spanId = traceContext.spanId.padStart(16, '0');
    const flags = traceContext.traceFlags.toString(16).padStart(2, '0');
    
    return `${version}-${traceId}-${spanId}-${flags}`;
  }

  /**
   * Parse traceparent header
   */
  private parseTraceparentHeader(traceparent: string): TraceContext | null {
    const parts = traceparent.split('-');
    if (parts.length !== 4) {
      return null;
    }

    const [version, traceId, spanId, flags] = parts;
    
    // Validate format
    if (version !== '00' || traceId.length !== 32 || spanId.length !== 16 || flags.length !== 2) {
      return null;
    }

    return {
      traceId,
      spanId,
      traceFlags: parseInt(flags, 16),
    };
  }

  /**
   * Create baggage header
   */
  private createBaggageHeader(baggage: Record<string, string>): string {
    return Object.entries(baggage)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join(',');
  }

  /**
   * Parse baggage header
   */
  private parseBaggageHeader(baggageHeader: string, baggage: Record<string, string>): void {
    const items = baggageHeader.split(',');
    for (const item of items) {
      const [key, value] = item.split('=');
      if (key && value) {
        baggage[decodeURIComponent(key.trim())] = decodeURIComponent(value.trim());
      }
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global trace context manager instance
 */
export const traceContextManager = new TraceContextManager();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Propagate trace context across service boundaries
 */
export function propagateTraceContext(
  sourceHeaders: Headers,
  targetHeaders: Headers,
  options: Partial<TracePropagationOptions> = {}
): void {
  const opts = { ...DEFAULT_TRACE_PROPAGATION_OPTIONS, ...options };
  
  const traceContext = traceContextManager.extractFromHeaders(sourceHeaders);
  if (traceContext) {
    traceContextManager.injectIntoHeaders(traceContext, targetHeaders);
  }
}

/**
 * Extract trace context from headers
 */
export function extractTraceContext(headers: Headers): TraceContext | null {
  return traceContextManager.extractFromHeaders(headers);
}

/**
 * Inject trace context into headers
 */
export function injectTraceContext(traceContext: TraceContext, headers: Headers): void {
  traceContextManager.injectIntoHeaders(traceContext, headers);
}

/**
 * Create trace headers from context
 */
export function createTraceHeaders(traceContext: TraceContext): TraceHeaders {
  return traceContextManager.createHeaders(traceContext);
}

/**
 * Parse trace headers
 */
export function parseTraceHeaders(headers: TraceHeaders): TraceContext | null {
  return traceContextManager.parseHeaders(headers);
}

/**
 * Correlate async operation with trace context
 */
export function correlateAsyncOperation(operationId: string, traceContext?: TraceContext): void {
  const context = traceContext || traceContextManager.getCurrentContext();
  if (context) {
    traceContextManager.correlateAsyncOperation(operationId, context);
  }
}

/**
 * Execute function with trace context
 */
export function withTraceContext<T>(
  traceContext: TraceContext,
  fn: () => T
): T {
  const previousContext = traceContextManager.getCurrentContext();
  
  try {
    traceContextManager.setContext(traceContext);
    return fn();
  } finally {
    if (previousContext) {
      traceContextManager.setContext(previousContext);
    } else {
      traceContextManager.clearContext();
    }
  }
}

/**
 * Get current trace context
 */
export function getCurrentTraceContext(): TraceContext | null {
  return traceContextManager.getCurrentContext();
}

/**
 * Set trace context
 */
export function setTraceContext(traceContext: TraceContext): void {
  traceContextManager.setContext(traceContext);
}

/**
 * Clear trace context
 */
export function clearTraceContext(): void {
  traceContextManager.clearContext();
}

/**
 * Create child context
 */
export function createChildContext(parentContext: TraceContext, spanId: string): TraceContext {
  return traceContextManager.createChildContext(parentContext, spanId);
}