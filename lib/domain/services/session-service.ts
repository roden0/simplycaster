/**
 * Session Service Interface
 * 
 * Defines the contract for session management operations including
 * session creation, validation, cleanup, and TTL management.
 */

export interface SessionData {
  userId: string;
  email: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  loginTime: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionValidationResult {
  success: boolean;
  data?: SessionData;
  error?: string;
}

export interface SessionService {
  /**
   * Create a new session
   */
  createSession(sessionId: string, data: SessionData, ttlSeconds?: number): Promise<void>;

  /**
   * Get session data by session ID
   */
  getSession(sessionId: string): Promise<SessionData | null>;

  /**
   * Validate session and return session data
   */
  validateSession(sessionId: string): Promise<SessionValidationResult>;

  /**
   * Update session data (extends TTL)
   */
  updateSession(sessionId: string, data: Partial<SessionData>): Promise<void>;

  /**
   * Refresh session TTL (update last activity)
   */
  refreshSession(sessionId: string, ttlSeconds?: number): Promise<void>;

  /**
   * Invalidate/delete a session
   */
  invalidateSession(sessionId: string): Promise<void>;

  /**
   * Invalidate all sessions for a user
   */
  invalidateUserSessions(userId: string): Promise<void>;

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): Promise<number>;

  /**
   * Get all active sessions for a user
   */
  getUserSessions(userId: string): Promise<SessionData[]>;

  /**
   * Check if session exists
   */
  sessionExists(sessionId: string): Promise<boolean>;

  /**
   * Get session TTL in seconds
   */
  getSessionTTL(sessionId: string): Promise<number>;
}

export interface SessionConfig {
  defaultTTL: number; // Default session TTL in seconds
  maxTTL: number; // Maximum session TTL in seconds
  refreshThreshold: number; // Refresh session if TTL is below this threshold
  cleanupInterval: number; // Interval for cleanup operations in seconds
}