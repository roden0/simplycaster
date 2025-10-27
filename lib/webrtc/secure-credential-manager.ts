/**
 * Secure Credential Manager
 * 
 * Manages secure storage of TURN shared secrets, credential rotation,
 * and audit logging for credential generation.
 */

import { getService } from "../container/global.ts";
import { ServiceKeys } from "../container/registry.ts";
import { RedisService } from "../domain/services/redis-service.ts";

export interface SecureCredentialConfig {
  secretRotation: {
    enabled: boolean;
    rotationIntervalHours: number;
    gracePeriodHours: number;
    maxSecretAge: number;
  };
  encryption: {
    algorithm: string;
    keyDerivationIterations: number;
  };
  audit: {
    enabled: boolean;
    retentionDays: number;
    logSensitiveData: boolean;
  };
}

export interface CredentialAuditLog {
  id: string;
  timestamp: Date;
  action: 'generate' | 'validate' | 'rotate' | 'revoke';
  userId: string;
  userType: 'host' | 'guest' | 'admin';
  clientIp: string;
  success: boolean;
  errorMessage?: string;
  metadata: {
    credentialId?: string;
    expiresAt?: Date;
    rotationId?: string;
    userAgent?: string;
  };
}

export interface SecretRotationInfo {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  rotationCount: number;
}

export interface ISecureCredentialManager {
  generateSecureCredentials(userId: string, userType: 'host' | 'guest', clientIp: string, ttl?: number): Promise<{
    username: string;
    credential: string;
    expiresAt: Date;
    credentialId: string;
  }>;
  validateCredentials(username: string, credential: string, clientIp: string): Promise<boolean>;
  rotateSharedSecret(): Promise<void>;
  revokeCredentials(credentialId: string, reason: string): Promise<void>;
  getAuditLogs(timeRangeHours?: number, userId?: string): Promise<CredentialAuditLog[]>;
  getSecretRotationInfo(): Promise<SecretRotationInfo[]>;
  cleanupExpiredCredentials(): Promise<number>;
}

export class SecureCredentialManager implements ISecureCredentialManager {
  private config: SecureCredentialConfig;
  private redisService: RedisService | null = null;
  private currentSecret: string | null = null;
  private previousSecret: string | null = null;
  private encryptionKey: CryptoKey | null = null;

  constructor(config?: Partial<SecureCredentialConfig>) {
    this.config = this.loadConfig(config);
    this.initializeServices();
  }

  private async initializeServices(): Promise<void> {
    try {
      this.redisService = await getService<RedisService>(ServiceKeys.REDIS_SERVICE);
      await this.initializeEncryption();
      await this.loadOrGenerateSecrets();
    } catch (error) {
      console.error('Failed to initialize secure credential manager:', error);
    }
  }

  private loadConfig(override?: Partial<SecureCredentialConfig>): SecureCredentialConfig {
    const defaultConfig: SecureCredentialConfig = {
      secretRotation: {
        enabled: Deno.env.get("TURN_SECRET_ROTATION_ENABLED") === "true",
        rotationIntervalHours: parseInt(Deno.env.get("TURN_SECRET_ROTATION_INTERVAL") || "168", 10), // 7 days
        gracePeriodHours: parseInt(Deno.env.get("TURN_SECRET_GRACE_PERIOD") || "24", 10), // 1 day
        maxSecretAge: parseInt(Deno.env.get("TURN_SECRET_MAX_AGE") || "720", 10) // 30 days
      },
      encryption: {
        algorithm: "AES-GCM",
        keyDerivationIterations: 100000
      },
      audit: {
        enabled: Deno.env.get("TURN_AUDIT_ENABLED") !== "false",
        retentionDays: parseInt(Deno.env.get("TURN_AUDIT_RETENTION_DAYS") || "90", 10),
        logSensitiveData: Deno.env.get("TURN_AUDIT_LOG_SENSITIVE") === "true"
      }
    };

    return { ...defaultConfig, ...override };
  }

