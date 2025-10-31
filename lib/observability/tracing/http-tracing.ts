/**
 * HTTP Tracing - Utilities for tracing HTTP requests and responses
 * 
 * This module provides:
 * - HTTP request/response span creation
 * - Request metadata extraction
 * - Response correlation
 * - HTTP-specific tracing utilities
 */

import { SpanKind, SpanStatusCode } from "npm:@opentelemetry/api@1.7.0";
import type { Span } from "npm:@opentelemetry/api@1.7.0";
import { startActiveSpan, createSpan, addCommonAttributes } from "../observability-service.ts";
import { 
  extractTraceContext, 
  injectTraceContext, 
  propagateTraceContext,
  type TraceContext 
} from "./trace-context.ts";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * HTTP tracing options
 */
export interface HTTPTracingOptions {
  /** Include request body in spans */
  includeRequestBody: boolean;
  /** Include response body in spans */
  includeResponseBody: boolean;
  /** Maximum body size to include */
  maxBodySize: number;
  /** Include request headers */
  includeRequestHeaders: boolean;
  /** Include response headers */
  includeResponseHeaders: boolean;
  /** Headers to exclude from tracing */
  excludeHeaders: string[];
  /** Sensitive headers to redact */
  sensitiveHeaders: string[];
  /** Include query parameters */
  includeQueryParams: boolean;
  /** Sensitive query parameters to redact */
  sensitiveQueryParams: string[];
}

/**
 * Request span options
 */
export interface RequestSpanOptions {
  /** Span name override */
  spanName?: string;
  /** Additional attributes */
  attributes?: Record<string, string | number | boolean>;
  /** Extract trace context from headers */
  extractContext?: boolean;
  /** User ID for correlation */
  userId?: string;
  /** Room ID for correlation */
  roomId?: string;
  /** Operation name */
  operation?: string;
}

/**
 * Response span options
 */
export interface ResponseSpanOptions {
  /** Include response timing */
  includeTiming: boolean;
  /** Include response size */
  includeSize: boolean;
  /** Additional attributes */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Request metadata
 */
export interface RequestMetadata {
  /** HTTP method */
  method: string;
  /** Request URL */
  url: string;
  /** Request path */
  path: string;
  /** Query parameters */
  queryParams: Record<string, string>;
  /** Request headers */
  headers: Record<string, string>;
  /** Content type */
  contentType?: string;
  /** Content length */
  contentLength?: number;
  /** User agent */
  userAgent?: string;
  /** Client IP */
  clientIP?: string;
  /** Request body (if included) */
  body?: string;
}

/**
 * Response metadata
 */
export interface ResponseMetadata {
  /** HTTP status code */
  statusCode: number;
  /** Status text */
  statusText: string;
  /** Response headers */
  headers: Record<string, string>;
  /** Content type */
  contentType?: string;
  /** Content length */
  contentLength?: number;
  /** Response body (if included) */
  body?: string;
  /** Response time in milliseconds */
  responseTime?: number;
}

/**
 * HTTP trace data
 */
export interface HTTPTraceData {
  /** Request metadata */
  request: RequestMetadata;
  /** Response metadata */
  response?: ResponseMetadata;
  /** Trace context */
  traceContext?: TraceContext;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime?: Date;
  /** Duration in milliseconds */
  duration?: number;
}

/**
 * HTTP tracer interface
 */
export interface IHTTPTracer {
  /** Trace HTTP request */
  traceRequest(req: Request, options?: RequestSpanOptions): Promise<{ span: Span; metadata: RequestMetadata }>;
  
  /** Trace HTTP response */
  traceResponse(span: Span, response: Response, options?: ResponseSpanOptions): Promise<ResponseMetadata>;
  
  /** Create request span */
  createRequestSpan(metadata: RequestMetadata, options?: RequestSpanOptions): Span;
  
  /** Create response span */
  createResponseSpan(metadata: ResponseMetadata, options?: ResponseSpanOptions): Span;
  
  /** Extract request metadata */
  extractRequestMetadata(req: Request): Promise<RequestMetadata>;
  
