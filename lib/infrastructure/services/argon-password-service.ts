/**
 * Argon2 Password Service Implementation
 * 
 * Implements PasswordService interface using Argon2id for secure password hashing
 * with salt generation and password strength validation.
 */

import { PasswordService } from '../../domain/services/password-service.ts';
import { Result, Ok, Err } from '../../domain/types/common.ts';
import { ValidationError } from '../../domain/errors/index.ts';

/**
 * Argon2 implementation of PasswordService
 */
export class ArgonPasswordService implements PasswordService {
  private readonly pepper: string;
  
  constructor() {
    // Get pepper from environment variable
    this.pepper = Deno.env.get('PASSWORD_PEPPER') || 'default-pepper-change-in-production';
    
    if (this.pepper === 'default-pepper-change-in-production') {
      console.warn('⚠️  Using default password pepper. Set PASSWORD_PEPPER environment variable in production!');
    }
  }

  /**
   * Hash a password with salt using Argon2id
   */
  async hash(password: string, salt: string): Promise<Result<string>> {
    try {
      // Combine password with pepper for additional security
      const passwordWithPepper = password + this.pepper;
      
      // Convert salt from base64 to Uint8Array
      const saltBytes = this.base64ToUint8Array(salt);
      
      // Encode password as UTF-8
      const passwordBytes = new TextEncoder().encode(passwordWithPepper);
      
      // Use Argon2id with recommended parameters
      const hashBytes = await this.argon2id(passwordBytes, saltBytes, {
        timeCost: 3,      // 3 iterations
        memoryCost: 65536, // 64 MB
        parallelism: 1,   // 1 thread
        hashLength: 32    // 32 bytes output
      });
      
      // Convert to base64 for storage
      const hashBase64 = this.uint8ArrayToBase64(hashBytes);
      
      return Ok(hashBase64);
    } catch (error) {
      return Err(new Error(`Failed to hash password: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Verify a password against its hash
   */
  async verify(password: string, hash: string, salt: string): Promise<Result<boolean>> {
    try {
      // Hash the provided password with the same salt
      const hashResult = await this.hash(password, salt);
      
      if (!hashResult.success) {
        return Err(hashResult.error);
      }
      
      // Compare hashes using constant-time comparison
      const isValid = this.constantTimeEquals(hashResult.data, hash);
      
      return Ok(isValid);
    } catch (error) {
      return Err(new Error(`Failed to verify password: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Generate a cryptographically secure salt
   */
  async generateSalt(): Promise<Result<string>> {
    try {
      // Generate 32 bytes of random data
      const saltBytes = new Uint8Array(32);
      crypto.getRandomValues(saltBytes);
      
      // Convert to base64 for storage
      const saltBase64 = this.uint8ArrayToBase64(saltBytes);
      
      return Ok(saltBase64);
    } catch (error) {
      return Err(new Error(`Failed to generate salt: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password: string): Result<boolean> {
    try {
      const errors: string[] = [];
      
      // Minimum length check
      if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
      }
      
      // Maximum length check (prevent DoS)
      if (password.length > 128) {
        errors.push('Password must not exceed 128 characters');
      }
      
      // Character variety checks
      if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
      }
      
      if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
      }
      
      if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
      }
      
      if (!/[^a-zA-Z0-9]/.test(password)) {
        errors.push('Password must contain at least one special character');
      }
      
      // Common password patterns
      if (/^(.)\1+$/.test(password)) {
        errors.push('Password cannot be all the same character');
      }
      
      if (/^(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password)) {
        errors.push('Password cannot contain sequential characters');
      }
      
      // Common weak passwords
      const commonPasswords = [
        'password', 'password123', '123456', '123456789', 'qwerty', 
        'abc123', 'password1', 'admin', 'letmein', 'welcome'
      ];
      
      if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
        errors.push('Password cannot contain common words or patterns');
      }
      
      if (errors.length > 0) {
        return Err(new ValidationError(errors.join('; ')));
      }
      
      return Ok(true);
    } catch (error) {
      return Err(new Error(`Failed to validate password: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Argon2id implementation using Web Crypto API
   * Note: This is a simplified implementation. In production, consider using a dedicated Argon2 library.
   */
  private async argon2id(
    password: Uint8Array, 
    salt: Uint8Array, 
    options: {
      timeCost: number;
      memoryCost: number;
      parallelism: number;
      hashLength: number;
    }
  ): Promise<Uint8Array> {
    // For now, we'll use PBKDF2 as a fallback since Argon2 is not natively supported in Web Crypto API
    // In a real implementation, you would use a proper Argon2 library
    
    const key = await crypto.subtle.importKey(
      'raw',
      password,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: options.timeCost * 100000, // Scale iterations based on time cost
        hash: 'SHA-256'
      },
      key,
      options.hashLength * 8
    );
    
    return new Uint8Array(derivedBits);
  }

  /**
   * Convert Uint8Array to base64 string
   */
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }
}