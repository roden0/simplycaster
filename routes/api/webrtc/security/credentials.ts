/**
 * TURN Credential Security Management API
 * 
 * POST /api/webrtc/security/credentials/rotate - Rotate shared secret
 * POST /api/webrtc/security/credentials/revoke - Revoke specific credentials
 * GET /api/webrtc/security/credentials/audit - Get credential audit logs
 */

import { Handlers } from "$fresh/server.ts";
import { createSecureCredentialManager } from "../../../../lib/webrtc/secure-credential-manager.ts";
import { authenticateRequest } from "../../../../lib/middleware/auth.ts";

interface RotateResponse {
  success: boolean;
  message: string;
  rotationId: string;
  timestamp: string;
}

interface RevokeResponse {
  success: boolean;
  message: string;
  revokedCredentialId: string;
  timestamp: string;
}

interface AuditResponse {
  logs: Array<{
    id: string;
    timestamp: string;
    action: string;
    userId: string;
    userType: string;
    clientIp: string;
    success: boolean;
    errorMessage?: string;
  }>;
  totalCount: number;
  timeRange: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

export const handler: Handlers<RotateResponse | RevokeResponse | AuditResponse | ErrorResponse> = {
  async POST(req: Request, _ctx: unknown) {
    try {
      // Require admin authentication for credential management
      const user = await authenticateRequest(req);
      if (!user || user.role !== 'admin') {
        return new Response(
          JSON.stringify({
            error: "FORBIDDEN",
            message: "Admin access required for credential management"
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      const url = new URL(req.url);
      const action = url.pathname.split('/').pop();

      const credentialManager = createSecureCredentialManager();

      if (action === 'rotate') {
        // Rotate shared secret
        const rotationId = crypto.randomUUID();
        
        await credentialManager.rotateSharedSecret();

        const response: RotateResponse = {
          success: true,
          message: "Shared secret rotated successfully",
          rotationId,
          timestamp: new Date().toISOString()
        };

        return new Response(
          JSON.stringify(response),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );

      } else if (action === 'revoke') {
        // Revoke specific credentials
        const body = await req.json();
        const { credentialId, reason } = body;

        if (!credentialId || !reason) {
          return new Response(
            JSON.stringify({
              error: "BAD_REQUEST",
              message: "credentialId and reason are required"
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        await credentialManager.revokeCredentials(credentialId, reason);

        const response: RevokeResponse = {
          success: true,
          message: "Credentials revoked successfully",
          revokedCredentialId: credentialId,
          timestamp: new Date().toISOString()
        };

        return new Response(
          JSON.stringify(response),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );

      } else {
        return new Response(
          JSON.stringify({
            error: "NOT_FOUND",
            message: "Invalid action"
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

    } catch (error) {
      console.error("Error in credential management:", error);

      return new Response(
        JSON.stringify({
          error: "INTERNAL_SERVER_ERROR",
          message: "Failed to perform credential management operation"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  },

  async GET(req: Request, _ctx: unknown) {
    try {
      // Require admin authentication for audit logs
      const user = await authenticateRequest(req);
      if (!user || user.role !== 'admin') {
        return new Response(
          JSON.stringify({
            error: "FORBIDDEN",
            message: "Admin access required for audit logs"
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      const url = new URL(req.url);
      const action = url.pathname.split('/').pop();

      if (action !== 'audit') {
        return new Response(
          JSON.stringify({
            error: "NOT_FOUND",
            message: "Invalid endpoint"
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Get query parameters
      const timeRangeHours = parseInt(url.searchParams.get('timeRange') || '24', 10);
      const userId = url.searchParams.get('userId') || undefined;

      const credentialManager = createSecureCredentialManager();
      const auditLogs = await credentialManager.getAuditLogs(timeRangeHours, userId);

      const response: AuditResponse = {
        logs: auditLogs.map(log => ({
          id: log.id,
          timestamp: log.timestamp.toISOString(),
          action: log.action,
          userId: log.userId,
          userType: log.userType,
          clientIp: log.clientIp,
          success: log.success,
          errorMessage: log.errorMessage
        })),
        totalCount: auditLogs.length,
        timeRange: `${timeRangeHours} hours`
      };

      return new Response(
        JSON.stringify(response),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=60" // Cache for 1 minute
          }
        }
      );

    } catch (error) {
      console.error("Error getting audit logs:", error);

      return new Response(
        JSON.stringify({
          error: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve audit logs"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};