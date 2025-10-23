/**
 * Authentication Middleware
 * 
 * Provides authentication utilities for routes
 */

import { getService } from "../container/global.ts";
import { ServiceKeys } from "../container/registry.ts";
import { TokenService } from "../domain/services/token-service.ts";
import { UserRepository } from "../domain/repositories/user-repository.ts";
import { GuestRepository } from "../domain/repositories/guest-repository.ts";
import { RoomRepository } from "../domain/repositories/room-repository.ts";
import { SessionService } from "../domain/services/session-service.ts";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
}

/**
 * Extract and verify authentication token from request
 * First tries Redis session validation, then falls back to JWT validation
 */
export async function authenticateRequest(req: Request): Promise<AuthenticatedUser | null> {
  try {
    // Try to get session ID from cookie first (Redis sessions)
    const cookieHeader = req.headers.get("Cookie");
    let sessionId: string | undefined;
    let token: string | undefined;

    if (cookieHeader) {
      const cookies = parseCookies(cookieHeader);
      sessionId = cookies.session_id;
      token = cookies.auth_token;
    }

    // Try to get token from Authorization header if not in cookie
    if (!token) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    // First, try Redis session validation if session ID is available
    if (sessionId) {
      const sessionService = await getService<SessionService>(ServiceKeys.SESSION_SERVICE);
      const sessionResult = await sessionService.validateSession(sessionId);

      if (sessionResult.success && sessionResult.data) {
        return {
          id: sessionResult.data.userId,
          email: sessionResult.data.email,
          role: sessionResult.data.role,
          isActive: sessionResult.data.isActive,
          emailVerified: sessionResult.data.emailVerified
        };
      }
    }

    // Fallback to JWT token validation if Redis session is not available or invalid
    if (token) {
      return await authenticateWithJWT(token);
    }

    return null;

  } catch (error) {
    console.error("Authentication error:", error);
    return null;
  }
}

/**
 * Authenticate using JWT token (fallback method)
 */
async function authenticateWithJWT(token: string): Promise<AuthenticatedUser | null> {
  try {
    // Verify token using TokenService
    const tokenService = await getService<TokenService>(ServiceKeys.TOKEN_SERVICE);
    const tokenResult = await tokenService.verifyUserToken(token);

    if (!tokenResult.success) {
      return null;
    }

    const payload = tokenResult.data;

    // Get user from repository to ensure they still exist and are active
    const userRepository = await getService<UserRepository>(ServiceKeys.USER_REPOSITORY);
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
    console.error("JWT authentication error:", error);
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
 * Create a new session for authenticated user
 */
export async function createUserSession(user: AuthenticatedUser, req: Request): Promise<string> {
  try {
    const sessionService = await getService<SessionService>(ServiceKeys.SESSION_SERVICE);
    
    // Generate session ID
    const sessionId = crypto.randomUUID();
    
    // Extract request metadata
    const ipAddress = getClientIP(req);
    const userAgent = req.headers.get("User-Agent") || undefined;
    
    // Create session data
    const sessionData = {
      userId: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      loginTime: new Date(),
      lastActivity: new Date(),
      ipAddress,
      userAgent
    };

    // Create session in Redis
    await sessionService.createSession(sessionId, sessionData);
    
    return sessionId;
  } catch (error) {
    console.error("Failed to create user session:", error);
    throw new Error("Failed to create session");
  }
}

/**
 * Invalidate user session
 */
export async function invalidateUserSession(sessionId: string): Promise<void> {
  try {
    const sessionService = await getService<SessionService>(ServiceKeys.SESSION_SERVICE);
    await sessionService.invalidateSession(sessionId);
  } catch (error) {
    console.error("Failed to invalidate session:", error);
    // Don't throw error for session invalidation failures
  }
}

/**
 * Invalidate all sessions for a user
 */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  try {
    const sessionService = await getService<SessionService>(ServiceKeys.SESSION_SERVICE);
    await sessionService.invalidateUserSessions(userId);
  } catch (error) {
    console.error("Failed to invalidate user sessions:", error);
    // Don't throw error for session invalidation failures
  }
}

/**
 * Get client IP address from request
 */
function getClientIP(req: Request): string | undefined {
  // Check for forwarded headers first (for reverse proxies)
  const forwarded = req.headers.get("X-Forwarded-For");
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = req.headers.get("X-Real-IP");
  if (realIP) {
    return realIP;
  }

  // For development, we might not have these headers
  return undefined;
}

/**
 * Create session cookie string
 */
export function createSessionCookie(sessionId: string, maxAge: number = 86400): string {
  const secure = Deno.env.get("ENVIRONMENT") === "production";
  const sameSite = "Lax";
  
  return `session_id=${sessionId}; HttpOnly; Secure=${secure}; SameSite=${sameSite}; Max-Age=${maxAge}; Path=/`;
}

/**
 * Create session invalidation cookie string
 */
export function createSessionInvalidationCookie(): string {
  const secure = Deno.env.get("ENVIRONMENT") === "production";
  
  return `session_id=; HttpOnly; Secure=${secure}; SameSite=Lax; Max-Age=0; Path=/`;
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

/**
 * Authenticate WebSocket connection with support for both user tokens and guest tokens
 */
export async function authenticateWebSocketConnection(req: Request): Promise<{
  participantId: string;
  participantName: string;
  participantType: 'host' | 'guest';
  roomId: string;
} | null> {
  try {
    // Try standard authentication first (for hosts/admins)
    const user = await authenticateRequest(req);
    if (user) {
      // Extract room ID from URL or query parameters
      const url = new URL(req.url);
      const roomId = url.searchParams.get('roomId');
      
      if (!roomId) {
        return null;
      }

      // Verify user has access to this room
      const roomRepository = await getService<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
      const roomResult = await roomRepository.findById(roomId);
      
      if (!roomResult.success || !roomResult.data) {
        return null;
      }

      const room = roomResult.data;
      
      // Check if user is the host or admin
      if (user.role === 'admin' || room.hostId === user.id) {
        return {
          participantId: user.id,
          participantName: user.email,
          participantType: user.role === 'host' ? 'host' : 'host', // Treat admin as host for WebRTC
          roomId
        };
      }
    }

    // Try guest token authentication
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const roomId = url.searchParams.get('roomId');
    
    if (!token || !roomId) {
      return null;
    }

    // Hash the token to match stored hash
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const tokenHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Find guest by token hash
    const guestRepository = await getService<GuestRepository>(ServiceKeys.GUEST_REPOSITORY);
    const guestResult = await guestRepository.findByTokenHash(tokenHash);
    
    if (!guestResult.success || !guestResult.data) {
      return null;
    }

    const guest = guestResult.data;
    
    // Import GuestDomain for validation
    const { GuestDomain } = await import("../domain/entities/guest.ts");
    
    // Verify guest is active and token is not expired
    if (!GuestDomain.isActive(guest) || guest.roomId !== roomId) {
      return null;
    }

    return {
      participantId: guest.id,
      participantName: guest.displayName,
      participantType: 'guest',
      roomId: guest.roomId
    };

  } catch (error) {
    console.error('WebSocket authentication error:', error);
    return null;
  }
}