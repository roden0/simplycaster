/**
 * ICE Servers API Endpoint
 * 
 * Provides WebRTC ICE server configuration including STUN/TURN servers
 * with temporary credentials for authenticated users.
 */

import { Handlers } from "$fresh/server.ts";
import { getService } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import { IICEServerService } from "../../../lib/webrtc/ice-server-service.ts";
import { authenticateRequest, authenticateWebSocketConnection } from "../../../lib/middleware/auth.ts";

interface ICEServersResponse {
  iceServers: Array<{
    urls: string[];
    username?: string;
    credential?: string;
    credentialType?: 'password' | 'oauth';
  }>;
  ttl: number;
  expiresAt: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

export const handler: Handlers<ICEServersResponse | ErrorResponse> = {
  async GET(req: Request, _ctx: unknown) {
    try {
      // Try to authenticate as regular user first
      const user = await authenticateRequest(req);
      let participantId: string;
      
      if (user) {
        participantId = user.id;
      } else {
        // Try to authenticate as WebSocket connection (guest)
        const wsAuth = await authenticateWebSocketConnection(req);
        if (!wsAuth) {
          return new Response(
            JSON.stringify({
              error: "UNAUTHORIZED",
              message: "Authentication required to access ICE servers"
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" }
            }
          );
        }
        participantId = wsAuth.participantId;
      }

      // Get ICE server service from container
      const iceServerService = await getService<IICEServerService>(ServiceKeys.ICE_SERVER_SERVICE);

      // Determine user type and get client IP
      const userType = user ? (user.role === 'host' ? 'host' : 'guest') : 'guest';
      const clientIp = req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
                       req.headers.get('X-Real-IP') || 
                       'unknown';

      // Generate ICE server configuration with security checks
      const iceServers = await iceServerService.generateICEServerConfiguration(participantId);

      // Calculate TTL based on TURN credentials (if any)
      const ttl = parseInt(Deno.env.get("TURN_CREDENTIAL_TTL") || "43200", 10); // 12 hours
      const expiresAt = new Date(Date.now() + (ttl * 1000)).toISOString();

      const response: ICEServersResponse = {
        iceServers,
        ttl,
        expiresAt
      };

      return new Response(
        JSON.stringify(response),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `private, max-age=${Math.min(ttl, 3600)}`, // Cache for 1 hour max
            "X-TTL": ttl.toString()
          }
        }
      );

    } catch (error) {
      console.error("Error generating ICE server configuration:", error);

      return new Response(
        JSON.stringify({
          error: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate ICE server configuration"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};

