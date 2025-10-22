/**
 * JWT Token Service Implementation
 * 
 * Implements TokenService interface using Web Crypto API for JWT management
 * with secure token generation, validation, and expiration handling.
 */

import { TokenService, TokenPayload, GuestTokenPayload } from '../../domain/services/token-service.ts';
import { UserRole, Result, Ok, Err } from '../../domain/types/common.ts';
import { AuthenticationError, ValidationError } from '../../domain/errors/index.ts';

/**
 * JWT implementation of TokenService
 */
export class JWTTokenService implements TokenService {
  private readonly jwtSecret: string;
  private readonly issuer: string;
  private readonly algorithm = 'HS256';

  constructor() {
    this.jwtSecret = Deno.env.get('JWT_SECRET') || 'default-secret-change-in-production';
    this.issuer = Deno.env.get('JWT_ISSUER') || 'simplycast.local';
    
    if (this.jwtSecret === 'default-secret-change-in-production') {
      console.warn('⚠️  Using default JWT secret. Set JWT_SECRET environment variable in production!');
    }
  }

  /**
   * Generate JWT token for authenticated user
   */
  async generateUserToken(userId: string, email: string, role: UserRole, expiresInHours: number = 24): Promise<Result<string>> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + (expiresInHours * 3600);

      const payload: TokenPayload = {
        userId,
        email,
        role,
        iat: now,
        exp
      };

      const header = {
        alg: this.algorithm,
        typ: 'JWT'
      };

      const token = await this.createJWT(header, payload);
      return Ok(token);
    } catch (error) {
      return Err(new Error(`Failed to generate user token: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Generate JWT token for guest access
   */
  async generateGuestToken(guestId: string, roomId: string, displayName: string, expiresInHours: number = 24): Promise<Result<string>> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + (expiresInHours * 3600);

      const payload: GuestTokenPayload = {
        guestId,
        roomId,
        displayName,
        iat: now,
        exp
      };

      const header = {
        alg: this.algorithm,
        typ: 'JWT'
      };

      const token = await this.createJWT(header, payload);
      return Ok(token);
    } catch (error) {
      return Err(new Error(`Failed to generate guest token: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Verify and decode user JWT token
   */
  async verifyUserToken(token: string): Promise<Result<TokenPayload>> {
    try {
      const payload = await this.verifyJWT(token);
      
      // Validate payload structure for user token
      if (!payload.userId || !payload.email || !payload.role) {
        return Err(new AuthenticationError('Invalid user token payload'));
      }

      // Validate role
      if (!Object.values(UserRole).includes(payload.role)) {
        return Err(new AuthenticationError('Invalid user role in token'));
      }

      return Ok(payload as TokenPayload);
    } catch (error) {
      return Err(new AuthenticationError(`Invalid user token: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Verify and decode guest JWT token
   */
  async verifyGuestToken(token: string): Promise<Result<GuestTokenPayload>> {
    try {
      const payload = await this.verifyJWT(token);
      
      // Validate payload structure for guest token
      if (!payload.guestId || !payload.roomId || !payload.displayName) {
        return Err(new AuthenticationError('Invalid guest token payload'));
      }

      return Ok(payload as GuestTokenPayload);
    } catch (error) {
      return Err(new AuthenticationError(`Invalid guest token: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Generate secure random token for invitations/resets
   */
  async generateSecureToken(length: number = 32): Promise<Result<string>> {
    try {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      
      // Convert to URL-safe base64
      const token = this.uint8ArrayToBase64Url(bytes);
      
      return Ok(token);
    } catch (error) {
      return Err(new Error(`Failed to generate secure token: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Hash token for secure storage
   */
  async hashToken(token: string): Promise<Result<string>> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return Ok(hashHex);
    } catch (error) {
      return Err(new Error(`Failed to hash token: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Verify token against hash
   */
  async verifyTokenHash(token: string, hash: string): Promise<Result<boolean>> {
    try {
      const hashResult = await this.hashToken(token);
      if (!hashResult.success) {
        return Err(hashResult.error);
      }
      
      // Constant-time comparison
      const isValid = this.constantTimeEquals(hashResult.data, hash);
      return Ok(isValid);
    } catch (error) {
      return Err(new Error(`Failed to verify token hash: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Check if token is expired
   */
  async isTokenExpired(token: string): Promise<Result<boolean>> {
    try {
      const payload = await this.verifyJWT(token);
      const now = Math.floor(Date.now() / 1000);
      
      return Ok(payload.exp < now);
    } catch (error) {
      // If token is invalid, consider it expired
      return Ok(true);
    }
  }

  /**
   * Extract token expiration date
   */
  async getTokenExpiration(token: string): Promise<Result<Date>> {
    try {
      const payload = await this.verifyJWT(token);
      const expirationDate = new Date(payload.exp * 1000);
      
      return Ok(expirationDate);
    } catch (error) {
      return Err(new AuthenticationError(`Failed to get token expiration: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Create JWT token
   */
  private async createJWT(header: any, payload: any): Promise<string> {
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await this.sign(signingInput);
    
    return `${signingInput}.${signature}`;
  }

  /**
   * Verify JWT token and return payload
   */
  private async verifyJWT(token: string): Promise<any> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Verify signature
    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSignature = await this.sign(signingInput);
    
    if (!this.constantTimeEquals(signatureB64, expectedSignature)) {
      throw new Error('Invalid JWT signature');
    }

    // Decode and validate payload
    const payload = JSON.parse(this.base64UrlDecode(payloadB64));
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Token expired');
    }

    // Check issued at time (not in future)
    if (payload.iat && payload.iat > now + 60) { // Allow 60 seconds clock skew
      throw new Error('Token issued in future');
    }

    return payload;
  }

  /**
   * Sign data using HMAC-SHA256
   */
  private async sign(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.jwtSecret);
    const messageData = encoder.encode(data);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    return this.uint8ArrayToBase64Url(new Uint8Array(signature));
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(str: string): string {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    return this.uint8ArrayToBase64Url(bytes);
  }

  /**
   * Base64 URL decode
   */
  private base64UrlDecode(str: string): string {
    const bytes = this.base64UrlToUint8Array(str);
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }

  /**
   * Convert Uint8Array to base64 URL-safe string
   */
  private uint8ArrayToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Convert base64 URL-safe string to Uint8Array
   */
  private base64UrlToUint8Array(base64Url: string): Uint8Array {
    // Add padding if needed
    const padding = '='.repeat((4 - base64Url.length % 4) % 4);
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/') + padding;
    
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