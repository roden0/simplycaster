// ============================================================================
// Password Service Interface
// ============================================================================

import { Result } from '../types/common.ts';

/**
 * Password hash result
 */
export interface PasswordHashResult {
  hash: string;
  salt: string;
}

/**
 * Password service interface for authentication security
 */
export interface PasswordService {
  /**
   * Hash a password with salt using Argon2
   */
  hash(password: string, salt: string): Promise<Result<string>>;

  /**
   * Hash a password with auto-generated salt
   */
  hashPassword(password: string): Promise<Result<PasswordHashResult>>;

  /**
   * Verify a password against its hash
   */
  verify(password: string, hash: string, salt: string): Promise<Result<boolean>>;

  /**
   * Generate a cryptographically secure salt
   */
  generateSalt(): Promise<Result<string>>;

  /**
   * Validate password strength
   */
  validatePasswordStrength(password: string): Result<boolean>;
}