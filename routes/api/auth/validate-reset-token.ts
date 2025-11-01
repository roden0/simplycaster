/**
 * Validate Reset Token API Route
 * 
 * Validates password reset tokens without consuming them.
 * Used by the frontend to check if a token is valid before showing the reset form.
 */

import { Handlers } from "$fresh/server.ts";
import { JWTTokenService } from "../../../lib/infrastructure/services/jwt-token-service.ts";
import { Database } from "../../../database/connection.ts";
import { passwordResetTokens } from "../../../database/schema.ts";
import { eq, and, isNull, gte } from 'drizzle-orm';

export const handler: Handlers = {
  async GET(req, ctx) {
    try {
      const url = new URL(req.url);
      const tokenId = url.searchParams.get('tokenId');
      const token = url.searchParams.get('token');

      // Validate required parameters
      if (!tokenId || !token) {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: 'Token ID and token are required' 
          }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Get services (simplified approach)
      const tokenService = new JWTTokenService();
      const db = globalThis.database as Database;
      
      if (!db) {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: 'Service temporarily unavailable' 
          }),
          { 
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Find token record
      const tokenRecords = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.id, tokenId),
            isNull(passwordResetTokens.usedAt),
            gte(passwordResetTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!tokenRecords[0]) {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: 'Invalid or expired reset token' 
          }),
          { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      const tokenRecord = tokenRecords[0];

      // Verify token hash
      const hashVerificationResult = await tokenService.verifyTokenHash(token, tokenRecord.tokenHash);
      if (!hashVerificationResult.success || !hashVerificationResult.data) {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            error: 'Invalid reset token' 
          }),
          { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Calculate time remaining
      const now = new Date();
      const expiresAt = new Date(tokenRecord.expiresAt);
      const timeRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));

      return new Response(
        JSON.stringify({
          valid: true,
          expiresAt: expiresAt.toISOString(),
          timeRemaining, // seconds
          message: 'Token is valid'
        }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );

    } catch (error) {
      console.error('Token validation error:', error);
      
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Internal server error' 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
};