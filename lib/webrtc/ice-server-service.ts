/**
 * ICE Server Configuration Service
 * 
 * Manages ICE server endpoints and generates WebRTC-compatible
 * configuration objects with STUN/TURN server information.
 */

import { ITurnCredentialService, TurnCredentials } from "./turn-credential-service.ts";

export interface ICEServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
  credentialType?: 'password' | 'oauth';
}

export interface ICEServerEnvironmentConfig {
  stunUrls: string[];
  turnUrls: string[];
  host: string;
  port: number;
  turnsPort: number;
  realm: string;
  isSecure: boolean;
}

export interface IICEServerService {
  generateICEServerConfiguration(userId: string): Promise<ICEServerConfig[]>;
  getEnvironmentConfiguration(): ICEServerEnvironmentConfig;
  validateICEServerConfig(config: ICEServerConfig[]): boolean;
  refreshCredentials(userId: string): Promise<TurnCredentials>;
}

export class ICEServerService implements IICEServerService {
  private readonly turnCredentialService: ITurnCredentialService;
  private readonly environmentConfig: ICEServerEnvironmentConfig;

  constructor(
    turnCredentialService: ITurnCredentialService,
    environmentConfig?: Partial<ICEServerEnvironmentConfig>
  ) {
    this.turnCredentialService = turnCredentialService;
    this.environmentConfig = this.loadEnvironmentConfiguration(environmentConfig);
  }

  /**
   * Generates complete ICE server configuration for WebRTC client
   */
  async generateICEServerConfiguration(userId: string): Promise<ICEServerConfig[]> {
    const config: ICEServerConfig[] = [];

    // Add STUN servers (no authentication required)
    if (this.environmentConfig.stunUrls.length > 0) {
      config.push({
        urls: this.environmentConfig.stunUrls
      });
    }

    // Add TURN servers with credentials
    if (this.environmentConfig.turnUrls.length > 0) {
      try {
        const turnCredentials = await this.turnCredentialService.generateTurnCredentials(userId);
        
        config.push({
          urls: this.environmentConfig.turnUrls,
          username: turnCredentials.username,
          credential: turnCredentials.credential,
          credentialType: 'password'
        });
      } catch (error) {
        console.error("Failed to generate TURN credentials:", error);
        // Continue without TURN servers rather than failing completely
      }
    }

    // Add fallback public STUN servers if no local STUN is configured
    if (config.length === 0 || !this.hasStunServers(config)) {
      config.push({
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302'
        ]
      });
    }

    return config;
  }

  /**
   * Gets the current environment configuration
   */
  getEnvironmentConfiguration(): ICEServerEnvironmentConfig {
    return { ...this.environmentConfig };
  }

  /**
   * Validates ICE server configuration array
   */
  validateICEServerConfig(config: ICEServerConfig[]): boolean {
    if (!Array.isArray(config) || config.length === 0) {
      return false;
    }

    return config.every(server => {
      // Check if urls array exists and is not empty
      if (!Array.isArray(server.urls) || server.urls.length === 0) {
        return false;
      }

      // Validate URL formats
      return server.urls.every(url => {
        try {
          const urlObj = new URL(url);
          return ['stun:', 'turn:', 'turns:'].some(protocol => 
            url.startsWith(protocol)
          );
        } catch {
          return false;
        }
      });
    });
  }

  /**
   * Refreshes TURN credentials for a user
   */
  async refreshCredentials(userId: string): Promise<TurnCredentials> {
    return await this.turnCredentialService.generateTurnCredentials(userId);
  }

  /**
   * Loads ICE server configuration from environment variables
   */
  private loadEnvironmentConfiguration(override?: Partial<ICEServerEnvironmentConfig>): ICEServerEnvironmentConfig {
    const host = override?.host || Deno.env.get("COTURN_HOST") || "localhost";
    const port = override?.port || parseInt(Deno.env.get("COTURN_PORT") || "3478", 10);
    const turnsPort = override?.turnsPort || parseInt(Deno.env.get("COTURN_TURNS_PORT") || "5349", 10);
    const realm = override?.realm || Deno.env.get("COTURN_REALM") || "simplycast.local";
    const isSecure = override?.isSecure ?? (Deno.env.get("NODE_ENV") === "production");

    // Build STUN URLs
    const stunUrls = override?.stunUrls || [
      `stun:${host}:${port}`
    ];

    // Build TURN URLs (both UDP and TCP)
    const turnUrls = override?.turnUrls || [
      `turn:${host}:${port}?transport=udp`,
      `turn:${host}:${port}?transport=tcp`
    ];

    // Add TURNS (TLS) URLs for production
    if (isSecure) {
      turnUrls.push(`turns:${host}:${turnsPort}?transport=tcp`);
    }

    return {
      stunUrls,
      turnUrls,
      host,
      port,
      turnsPort,
      realm,
      isSecure
    };
  }

  /**
   * Checks if configuration includes STUN servers
   */
  private hasStunServers(config: ICEServerConfig[]): boolean {
    return config.some(server => 
      server.urls.some(url => url.startsWith('stun:'))
    );
  }
}

/**
 * Factory function to create ICEServerService with dependencies
 */
export function createICEServerService(
  turnCredentialService: ITurnCredentialService,
  environmentConfig?: Partial<ICEServerEnvironmentConfig>
): ICEServerService {
  return new ICEServerService(turnCredentialService, environmentConfig);
}