/**
 * Rate Limiting Middleware
 * 
 * Provides rate limiting functionality for API routes using Redis-based sliding window algorithm.
 * Supports per-user, per-IP, and per-endpoint rate limiting with configurable policies.
 */

import { getService } from "../container/global.ts";
import { ServiceKeys } from "../container/registry.ts";
import { RateLimitService, RateLimitExceededError } from "../domain/services/rate-limit-service.ts";
import { AuthenticatedUser, authenticateRequest } from "./auth.ts";

export interface RateLimitContext {
  user?: AuthenticatedUser;
  ipAddress: string;
  endpoint: string;
  userAgent?: string;
}

/**
 * Rate limiting middleware that checks limits before processing requests
 */
export function withRateLimit(
  handler: (req: Request, ctx?: any) => Promise<Response> | Response,
  options?: {
    skipForAdmin?: boolean;
    customIdentifier?: (req: Request, user?: AuthenticatedUser) => string;
    customEndpoint?: string;
  }
) {
  return async (req: Request, ctx?: any): Promise<Response> => {
    try {
      // Get rate limiting service
      const rateLimitService = await getService<RateLimitService>(ServiceKeys.RATE_LIMIT_SERVICE);
      
      // Extract context information
      const context = await extractRateLimitContext(req);
      const endpoint = options?.customEndpoint || context.endpoint;
      
      // Skip rate limiting for admin users if configured
      if (options?.skipForAdmin && context.user?.role === 'admin') {
        return handler(req, ctx);
      }
      
      // Determine identifier for rate limiting
      let identifier: string;
      if (options?.customIdentifier) {
        identifier = options.customIdentifier(req, context.user);
      } else {
        // Use user ID if authenticated, otherwise use IP address
        identifier = context.user?.id || context.ipAddress;
      }
      
      // Check rate limit
      const rateLimitResult = await rateLimitService.checkEndpointLimit(
        endpoint,
        identifier,
        context.user?.role
      );
      
      // If rate limit exceeded, return error response
      if (!rateLimitResult.allowed) {
        return createRateLimitExceededResponse(rateLimitResult);
      }
      
      // Add rate limit headers to response
      const response = await handler(req, ctx);
      return addRateLimitHeaders(response, rateLimitResult);
      
    } catch (error) {
      console.error("Rate limiting middleware error:", error);
      
      // On rate limiting error, allow the request to proceed
      // This ensures the service remains available even if Redis is down
      return handler(req, ctx);
    }
  };
}

/**
 * Rate limiting middleware specifically for authenticated routes
 */
export function withAuthenticatedRateLimit(
  handler: (req: Request, user: AuthenticatedUser, ctx?: any) => Promise<Response> | Response,
  options?: {
    skipForAdmin?: boolean;
    customEndpoint?: string;
  }
) {
  return async (req: Request, ctx?: any): Promise<Response> => {
    try {
      // Authenticate user first
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
      
      // Apply rate limiting
      const rateLimitedHandler = withRateLimit(
        (req: Request, ctx?: any) => handler(req, user, ctx),
        options
      );
      
      return rateLimitedHandler(req, ctx);
      
    } catch (error) {
      console.error("Authenticated rate limiting middleware error:", error);
      
      // On error, still try to authenticate and proceed
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
    }
  };
}

/**
 * Rate limiting middleware for specific user roles
 */
export function withRoleBasedRateLimit(
  roles: string | string[],
  handler: (req: Request, user: AuthenticatedUser, ctx?: any) => Promise<Response> | Response,
  options?: {
    skipForAdmin?: boolean;
    customEndpoint?: string;
  }
) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return async (req: Request, ctx?: any): Promise<Response> => {
    try {
      // Authenticate user first
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
      
      // Check role authorization
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
      
      // Apply rate limiting
      const rateLimitedHandler = withRateLimit(
        (req: Request, ctx?: any) => handler(req, user, ctx),
        options
      );
      
      return rateLimitedHandler(req, ctx);
      
    } catch (error) {
      console.error("Role-based rate limiting middleware error:", error);
      
      // On error, still try to authenticate and authorize
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
    }
  };
}

/**
 * IP-based rate limiting middleware (for public endpoints)
 */
