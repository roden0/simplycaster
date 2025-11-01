/**
 * Request Password Reset API Route
 * 
 * Handles password reset requests by validating input,
 * generating secure tokens, and sending reset emails.
 */

import { Handlers } from "$fresh/server.ts";
import { createRequestPasswordResetUseCase } from "../../../lib/application/use-cases/user/password-reset-factory.ts";
import { Database } from "../../../database/connection.ts";
import { EmailService } from "../../../lib/domain/services/email-service.ts";

interface RequestPasswordResetRequest {
  email: string;
}

export const handler: Handlers = {
  async POST(req, ctx) {
    try {
      // Parse request body
      let requestData: RequestPasswordResetRequest;
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
      if (!requestData.email) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Email is required' 
          }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Get client IP and user agent
      const clientIP = req.headers.get('x-forwarded-for') || 
                      req.headers.get('x-real-ip') || 
                      'unknown';
      const userAgent = req.headers.get('user-agent') || 'unknown';

      // TODO: Add rate limiting (5 requests per hour per IP)
      // For now, we'll skip rate limiting to keep the implementation simple

      // Get database and email service (simplified approach)
      const database = globalThis.database as Database;
      const emailService = globalThis.emailService as EmailService;
      
      if (!database || !emailService) {
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
      const requestPasswordResetUseCase = createRequestPasswordResetUseCase(database, emailService);

      // Execute password reset request
      const result = await requestPasswordResetUseCase.execute({
        email: requestData.email.toLowerCase().trim(),
        ipAddress: clientIP,
        userAgent
      });

      if (!result.success) {
        // Log error for debugging but don't expose details
        console.error('Password reset request failed:', result.error);
        
        return new Response(
          JSON.stringify({ 
            success: true, // Always return success to prevent email enumeration
            message: 'If an account with that email exists, a password reset link has been sent.'
          }),
          { 
            status: 200,
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
      console.error('Password reset request error:', error);
      
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