  private async initializeEncryption(): Promise<void> {
    try {
      const masterKey = Deno.env.get("TURN_MASTER_KEY");
      if (!masterKey) {
        throw new Error("TURN_MASTER_KEY environment variable is required");
      }

      // Derive encryption key from master key
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(masterKey),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );

      this.encryptionKey = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: encoder.encode("turn-credential-salt"),
          iterations: this.config.encryption.keyDerivationIterations,
          hash: "SHA-256"
        },
        keyMaterial,
        { name: this.config.encryption.algorithm, length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
      throw error;
    }
  }

  private async loadOrGenerateSecrets(): Promise<void> {
    if (!this.redisService) {
      // Fallback to environment variable
      this.currentSecret = Deno.env.get("COTURN_SECRET") || this.generateSecret();
      return;
    }

    try {
      // Load current secret from secure storage
      const encryptedSecret = await this.redisService.get<string>("turn:secret:current");
      if (encryptedSecret) {
        this.currentSecret = await this.decryptSecret(encryptedSecret);
      } else {
        // Generate new secret if none exists
        this.currentSecret = this.generateSecret();
        await this.storeSecret(this.currentSecret, "current");
      }

      // Load previous secret for grace period
      const encryptedPreviousSecret = await this.redisService.get<string>("turn:secret:previous");
      if (encryptedPreviousSecret) {
        this.previousSecret = await this.decryptSecret(encryptedPreviousSecret);
      }
    } catch (error) {
      console.error('Failed to load secrets:', error);
      // Fallback to environment variable
      this.currentSecret = Deno.env.get("COTURN_SECRET") || this.generateSecret();
    }
  }

  private generateSecret(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async encryptSecret(secret: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: this.config.encryption.algorithm, iv },
      this.encryptionKey,
      data
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  private async decryptSecret(encryptedSecret: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    const combined = new Uint8Array(
      atob(encryptedSecret).split('').map(char => char.charCodeAt(0))
    );

    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: this.config.encryption.algorithm, iv },
      this.encryptionKey,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  }

  private async storeSecret(secret: string, type: 'current' | 'previous'): Promise<void> {
    if (!this.redisService) {
      return;
    }

    try {
      const encryptedSecret = await this.encryptSecret(secret);
      const key = `turn:secret:${type}`;
      const ttl = this.config.secretRotation.maxSecretAge * 3600; // Convert hours to seconds

      await this.redisService.set(key, encryptedSecret, ttl);

      // Store rotation info
      const rotationInfo: SecretRotationInfo = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ttl * 1000),
        isActive: type === 'current',
        rotationCount: 0 // TODO: Track rotation count
      };

      await this.redisService.set(`turn:rotation:${type}`, JSON.stringify(rotationInfo), ttl);
    } catch (error) {
      console.error(`Failed to store ${type} secret:`, error);
    }
  }

  /**
   * Generates secure TURN credentials with audit logging
   */
  async generateSecureCredentials(
    userId: string, 
    userType: 'host' | 'guest', 
    clientIp: string, 
    ttl = 43200
  ): Promise<{
    username: string;
    credential: string;
    expiresAt: Date;
    credentialId: string;
  }> {
    const credentialId = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000) + ttl;
    const username = `${timestamp}:${userId}`;
    const expiresAt = new Date(timestamp * 1000);

    try {
      if (!this.currentSecret) {
        throw new Error("No current secret available");
      }

      // Generate HMAC-SHA1 credential
      const credential = await this.generateHMAC(username, this.currentSecret);

      // Store credential metadata for validation and revocation
      if (this.redisService) {
        const credentialMetadata = {
          id: credentialId,
          userId,
          userType,
          username,
          createdAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          clientIp,
          isRevoked: false
        };

        await this.redisService.set(
          `turn:credential:${credentialId}`,
          JSON.stringify(credentialMetadata),
          ttl
        );
      }

      // Audit log
      await this.logCredentialAction({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        action: 'generate',
        userId,
        userType,
        clientIp,
        success: true,
        metadata: {
          credentialId,
          expiresAt
        }
      });

      return {
        username,
        credential,
        expiresAt,
        credentialId
      };
    } catch (error) {
      // Audit log failure
      await this.logCredentialAction({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        action: 'generate',
        userId,
        userType,
        clientIp,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        metadata: {
          credentialId
        }
      });

      throw error;
    }
  }

  /**
   * Validates TURN credentials with audit logging
   */
  async validateCredentials(username: string, credential: string, clientIp: string): Promise<boolean> {
    try {
      // Extract timestamp and user ID from username
      const [timestampStr, userId] = username.split(':');
      const timestamp = parseInt(timestampStr, 10);
      const now = Math.floor(Date.now() / 1000);

      // Check if credential is expired
      if (timestamp < now) {
        await this.logCredentialAction({
          id: crypto.randomUUID(),
          timestamp: new Date(),
          action: 'validate',
          userId: userId || 'unknown',
          userType: 'guest', // Default, will be updated if we can determine
          clientIp,
          success: false,
          errorMessage: 'Credential expired',
          metadata: {}
        });
        return false;
      }

      // Validate against current secret
      let isValid = false;
      if (this.currentSecret) {
        const expectedCredential = await this.generateHMAC(username, this.currentSecret);
        isValid = this.constantTimeCompare(credential, expectedCredential);
      }

      // If not valid with current secret, try previous secret (grace period)
      if (!isValid && this.previousSecret) {
        const expectedCredential = await this.generateHMAC(username, this.previousSecret);
        isValid = this.constantTimeCompare(credential, expectedCredential);
      }

      // Check if credential is revoked
      if (isValid && this.redisService) {
        // Try to find credential metadata to check revocation status
        const keys = await this.redisService.keys(`turn:credential:*`);
        for (const key of keys) {
          const metadata = await this.redisService.get<string>(key);
          if (metadata) {
            const credentialData = JSON.parse(metadata);
            if (credentialData.username === username && credentialData.isRevoked) {
              isValid = false;
              break;
            }
          }
        }
      }

      // Audit log
      await this.logCredentialAction({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        action: 'validate',
        userId: userId || 'unknown',
        userType: 'guest', // Default
        clientIp,
        success: isValid,
        errorMessage: isValid ? undefined : 'Invalid credential',
        metadata: {}
      });

      return isValid;
    } catch (error) {
      console.error('Error validating credentials:', error);
      return false;
    }
  }

  /**
   * Rotates the shared secret
   */
  async rotateSharedSecret(): Promise<void> {
    if (!this.config.secretRotation.enabled) {
      console.log('Secret rotation is disabled');
      return;
    }

    try {
      // Move current secret to previous
      this.previousSecret = this.currentSecret;
      
      // Generate new current secret
      this.currentSecret = this.generateSecret();

      // Store both secrets
      await Promise.all([
        this.storeSecret(this.currentSecret, 'current'),
        this.previousSecret ? this.storeSecret(this.previousSecret, 'previous') : Promise.resolve()
      ]);

      // Audit log
      await this.logCredentialAction({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        action: 'rotate',
        userId: 'system',
        userType: 'admin',
        clientIp: 'localhost',
        success: true,
        metadata: {
          rotationId: crypto.randomUUID()
        }
      });

      console.log('Successfully rotated TURN shared secret');
    } catch (error) {
      console.error('Failed to rotate shared secret:', error);
      throw error;
    }
  }

  /**
   * Revokes specific credentials
   */
  async revokeCredentials(credentialId: string, reason: string): Promise<void> {
    if (!this.redisService) {
      return;
    }

    try {
      const credentialKey = `turn:credential:${credentialId}`;
      const metadata = await this.redisService.get<string>(credentialKey);
      
      if (metadata) {
        const credentialData = JSON.parse(metadata);
        credentialData.isRevoked = true;
        credentialData.revokedAt = new Date().toISOString();
        credentialData.revocationReason = reason;

        await this.redisService.set(credentialKey, JSON.stringify(credentialData), 3600); // Keep for 1 hour

        // Audit log
        await this.logCredentialAction({
          id: crypto.randomUUID(),
          timestamp: new Date(),
          action: 'revoke',
          userId: credentialData.userId,
          userType: credentialData.userType,
          clientIp: credentialData.clientIp,
          success: true,
          metadata: {
            credentialId,
            rotationId: reason
          }
        });
      }
    } catch (error) {
      console.error('Failed to revoke credentials:', error);
    }
  }

  /**
   * Gets audit logs for monitoring
   */
  async getAuditLogs(timeRangeHours = 24, userId?: string): Promise<CredentialAuditLog[]> {
    if (!this.config.audit.enabled || !this.redisService) {
      return [];
    }

    try {
      const keys = await this.redisService.keys('turn:audit:*');
      const logs: CredentialAuditLog[] = [];

      for (const key of keys) {
        const logData = await this.redisService.get<string>(key);
        if (logData) {
          const log: CredentialAuditLog = JSON.parse(logData);
          
          // Filter by time range
          const logAge = (Date.now() - new Date(log.timestamp).getTime()) / (1000 * 3600);
          if (logAge > timeRangeHours) continue;
          
          // Filter by user ID if specified
          if (userId && log.userId !== userId) continue;
          
          logs.push(log);
        }
      }

      return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error('Failed to get audit logs:', error);
      return [];
    }
  }

  /**
   * Gets secret rotation information
   */
  async getSecretRotationInfo(): Promise<SecretRotationInfo[]> {
    if (!this.redisService) {
      return [];
    }

    try {
      const [currentInfo, previousInfo] = await Promise.all([
        this.redisService.get<string>('turn:rotation:current'),
        this.redisService.get<string>('turn:rotation:previous')
      ]);

      const rotations: SecretRotationInfo[] = [];
      
      if (currentInfo) {
        rotations.push(JSON.parse(currentInfo));
      }
      
      if (previousInfo) {
        rotations.push(JSON.parse(previousInfo));
      }

      return rotations;
    } catch (error) {
      console.error('Failed to get rotation info:', error);
      return [];
    }
  }

  /**
   * Cleans up expired credentials
   */
  async cleanupExpiredCredentials(): Promise<number> {
    if (!this.redisService) {
      return 0;
    }

    try {
      const keys = await this.redisService.keys('turn:credential:*');
      let cleanedCount = 0;

      for (const key of keys) {
        const metadata = await this.redisService.get<string>(key);
        if (metadata) {
          const credentialData = JSON.parse(metadata);
          const expiresAt = new Date(credentialData.expiresAt);
          
          if (expiresAt < new Date()) {
            await this.redisService.del(key);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired credentials`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup expired credentials:', error);
      return 0;
    }
  }

  private async generateHMAC(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  private async logCredentialAction(log: CredentialAuditLog): Promise<void> {
    if (!this.config.audit.enabled) {
      return;
    }

    try {
      if (this.redisService) {
        const logKey = `turn:audit:${log.timestamp.getTime()}:${log.id}`;
        const ttl = this.config.audit.retentionDays * 24 * 3600; // Convert days to seconds
        
        // Remove sensitive data if not configured to log it
        const logData = { ...log };
        if (!this.config.audit.logSensitiveData) {
          delete logData.metadata.credentialId;
        }

        await this.redisService.set(logKey, JSON.stringify(logData), ttl);
      }

      // Also log to console for immediate visibility
      console.log('TURN Credential Audit:', {
        action: log.action,
        userId: log.userId,
        success: log.success,
        timestamp: log.timestamp.toISOString()
      });
    } catch (error) {
      console.error('Failed to log credential action:', error);
    }
  }
}

/**
 * Factory function to create SecureCredentialManager
 */
export function createSecureCredentialManager(config?: Partial<SecureCredentialConfig>): SecureCredentialManager {
  return new SecureCredentialManager(config);
}