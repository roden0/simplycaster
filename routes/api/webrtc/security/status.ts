/**
 * TURN Security Status API
 * 
 * GET /api/webrtc/security/status - Get TURN server security status and metrics
 */

import { Handlers } from "$fresh/server.ts";
import { createTurnSecurityService } from "../../../../lib/webrtc/turn-security-service.ts";
import { createSecureCredentialManager } from "../../../../lib/webrtc/secure-credential-manager.ts";
import { authenticateRequest } from "../../../../lib/middleware/auth.ts";

interface SecurityStatusResponse {
  timestamp: string;
  status: 'secure' | 'warning' | 'critical';
  summary: {
    totalViolations: number;
    activeBlocks: number;
    credentialsGenerated: number;
    secretRotationStatus: 'current' | 'due' | 'overdue';
  };
  violations: {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  rateLimiting: {
    credentialRequestsBlocked: number;
    connectionAttemptsBlocked: number;
  };
  ipRestrictions: {
    blockedIps: number;
    temporaryBlocks: number;
  };
  bandwidthQuotas: {
    quotaExceeded: number;
    averageUsage: number;
  };
  credentialSecurity: {
    rotationInfo: Array<{
      id: string;
      createdAt: string;
      expiresAt: string;
      isActive: boolean;
    }>;
    auditLogCount: number;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
}

export const handler: Handlers<SecurityStatusResponse | ErrorResponse> = {
  async GET(req: Request, _ctx: unknown) {
    try {
      // Require admin authentication for security status
      const user = await authenticateRequest(req);
      if (!user || user.role !== 'admin') {
        return new Response(
          JSON.stringify({
            error: "FORBIDDEN",
            message: "Admin access required for security status"
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Get query parameters
      const url = new URL(req.url);
      const timeRange = parseInt(url.searchParams.get('timeRange') || '3600', 10); // Default 1 hour

      // Create services
      const securityService = createTurnSecurityService();
      const credentialManager = createSecureCredentialManager();

      // Get security metrics and credential info
      const [securityMetrics, rotationInfo, auditLogs] = await Promise.all([
        securityService.getSecurityMetrics(timeRange),
        credentialManager.getSecretRotationInfo(),
        credentialManager.getAuditLogs(timeRange / 3600) // Convert seconds to hours
      ]);

      // Determine overall security status
      let status: 'secure' | 'warning' | 'critical' = 'secure';
      
      if (securityMetrics.violations.bySeverity.critical > 0) {
        status = 'critical';
      } else if (
        securityMetrics.violations.bySeverity.high > 0 ||
        securityMetrics.violations.total > 50 ||
        securityMetrics.bandwidthQuotas.quotaExceeded > 10
      ) {
        status = 'warning';
      }

      // Check secret rotation status
      let secretRotationStatus: 'current' | 'due' | 'overdue' = 'current';
      const currentRotation = rotationInfo.find(r => r.isActive);
      if (currentRotation) {
        const ageHours = (Date.now() - new Date(currentRotation.createdAt).getTime()) / (1000 * 3600);
        if (ageHours > 168) { // 7 days
          secretRotationStatus = ageHours > 336 ? 'overdue' : 'due'; // 14 days = overdue
        }
      }

      const response: SecurityStatusResponse = {
        timestamp: new Date().toISOString(),
        status,
        summary: {
          totalViolations: securityMetrics.violations.total,
          activeBlocks: securityMetrics.ipRestrictions.temporaryBlocks,
          credentialsGenerated: auditLogs.filter(log => log.action === 'generate' && log.success).length,
          secretRotationStatus
        },
        violations: securityMetrics.violations,
        rateLimiting: securityMetrics.rateLimiting,
        ipRestrictions: securityMetrics.ipRestrictions,
        bandwidthQuotas: securityMetrics.bandwidthQuotas,
        credentialSecurity: {
          rotationInfo: rotationInfo.map(info => ({
            id: info.id,
            createdAt: info.createdAt.toISOString(),
            expiresAt: info.expiresAt.toISOString(),
            isActive: info.isActive
          })),
          auditLogCount: auditLogs.length
        }
      };

      return new Response(
        JSON.stringify(response),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=30" // Cache for 30 seconds
          }
        }
      );

    } catch (error) {
      console.error("Error getting security status:", error);

      return new Response(
        JSON.stringify({
          error: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve security status"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};