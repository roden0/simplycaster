/**
 * Authentication Middleware
 * 
 * Provides authentication utilities for routes
 */

import { getService } from "../container/global.ts";
import { ServiceKeys } from "../container/registry.ts";
import { TokenService } from "../domain/services/token-service.ts";
import { UserRepository } from "../domain/repositories/user-repository.ts";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
}

/**
 * Extract and verify authentication token from request
 */
export async function authenticateRequest(req: Request): Promise<AuthenticatedUser | null> {
  try {
    // Try to get token from Authorization header first
    let token = req.headers.get("Authorization");
    if (token && token.startsWith("Bearer ")) {
      token = token.substring(7);
    } else {
      // Try to get token from cookie
      const cookieHeader = req.headers.get("Cookie");
      if (cookieHeader) {
        const cookies = parseCookies(cookieHeader);
        token = cookies.auth_token;
      }
    }

    if (!token) {
      return null;
    }

    // Verify token using TokenService
    const tokenService = getService<TokenService>(ServiceKeys.TOKEN_SERVICE);
    const tokenResult = await tokenService.verifyUserToken(token);

    if (!tokenResult.success) {
      return null;
    }

    const payload = tokenResult.data;

    // Get user from repository to ensure they still exist and are active
    const userRepository = getService<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const userResult = await userRepository.findById(payload.userId);

    if (!userResult.success || !userResult.data) {
      return null;
    }

    const user = userResult.data;

    // Check if user is still active
    if (!user.isActive) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified
    };

  } catch (error) {
    console.error("Authentication error:", error);
    return null;
  }
}

/**
 * Require authentication for a route
 */
export function requireAuth(handler: (req: Request, user: AuthenticatedUser, ctx?: any) => Promise<Response> | Response) {
  return async (req: Request, ctx?: any): Promise<Response> => {
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
  };
}

/**
 * Require specific role for a route
 */
export function requireRole(roles: string | string[]) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return function(handler: (req: Request, user: AuthenticatedUser, ctx?: any) => Promise<Response> | Response) {
    return async (req: Request, ctx?: any): Promise<Response> => {
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
    };
  };
}

/**
 * Parse cookies from cookie header
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });
  
  return cookies;
}