  /** Extract response metadata */
  extractResponseMetadata(response: Response): Promise<ResponseMetadata>;
}

// ============================================================================
// DEFAULT OPTIONS
// ============================================================================

export const DEFAULT_HTTP_TRACING_OPTIONS: HTTPTracingOptions = {
  includeRequestBody: false,
  includeResponseBody: false,
  maxBodySize: 1024,
  includeRequestHeaders: true,
  includeResponseHeaders: true,
  excludeHeaders: ['authorization', 'cookie', 'set-cookie'],
  sensitiveHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
  includeQueryParams: true,
  sensitiveQueryParams: ['token', 'key', 'secret', 'password'],
};

// ============================================================================
// HTTP TRACER IMPLEMENTATION
// ============================================================================

/**
 * HTTP tracer implementation
 */
export class HTTPTracer implements IHTTPTracer {
  constructor(private options: HTTPTracingOptions = DEFAULT_HTTP_TRACING_OPTIONS) {}

  /**
   * Trace HTTP request
   */
  async traceRequest(req: Request, options: RequestSpanOptions = {}): Promise<{ span: Span; metadata: RequestMetadata }> {
    // Extract request metadata
    const metadata = await this.extractRequestMetadata(req);
    
    // Extract trace context if requested
    let traceContext: TraceContext | null = null;
    if (options.extractContext !== false) {
      traceContext = extractTraceContext(req.headers);
    }
    
    // Create span
    const span = this.createRequestSpan(metadata, options);
    
    // Add trace context correlation
    if (traceContext) {
      span.setAttributes({
        'trace.parent_id': traceContext.parentSpanId || '',
        'trace.flags': traceContext.traceFlags.toString(),
      });
    }
    
    return { span, metadata };
  }

  /**
   * Trace HTTP response
   */
  async traceResponse(span: Span, response: Response, options: ResponseSpanOptions = { includeTiming: true, includeSize: true }): Promise<ResponseMetadata> {
    const metadata = await this.extractResponseMetadata(response);
    
    // Add response attributes to span
    this.addResponseAttributes(span, metadata, options);
    
    // Set span status based on response
    this.setSpanStatusFromResponse(span, metadata);
    
    return metadata;
  }

  /**
   * Create request span
   */
  createRequestSpan(metadata: RequestMetadata, options: RequestSpanOptions = {}): Span {
    const spanName = options.spanName || `${metadata.method} ${metadata.path}`;
    
    const span = createSpan(spanName, {
      kind: SpanKind.SERVER,
      attributes: {
        // HTTP semantic conventions
        'http.method': metadata.method,
        'http.url': metadata.url,
        'http.route': metadata.path,
        'http.scheme': new URL(metadata.url).protocol.slice(0, -1),
        'http.host': new URL(metadata.url).host,
        'http.target': metadata.path + (Object.keys(metadata.queryParams).length > 0 ? '?' + new URLSearchParams(metadata.queryParams).toString() : ''),
        'http.user_agent': metadata.userAgent || '',
        'http.request_content_length': metadata.contentLength || 0,
        'http.flavor': '1.1',
        
        // Network attributes
        'net.peer.ip': metadata.clientIP || '',
        
        // Custom attributes
        ...options.attributes,
      },
    });

    // Add common attributes
    addCommonAttributes(span, {
      userId: options.userId,
      roomId: options.roomId,
      operation: options.operation || `http_${metadata.method.toLowerCase()}`,
      component: 'http_server',
    });

    // Add query parameters if enabled
    if (this.options.includeQueryParams && Object.keys(metadata.queryParams).length > 0) {
      Object.entries(metadata.queryParams).forEach(([key, value]) => {
        if (!this.options.sensitiveQueryParams.includes(key.toLowerCase())) {
          span.setAttribute(`http.query.${key}`, value);
        } else {
          span.setAttribute(`http.query.${key}`, '[REDACTED]');
        }
      });
    }

    // Add request headers if enabled
    if (this.options.includeRequestHeaders) {
      Object.entries(metadata.headers).forEach(([key, value]) => {
        const headerKey = key.toLowerCase();
        if (!this.options.excludeHeaders.includes(headerKey)) {
          const attributeKey = `http.request.header.${headerKey}`;
          if (this.options.sensitiveHeaders.includes(headerKey)) {
            span.setAttribute(attributeKey, '[REDACTED]');
          } else {
            span.setAttribute(attributeKey, value);
          }
        }
      });
    }

    // Add request body if enabled and available
    if (this.options.includeRequestBody && metadata.body) {
      const body = metadata.body.length > this.options.maxBodySize 
        ? metadata.body.substring(0, this.options.maxBodySize) + '...[TRUNCATED]'
        : metadata.body;
      span.setAttribute('http.request.body', body);
    }

    return span;
  }

