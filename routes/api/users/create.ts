/**
 * User Creation Route
 * 
 * Handles user registration using CreateUserUseCase
 */

import { define } from "../../../utils.ts";
import { getService } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import { CreateUserUseCase, type CreateUserInput } from "../../../lib/application/use-cases/user/index.ts";
import { ValidationError, ConflictError, BusinessRuleError } from "../../../lib/domain/errors/index.ts";
import { UserRole } from "../../../lib/domain/types/common.ts";
import { requireRole } from "../../../lib/middleware/auth.ts";

export const handler = define.handlers({
  POST: requireRole('admin')(async (req, user) => {
    try {
      // Parse request body
      const body = await req.json();
      
      // Validate required fields
      if (!body.email || !body.password || !body.role) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Email, password, and role are required",
            code: "VALIDATION_ERROR"
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Validate role
      if (!Object.values(UserRole).includes(body.role)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid role specified",
            code: "VALIDATION_ERROR",
            field: "role"
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Use authenticated user as creator
      const input: CreateUserInput = {
        email: body.email,
        password: body.password,
        role: body.role,
        isActive: body.isActive ?? true,
        emailVerified: body.emailVerified ?? false,
        createdBy: user.id
      };

      // Get create user use case from container
      const createUserUseCase = getService<CreateUserUseCase>(
        ServiceKeys.CREATE_USER_USE_CASE
      );

      // Execute user creation
      const result = await createUserUseCase.execute(input);

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

        if (error instanceof ConflictError) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error.message,
              code: error.code
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        if (error instanceof BusinessRuleError) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error.message,
              code: error.code,
              rule: error.rule
            }),
            {
              status: 422,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        // Generic error
        return new Response(
          JSON.stringify({
            success: false,
            error: "User creation failed",
            code: "INTERNAL_ERROR"
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Success response
      const { user, message } = result.data;
      
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              role: user.role,
              isActive: user.isActive,
              emailVerified: user.emailVerified,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt
            },
            message
          }
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" }
        }
      );

    } catch (error) {
      console.error("User creation route error:", error);
      
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
  })
});