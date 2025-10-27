/**
 * TURN Credential Service
 * 
 * Generates and validates TURN server credentials using HMAC-SHA1
 * with time-based expiration for secure WebRTC NAT traversal.
 * Integrates with security services for enhanced protection.
 */

import { createHmac } from "node:crypto";
import { createSecureCredentialManager, ISecureCredentialManager } from "./secure-credential-manager.ts";
import { createTurnSecurityService, ITurnSecurityService } from "./turn-security-service.ts";

export interface TurnCredentials {
  username: string;    // timestamp:userId format
  credential: string;  // HMAC-SHA1 hash
  ttl: number;        // Time to live in seconds
  expiresAt: Date;    // Expiration timestamp
  credentialId: string; // Unique identifier for tracking
}

export interface TurnCredentialConfig {
  secret: string;
  realm: string;
  defaultTTL: number;
}

export interface ITurnCredentialService {
  generateTurnCredentials(userId: string, userType: 'host' | 'guest', clientIp: string, ttl?: number): Promise<TurnCredentials>;
  validateTurnCredentials(username: string, credential: string, clientIp: string): Promise<boolean>;
  isCredentialExpired(username: string): boolean;
  extractUserIdFromUsername(username: string): string | null;
}

export class TurnCredentialService implements ITurnCredentialService {
  private readonly secret: string;
  private readonly realm: string;
  private readonly defaultTTL: number;
  private readonly secureCredentialManager: ISecureCredentialManager;
  private readonly securityService: ITurnSecurityService;

  constructor(config: TurnCredentialConfig) {
    this.secret = config.secret;
    this.realm = config.realm;
    this.defaultTTL = config.defaultTTL;

    if (!this.secret || this.secret.length < 32) {
      throw new Error("TURN secret must be at least 32 characters long");
    }

    // Initialize security services
    this.secureCredentialManager = createSecureCredentialManager();
    this.securityService = createTurnSecurityService();
  }

  /**
   * Generates TURN credentials for a user with time-based expiration and security checks
   */
  async generateTurnCredentials(userId: string, userType: 'host' | 'guest', clientIp: string, ttl = this.defaultTTL): Promise<TurnCredentials> {
    if (!userId || userId.trim().length === 0) {
      throw new Error("User ID is required for TURN credential generation");
    }

    if (ttl <= 0 || ttl > 43200) { // Max 12 hours for security
      throw new Error("TTL must be between 1 and 43200 seconds (12 hours)");
    }

    // Security checks
    const [rateLimitOk, ipAllowed, sessionLimitOk] = await Promise.all([
      this.securityService.checkCredentialRequestLimit(userId, clientIp),
      this.securityService.isIpAllowed(clientIp),
      this.securityService.checkSessionLimits(userId)
    ]);

    if (!rateLimitOk) {
      throw new Error("Rate limit exceeded for credential requests");
    }

    if (!ipAllowed) {
      throw new Error("IP address not allowed to request credentials");
    }

    if (!sessionLimitOk) {
      throw new Error("Session limit exceeded for user");
    }

    // Use secure credential manager for enhanced security
    try {
      const secureCredentials = await this.secureCredentialManager.generateSecureCredentials(
        userId, 
        userType, 
        clientIp, 
        ttl
      );

      return {
        username: secureCredentials.username,
        credential: secureCredentials.credential,
        ttl,
        expiresAt: secureCredentials.expiresAt,
        credentialId: secureCredentials.credentialId
      };
    } catch (error) {
      // Fallback to basic credential generation if secure manager fails
      console.warn('Secure credential manager failed, using fallback:', error);
      
      const timestamp = Math.floor(Date.now() / 1000) + ttl;
      const username = `${timestamp}:${userId}`;
      const credential = this.generateHMAC(username, this.secret);

      return {
        username,
        credential,
        ttl,
        expiresAt: new Date(timestamp * 1000),
        credentialId: crypto.randomUUID()
      };
    }
  }

  /**
   * Validates TURN credentials with security checks and audit logging
   */
  async validateTurnCredentials(username: string, credential: string, clientIp: string): Promise<boolean> {
    try {
      if (!username || !credential) {
        return false;
      }

      // Security checks
      const userId = this.extractUserIdFromUsername(username) || 'unknown';
      const [connectionLimitOk, ipAllowed] = await Promise.all([
        this.securityService.checkConnectionAttemptLimit(userId, clientIp),
        this.securityService.isIpAllowed(clientIp)
      ]);

      if (!connectionLimitOk || !ipAllowed) {
        return false;
      }

      // Check if credential is expired
      if (this.isCredentialExpired(username)) {
        return false;
      }

      // Try secure credential manager first
      try {
        const isValid = await this.secureCredentialManager.validateCredentials(username, credential, clientIp);
        if (isValid) {
          return true;
        }
      } catch (error) {
        console.warn('Secure credential validation failed, using fallback:', error);
      }

      // Fallback to basic validation
      const expectedCredential = this.generateHMAC(username, this.secret);
      return this.secureCompare(credential, expectedCredential);
    } catch (error) {
      console.error("Error validating TURN credentials:", error);
      return false;
    }
  }

  /**
   * Checks if a TURN credential has expired based on the timestamp in username
   */
  isCredentialExpired(username: string): boolean {
    try {
      const parts = username.split(":");
      if (parts.length < 2) {
        return true; // Invalid format, consider expired
      }

      const timestamp = parseInt(parts[0], 10);
      if (isNaN(timestamp)) {
        return true; // Invalid timestamp, consider expired
      }

      const currentTimestamp = Math.floor(Date.now() / 1000);
      return currentTimestamp > timestamp;
    } catch (error) {
      console.error("Error checking credential expiration:", error);
      return true; // On error, consider expired for security
    }
  }

  /**
   * Extracts user ID from TURN username (format: timestamp:userId)
   */
  extractUserIdFromUsername(username: string): string | null {
    try {
      const parts = username.split(":");
      if (parts.length < 2) {
        return null;
      }

      // Join all parts after the first one (in case userId contains colons)
      return parts.slice(1).join(":");
    } catch (error) {
      console.error("Error extracting user ID from username:", error);
      return null;
    }
  }

  /**
   * Generates HMAC-SHA1 hash for TURN authentication
   */
  private generateHMAC(data: string, secret: string): string {
    const hmac = createHmac("sha1", secret);
    hmac.update(data);
    return hmac.digest("base64");
  }

  /**
   * Secure string comparison to prevent timing attacks
   */
  private secureCompare(a: string, b: string): boolean {
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

/**
 * Factory function to create TurnCredentialService from environment variables
 */
export function createTurnCredentialService(): TurnCredentialService {
  const secret = Deno.env.get("COTURN_SECRET");
  const realm = Deno.env.get("COTURN_REALM") || "simplycast.local";
  const defaultTTL = parseInt(Deno.env.get("TURN_CREDENTIAL_TTL") || "43200", 10); // 12 hours

  if (!secret) {
    throw new Error("COTURN_SECRET environment variable is required");
  }

  return new TurnCredentialService({
    secret,
    realm,
    defaultTTL
  });
}