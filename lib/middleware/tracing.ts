/**
 * Tracing Middleware - HTTP request tracing and context propagation
 * 
 * This middleware provides:
 * - Automatic HTTP request/response tracing
 * - Trace context propagation across service boundaries
 * - Request correlation and metadata extraction
 * - Integration with existing auth and rate limiting middleware
 */

import { SpanKind, SpanStatusCode } from "npm:@opentelemetry/api@1.7.0";
import type { Span } from "npm:@opentelemetry/api@1.7.0";
import { startActiveSpan, addCommonAttributes } from "../observability/observability-service.ts";
import { 
  extractTraceContext, 
  injectTraceContext, 
  propagateTraceContext,
  type TraceContext 
} from "../observability/tracing/trace-context.ts";
import { 
  traceHTTPRequest, 
  traceHTTPResponse,
  type RequestSpanOptions,
  type ResponseSpanOptions 
} from "../observability/tracing/http-tracing.ts";
import { AuthenticatedUser, authenticateRequest } from "./auth.ts";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Tracing middleware options
 */
export interface TracingMiddlewareOptions {
  /** Enable request tracing */
  enableRequestTracing: boolean;
  /** Enable response tracing */
  enableResponseTracing: boolean;
  /** Include request body in traces */
  includeRequestBody: boolean;
  /** Include response body in traces */
  includeResponseBody: boolean;
  /** Maximum body size to include */
  maxBodySize: number;
  /** Skip tracing for specific paths */
  skipPaths: string[];
  /** Skip tracing for specific methods */
  skipMethods: string[];
  /** Custom span name generator */
  spanNameGenerator?: (req: Request) => string;
  /** Custom attributes extractor */
  attributesExtractor?: (req: Request, user?: AuthenticatedUser) => Record<string, string | number | boolean>;
}

/**
 * Request tracing context
 */
export interface RequestTracingContext {
  /** Request span */
  span: Span;
  /** Trace context */
  traceContext?: TraceContext;
  /** Authenticated user */
  user?: AuthenticatedUser;
  /** Request start time */
  startTime: Date;
  /** Request ID */
  requestId: string;
}

// ============================================================================
// DEFAULT OPTIONS
// ============================================================================

export const DEFAULT_TRACING_MIDDLEWARE_OPTIONS: TracingMiddlewareOptions = {
  enableRequestTracing: true,
  enableResponseTracing: true,
  includeRequestBody: false,
  includeResponseBody: false,
  maxBodySize: 1024,
  skipPaths: ['/health', '/metrics', '/favicon.ico'],
  skipMethods: ['OPTIONS'],
};

// ============================================================================
// TRACING MIDDLEWARE
// ============================================================================

/**
 * HTTP tracing middleware
 */
export function withTracing(
  handler: (req: Request, ctx?: any) => Promise<Response> | Response,
  options: Partial<TracingMiddlewareOptions> = {}
) {
  const opts = { ...DEFAULT_TRACING_MIDDLEWARE_OPTIONS, ...options };

  return async (req: Request, ctx?: any): Promise<Response> => {
    // Check if tracing should be skipped
    if (shouldSkipTracing(req, opts)) {
      return handler(req, ctx);
    }

    const requestId = crypto.randomUUID();
    const startTime = new Date();

    try {
      // Extract trace context from request headers
      const traceContext = extractTraceContext(req.headers);
      
      // Authenticate user for correlation
      const user = await authenticateRequest(req);
      
      // Create request tracing context
      const tracingContext: RequestTracingContext = {
        span: null as any, // Will be set below
        traceContext,
        user,
        startTime,
        requestId,
      };

      // Start request tracing
      const { span, metadata } = await traceHTTPRequest(req, {
        spanName: opts.spanNameGenerator?.(req),
        extractContext: true,
        userId: user?.id,
        roomId: extractRoomId(req),
        operation: `http_${req.method.toLowerCase()}`,
        attributes: {
          'request.id': requestId,
          'request.authenticated': user ? 'true' : 'false',
          'request.user_role': user?.role || 'anonymous',
          ...opts.attributesExtractor?.(req, user),
        },
      });

      tracingContext.span = span;

      // Add request to context for downstream handlers
      if (ctx) {
        ctx.tracing = tracingContext;
      }

      try {
        // Execute handler within span context
        const response = await startActiveSpan(
          opts.spanNameGenerator?.(req) || `${req.method} ${new URL(req.url).pathname}`,
          async (activeSpan) => {
            // Add common attributes
            addCommonAttributes(activeSpan, {
              userId: user?.id,
              roomId: extractRoomId(req),
              operation: `http_${req.method.toLowerCase()}`,
              component: 'http_middleware',
            });

            // Add request correlation attributes
            activeSpan.setAttributes({
              'http.request_id': requestId,
              'http.trace_id': traceContext?.traceId || '',
              'http.span_id': traceContext?.spanId || '',
              'http.user_id': user?.id || '',
              'http.user_role': user?.role || 'anonymous',
            });

            return handler(req, ctx);
          },
          {
            kind: SpanKind.SERVER,
            attributes: {
              'request.id': requestId,
              'request.method': req.method,
              'request.url': req.url,
            },
          }
        );

        // Trace response
        if (opts.enableResponseTracing) {
          const responseMetadata = await traceHTTPResponse(span, response, {
            includeTiming: true,
            includeSize: true,
          });

          // Add response timing
          const duration = Date.now() - startTime.getTime();
          span.setAttributes({
            'http.response_time_ms': duration,
            'http.request_duration_ms': duration,
          });
        }

        // Propagate trace context in response headers
        const responseHeaders = new Headers(response.headers);
        
        // Add request ID header
        responseHeaders.set('X-Request-ID', requestId);
        
        // Inject trace context if available
        if (traceContext) {
          injectTraceContext(traceContext, responseHeaders);
        }

        // Add trace correlation headers
        if (span.spanContext().traceId) {
          responseHeaders.set('X-Trace-ID', span.spanContext().traceId);
        }

        // Set span status based on response
        if (response.status >= 400) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `HTTP ${response.status}: ${response.statusText}`,
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

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

        // Add error attributes
        span.setAttributes({
          'error.type': error instanceof Error ? error.constructor.name : 'unknown',
          'error.message': error instanceof Error ? error.message : String(error),
          'error.stack': error instanceof Error ? error.stack || '' : '',
        });

        throw error;

      } finally {
        span.end();
      }

    } catch (error) {
      console.error('Tracing middleware error:', error);
      
      // Execute handler without tracing on error
      const response = await handler(req, ctx);
      
      // Still add request ID header for correlation
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('X-Request-ID', requestId);
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }
  };
}

