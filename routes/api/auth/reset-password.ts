/**
 * Reset Password API Route
 * 
 * Handles password reset completion by validating tokens,
 * updating user passwords, and cleaning up tokens.
 */

import { Handlers } from "$fresh/server.ts";
import { createResetPasswordUseCase } from "../../../lib/application/use-cases/user/password-reset-factory.ts";
import { Database } from "../../../database/connection.ts";

interface ResetPasswordRequest {
  tokenId: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export const handler: Handlers = {
  async POST(req, ctx) {
    try {
      // Parse request body
      let requestData: ResetPasswordRequest;
      try {
        requestData = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid JSON in request body' 
          }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Validate required fields
      const requiredFields = ['tokenId', 'token', 'newPassword', 'confirmPassword'];
      for (const field of requiredFields) {
        if (!requestData[field as keyof ResetPasswordRequest]) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `${field} is required` 
            }),
            { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      }

      // Get client IP and user agent
      const clientIP = req.headers.get('x-forwarded-for') || 
                      req.headers.get('x-real-ip') || 
                      'unknown';
      const userAgent = req.headers.get('user-agent') || 'unknown';

      // TODO: Add rate limiting (10 attempts per hour per IP)
      // For now, we'll skip rate limiting to keep the implementation simple

      // Get database (simplified approach)
      const database = globalThis.database as Database;
      
      if (!database) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Service temporarily unavailable' 
          }),
          { 
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Create use case with dependencies
      const resetPasswordUseCase = createResetPasswordUseCase(database);

      // Execute password reset
      const result = await resetPasswordUseCase.execute({
        tokenId: requestData.tokenId,
        token: requestData.token,
        newPassword: requestData.newPassword,
        confirmPassword: requestData.confirmPassword,
        ipAddress: clientIP,
        userAgent
      });

      if (!result.success) {
        // Return specific error for password reset failures
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: result.error.message
          }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: result.data.message
        }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );

    } catch (error) {
      console.error('Password reset error:', error);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
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