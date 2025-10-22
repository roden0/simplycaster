/**
 * Authentication Login Route
 * 
 * Handles user login using AuthenticateUserUseCase
 */

import { define } from "../../../utils.ts";
import { getContainer, getService } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import { AuthenticateUserUseCase, type AuthenticateUserInput } from "../../../lib/application/use-cases/user/index.ts";
import { ValidationError, AuthenticationError } from "../../../lib/domain/errors/index.ts";

export const handler = define.handlers({
  async POST(req) {
    try {
      // Parse request body
      const body = await req.json();
      
      // Validate required fields
      if (!body.email || !body.password) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Email and password are required",
            code: "VALIDATION_ERROR"
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Get client IP and user agent for security logging
      const clientIP = req.headers.get("x-forwarded-for") || 
                      req.headers.get("x-real-ip") || 
                      "unknown";
      const userAgent = req.headers.get("user-agent") || "unknown";

      // Prepare input for use case
      const input: AuthenticateUserInput = {
        email: body.email,
        password: body.password,
        ipAddress: clientIP,
        userAgent: userAgent
      };

      // Get authentication use case from container
      const authenticateUserUseCase = await getService<AuthenticateUserUseCase>(
        ServiceKeys.AUTHENTICATE_USER_USE_CASE
      );

      // Execute authentication
      const result = await authenticateUserUseCase.execute(input);

      if (!result.success) {
        // Handle different error types
        const error = result.error;
        
        if (error instanceof ValidationError) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error.message,
              code: error.code,
              field: error.field
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        if (error instanceof AuthenticationError) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error.message,
              code: error.code
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        // Generic error
        return new Response(
          JSON.stringify({
            success: false,
            error: "Authentication failed",
            code: "AUTHENTICATION_ERROR"
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Success response
      const { user, token, expiresAt, message } = result.data;
      
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              role: user.role,
              isActive: user.isActive,
              emailVerified: user.emailVerified
            },
            token,
            expiresAt: expiresAt.toISOString(),
            message
          }
        }),
        {
          status: 200,
          headers: { 
            "Content-Type": "application/json",
            // Set secure HTTP-only cookie for token
            "Set-Cookie": `auth_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Expires=${expiresAt.toUTCString()}`
          }
        }
      );

    } catch (error) {
      console.error("Login route error:", error);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: "Internal server error",
          code: "INTERNAL_ERROR"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
});