  /**
   * Create response span
   */
  createResponseSpan(metadata: ResponseMetadata, options: ResponseSpanOptions = { includeTiming: true, includeSize: true }): Span {
    const spanName = `HTTP ${metadata.statusCode}`;
    
    const span = createSpan(spanName, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'http.status_code': metadata.statusCode,
        'http.status_text': metadata.statusText,
        'http.response_content_length': metadata.contentLength || 0,
        ...options.attributes,
      },
    });

    this.addResponseAttributes(span, metadata, options);
    this.setSpanStatusFromResponse(span, metadata);

    return span;
  }

  /**
   * Extract request metadata
   */
  async extractRequestMetadata(req: Request): Promise<RequestMetadata> {
    const url = new URL(req.url);
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body: string | undefined;
    if (this.options.includeRequestBody && req.body) {
      try {
        // Clone request to avoid consuming the body
        const clonedReq = req.clone();
        const text = await clonedReq.text();
        body = text.length > this.options.maxBodySize 
          ? text.substring(0, this.options.maxBodySize) + '...[TRUNCATED]'
          : text;
      } catch (error) {
        console.warn('Failed to read request body for tracing:', error);
      }
    }

    return {
      method: req.method,
      url: req.url,
      path: url.pathname,
      queryParams,
      headers,
      contentType: req.headers.get('content-type') || undefined,
      contentLength: req.headers.get('content-length') ? parseInt(req.headers.get('content-length')!) : undefined,
      userAgent: req.headers.get('user-agent') || undefined,
      clientIP: this.extractClientIP(req),
      body,
    };
  }

  /**
   * Extract response metadata
   */
  async extractResponseMetadata(response: Response): Promise<ResponseMetadata> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body: string | undefined;
    if (this.options.includeResponseBody) {
      try {
        // Clone response to avoid consuming the body
        const clonedResponse = response.clone();
        const text = await clonedResponse.text();
        body = text.length > this.options.maxBodySize 
          ? text.substring(0, this.options.maxBodySize) + '...[TRUNCATED]'
          : text;
      } catch (error) {
        console.warn('Failed to read response body for tracing:', error);
      }
    }

    return {
      statusCode: response.status,
      statusText: response.statusText,
      headers,
      contentType: response.headers.get('content-type') || undefined,
      contentLength: response.headers.get('content-length') ? parseInt(response.headers.get('content-length')!) : undefined,
      body,
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Add response attributes to span
   */
  private addResponseAttributes(span: Span, metadata: ResponseMetadata, options: ResponseSpanOptions): void {
    span.setAttributes({
      'http.status_code': metadata.statusCode,
      'http.status_text': metadata.statusText,
    });

    if (options.includeSize && metadata.contentLength) {
      span.setAttribute('http.response_content_length', metadata.contentLength);
    }

    if (options.includeTiming && metadata.responseTime) {
      span.setAttribute('http.response_time_ms', metadata.responseTime);
    }

    // Add response headers if enabled
    if (this.options.includeResponseHeaders) {
      Object.entries(metadata.headers).forEach(([key, value]) => {
        const headerKey = key.toLowerCase();
        if (!this.options.excludeHeaders.includes(headerKey)) {
          const attributeKey = `http.response.header.${headerKey}`;
          if (this.options.sensitiveHeaders.includes(headerKey)) {
            span.setAttribute(attributeKey, '[REDACTED]');
          } else {
            span.setAttribute(attributeKey, value);
          }
        }
      });
    }

    // Add response body if enabled and available
    if (this.options.includeResponseBody && metadata.body) {
      span.setAttribute('http.response.body', metadata.body);
    }
  }

  /**
   * Set span status based on response
   */
  private setSpanStatusFromResponse(span: Span, metadata: ResponseMetadata): void {
    if (metadata.statusCode >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${metadata.statusCode}: ${metadata.statusText}`,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
  }

  /**
   * Extract client IP from request
   */
  private extractClientIP(req: Request): string | undefined {
    // Check for forwarded headers first (for reverse proxies)
    const forwarded = req.headers.get("X-Forwarded-For");
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    const realIP = req.headers.get("X-Real-IP");
    if (realIP) {
      return realIP;
    }

    const cfConnectingIP = req.headers.get("CF-Connecting-IP");
    if (cfConnectingIP) {
      return cfConnectingIP;
    }

    return undefined;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global HTTP tracer instance
 */
export const httpTracer = new HTTPTracer();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Trace HTTP request
 */
export async function traceHTTPRequest(req: Request, options?: RequestSpanOptions): Promise<{ span: Span; metadata: RequestMetadata }> {
  return httpTracer.traceRequest(req, options);
}

/**
 * Trace HTTP response
 */
export async function traceHTTPResponse(span: Span, response: Response, options?: ResponseSpanOptions): Promise<ResponseMetadata> {
  return httpTracer.traceResponse(span, response, options);
}

/**
 * Instrument HTTP handler with tracing
 */
export function instrumentHTTPHandler<T extends any[]>(
  handler: (req: Request, ...args: T) => Promise<Response> | Response,
  options?: RequestSpanOptions
) {
  return async (req: Request, ...args: T): Promise<Response> => {
    const startTime = Date.now();
    
    try {
      // Start request tracing
      const { span, metadata } = await traceHTTPRequest(req, options);
      
      try {
        // Execute handler
        const response = await handler(req, ...args);
        
        // Trace response
        const responseMetadata = await traceHTTPResponse(span, response, {
          includeTiming: true,
          includeSize: true,
        });
        
        // Add timing information
        responseMetadata.responseTime = Date.now() - startTime;
        span.setAttribute('http.response_time_ms', responseMetadata.responseTime);
        
        // Propagate trace context in response headers
        const responseHeaders = new Headers(response.headers);
        const traceContext = extractTraceContext(req.headers);
        if (traceContext) {
          injectTraceContext(traceContext, responseHeaders);
        }
        
        // Return response with trace headers
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
        
      } catch (error) {
        // Record exception in span
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        
        throw error;
      } finally {
        span.end();
      }
    } catch (error) {
      console.error('HTTP tracing error:', error);
      // Execute handler without tracing on error
      return handler(req, ...args);
    }
  };
}

/**
 * Create request span
 */
export function createRequestSpan(metadata: RequestMetadata, options?: RequestSpanOptions): Span {
  return httpTracer.createRequestSpan(metadata, options);
}

/**
 * Create response span
 */
export function createResponseSpan(metadata: ResponseMetadata, options?: ResponseSpanOptions): Span {
  return httpTracer.createResponseSpan(metadata, options);
}

/**
 * Extract request metadata
 */
export async function extractRequestMetadata(req: Request): Promise<RequestMetadata> {
  return httpTracer.extractRequestMetadata(req);
}

/**
 * Extract response metadata
 */
export async function extractResponseMetadata(response: Response): Promise<ResponseMetadata> {
  return httpTracer.extractResponseMetadata(response);
}

/**
 * Add HTTP attributes to span
 */
export function addHTTPAttributes(span: Span, req: Request, response?: Response): void {
  const url = new URL(req.url);
  
  span.setAttributes({
    'http.method': req.method,
    'http.url': req.url,
    'http.route': url.pathname,
    'http.scheme': url.protocol.slice(0, -1),
    'http.host': url.host,
    'http.target': url.pathname + url.search,
    'http.user_agent': req.headers.get('user-agent') || '',
  });

  if (response) {
    span.setAttributes({
      'http.status_code': response.status,
      'http.status_text': response.statusText,
    });
  }
}

/**
 * Decorator for HTTP tracing
 */
export function withHTTPTracing(options?: RequestSpanOptions) {
  return function <T extends (...args: any[]) => Promise<Response> | Response>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value;
    if (!originalMethod) return descriptor;

    descriptor.value = instrumentHTTPHandler(originalMethod, options) as T;
    return descriptor;
  };
}