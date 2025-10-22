// ============================================================================
// Token Service Interface
// ============================================================================

import { Result } from '../types/common.ts';
import { UserRole } from '../types/common.ts';

/**
 * JWT token payload interface
 */
export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/**
 * Guest token payload interface
 */
export interface GuestTokenPayload {
  guestId: string;
  roomId: string;
  displayName: string;
  iat: number;
  exp: number;
}

/**
 * Token service interface for JWT management
 */
export interface TokenService {
  /**
   * Generate JWT token for authenticated user
   */
  generateUserToken(userId: string, email: string, role: UserRole, expiresInHours?: number): Promise<Result<string>>;

  /**
   * Generate JWT token for guest access
   */
  generateGuestToken(payload: any, expiresInHours?: number): Promise<Result<string>>;

  /**
   * Verify and decode user JWT token
   */
  verifyUserToken(token: string): Promise<Result<TokenPayload>>;

  /**
   * Verify and decode guest JWT token
   */
  verifyGuestToken(token: string): Promise<Result<GuestTokenPayload>>;

  /**
   * Generate secure random token for invitations/resets
   */
  generateSecureToken(length?: number): Promise<Result<string>>;

  /**
   * Hash token for secure storage
   */
  hashToken(token: string): Promise<Result<string>>;

  /**
   * Verify token against hash
   */
  verifyTokenHash(token: string, hash: string): Promise<Result<boolean>>;

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): Promise<Result<boolean>>;

  /**
   * Extract token expiration date
   */
  getTokenExpiration(token: string): Promise<Result<Date>>;
}