export function withIPRateLimit(
  limit: number,
  windowSeconds: number,
  handler: (req: Request, ctx?: any) => Promise<Response> | Response
) {
  return async (req: Request, ctx?: any): Promise<Response> => {
    try {
      const rateLimitService = await getService<RateLimitService>(ServiceKeys.RATE_LIMIT_SERVICE);
      const ipAddress = getClientIP(req);
      
      // Check rate limit for IP address
      const rateLimitResult = await rateLimitService.checkLimit(
        `ip:${ipAddress}`,
        limit,
        windowSeconds
      );
      
      if (!rateLimitResult.allowed) {
        return createRateLimitExceededResponse(rateLimitResult);
      }
      
      const response = await handler(req, ctx);
      return addRateLimitHeaders(response, rateLimitResult);
      
    } catch (error) {
      console.error("IP rate limiting middleware error:", error);
      return handler(req, ctx);
    }
  };
}

/**
 * Extract rate limiting context from request
 */
async function extractRateLimitContext(req: Request): Promise<RateLimitContext> {
  const user = await authenticateRequest(req);
  const ipAddress = getClientIP(req);
  const endpoint = extractEndpointPath(req);
  const userAgent = req.headers.get("User-Agent") || undefined;
  
  return {
    user,
    ipAddress,
    endpoint,
    userAgent
  };
}

/**
 * Extract endpoint path from request URL
 */
function extractEndpointPath(req: Request): string {
  const url = new URL(req.url);
  let pathname = url.pathname;
  
  // Normalize path parameters for rate limiting
  // Replace UUIDs and numeric IDs with wildcards for consistent rate limiting
  pathname = pathname.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '/*'
  );
  pathname = pathname.replace(/\/\d+/g, '/*');
  
  return pathname;
}

/**
 * Get client IP address from request
 */
function getClientIP(req: Request): string {
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

  // For development, return a default IP
  return "127.0.0.1";
}

/**
 * Create rate limit exceeded response
 */
function createRateLimitExceededResponse(rateLimitResult: any): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-RateLimit-Limit": rateLimitResult.totalHits?.toString() || "0",
    "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
    "X-RateLimit-Reset": rateLimitResult.resetTime.toISOString(),
  });
  
  if (rateLimitResult.retryAfter) {
    headers.set("Retry-After", rateLimitResult.retryAfter.toString());
  }
  
  return new Response(
    JSON.stringify({
      success: false,
      error: "Rate limit exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      details: {
        limit: rateLimitResult.totalHits || 0,
        remaining: rateLimitResult.remaining,
        resetTime: rateLimitResult.resetTime.toISOString(),
        retryAfter: rateLimitResult.retryAfter
      }
    }),
    {
      status: 429,
      headers
    }
  );
}

/**
 * Add rate limit headers to response
 */
function addRateLimitHeaders(response: Response, rateLimitResult: any): Response {
  const headers = new Headers(response.headers);
  
  headers.set("X-RateLimit-Limit", rateLimitResult.totalHits?.toString() || "0");
  headers.set("X-RateLimit-Remaining", rateLimitResult.remaining.toString());
  headers.set("X-RateLimit-Reset", rateLimitResult.resetTime.toISOString());
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Utility function to create a rate-limited endpoint handler
 */
export function createRateLimitedHandler<T extends any[]>(
  handler: (req: Request, ...args: T) => Promise<Response> | Response,
  rateLimitOptions?: {
    skipForAdmin?: boolean;
    customIdentifier?: (req: Request, user?: AuthenticatedUser) => string;
    customEndpoint?: string;
  }
) {
  return withRateLimit(handler, rateLimitOptions);
}

/**
 * Utility function to create a rate-limited authenticated endpoint handler
 */
export function createAuthenticatedRateLimitedHandler(
  handler: (req: Request, user: AuthenticatedUser, ctx?: any) => Promise<Response> | Response,
  rateLimitOptions?: {
    skipForAdmin?: boolean;
    customEndpoint?: string;
  }
) {
  return withAuthenticatedRateLimit(handler, rateLimitOptions);
}

/**
 * Utility function to create a role-based rate-limited endpoint handler
 */
export function createRoleBasedRateLimitedHandler(
  roles: string | string[],
  handler: (req: Request, user: AuthenticatedUser, ctx?: any) => Promise<Response> | Response,
  rateLimitOptions?: {
    skipForAdmin?: boolean;
    customEndpoint?: string;
  }
) {
  return withRoleBasedRateLimit(roles, handler, rateLimitOptions);
}