/**
 * Authenticated tracing middleware
 */
export function withAuthenticatedTracing(
  handler: (req: Request, user: AuthenticatedUser, ctx?: any) => Promise<Response> | Response,
  options: Partial<TracingMiddlewareOptions> = {}
) {
  return withTracing(async (req: Request, ctx?: any) => {
    const user = await authenticateRequest(req);
    
    if (!user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Authentication required",
          code: "AUTHENTICATION_REQUIRED"
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return handler(req, user, ctx);
  }, options);
}

/**
 * Role-based tracing middleware
 */
export function withRoleBasedTracing(
  roles: string | string[],
  handler: (req: Request, user: AuthenticatedUser, ctx?: any) => Promise<Response> | Response,
  options: Partial<TracingMiddlewareOptions> = {}
) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return withAuthenticatedTracing(async (req: Request, user: AuthenticatedUser, ctx?: any) => {
    if (!allowedRoles.includes(user.role)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Insufficient permissions",
          code: "INSUFFICIENT_PERMISSIONS"
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return handler(req, user, ctx);
  }, options);
}

/**
 * WebSocket tracing middleware
 */
export function withWebSocketTracing(
  handler: (req: Request, ctx?: any) => Promise<Response> | Response,
  options: Partial<TracingMiddlewareOptions> = {}
) {
  return withTracing(handler, {
    ...options,
    spanNameGenerator: (req) => `WebSocket ${new URL(req.url).pathname}`,
    attributesExtractor: (req, user) => ({
      'websocket.protocol': req.headers.get('sec-websocket-protocol') || '',
      'websocket.version': req.headers.get('sec-websocket-version') || '',
      'websocket.key': req.headers.get('sec-websocket-key') || '',
      'websocket.user_id': user?.id || '',
      ...options.attributesExtractor?.(req, user),
    }),
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if tracing should be skipped for this request
 */
function shouldSkipTracing(req: Request, options: TracingMiddlewareOptions): boolean {
  const url = new URL(req.url);
  
  // Skip specific paths
  if (options.skipPaths.some(path => url.pathname.startsWith(path))) {
    return true;
  }
  
  // Skip specific methods
  if (options.skipMethods.includes(req.method)) {
    return true;
  }
  
  return false;
}

/**
 * Extract room ID from request
 */
function extractRoomId(req: Request): string | undefined {
  const url = new URL(req.url);
  
  // Try to extract from URL path
  const pathMatch = url.pathname.match(/\/rooms\/([a-f0-9-]+)/i);
  if (pathMatch) {
    return pathMatch[1];
  }
  
  // Try to extract from query parameters
  const roomId = url.searchParams.get('roomId');
  if (roomId) {
    return roomId;
  }
  
  return undefined;
}

/**
 * Get tracing context from request context
 */
export function getTracingContext(ctx: any): RequestTracingContext | null {
  return ctx?.tracing || null;
}

/**
 * Add custom attributes to current span
 */
export function addTracingAttributes(ctx: any, attributes: Record<string, string | number | boolean>): void {
  const tracingContext = getTracingContext(ctx);
  if (tracingContext?.span) {
    tracingContext.span.setAttributes(attributes);
  }
}

/**
 * Record exception in current span
 */
export function recordTracingException(ctx: any, error: Error): void {
  const tracingContext = getTracingContext(ctx);
  if (tracingContext?.span) {
    tracingContext.span.recordException(error);
    tracingContext.span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}

/**
 * Create traced handler utility
 */
export function createTracedHandler<T extends any[]>(
  handler: (req: Request, ...args: T) => Promise<Response> | Response,
  options?: Partial<TracingMiddlewareOptions>
) {
  return withTracing(handler, options);
}

/**
 * Create authenticated traced handler utility
 */
export function createAuthenticatedTracedHandler(
  handler: (req: Request, user: AuthenticatedUser, ctx?: any) => Promise<Response> | Response,
  options?: Partial<TracingMiddlewareOptions>
) {
  return withAuthenticatedTracing(handler, options);
}

/**
 * Create role-based traced handler utility
 */
export function createRoleBasedTracedHandler(
  roles: string | string[],
  handler: (req: Request, user: AuthenticatedUser, ctx?: any) => Promise<Response> | Response,
  options?: Partial<TracingMiddlewareOptions>
) {
  return withRoleBasedTracing(roles, handler, options);
}