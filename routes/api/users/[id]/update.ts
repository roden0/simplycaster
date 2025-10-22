/**
 * User Update Route
 * 
 * Handles user profile updates using UpdateUserUseCase
 */

import { define } from "../../../../utils.ts";
import { getService } from "../../../../lib/container/global.ts";
import { ServiceKeys } from "../../../../lib/container/registry.ts";
import { UpdateUserUseCase, type UpdateUserInput } from "../../../../lib/application/use-cases/user/index.ts";
import { CachedUserService } from "../../../../lib/infrastructure/services/cached-user-service.ts";
import { ValidationError, EntityNotFoundError, BusinessRuleError } from "../../../../lib/domain/errors/index.ts";
import { requireAuth } from "../../../../lib/middleware/auth.ts";

export const handler = define.handlers({
    PUT: requireAuth(async (req, user, ctx) => {
        try {
            // Get user ID from URL parameters
            const userId = ctx.params.id;

            if (!userId) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "User ID is required",
                        code: "VALIDATION_ERROR"
                    }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" }
                    }
                );
            }

            // Parse request body
            const body = await req.json();

            // Check if user is updating their own profile or is an admin
            if (userId !== user.id && user.role !== 'admin') {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "You can only update your own profile",
                        code: "INSUFFICIENT_PERMISSIONS"
                    }),
                    {
                        status: 403,
                        headers: { "Content-Type": "application/json" }
                    }
                );
            }

            // Use authenticated user as updater
            const input: UpdateUserInput = {
                userId: userId,
                email: body.email,
                currentPassword: body.currentPassword,
                newPassword: body.newPassword,
                role: body.role,
                isActive: body.isActive,
                emailVerified: body.emailVerified,
                updatedBy: user.id
            };

            // Get update user use case from container
            const updateUserUseCase = getService<UpdateUserUseCase>(
                ServiceKeys.UPDATE_USER_USE_CASE
            );

            // Execute user update
            const result = await updateUserUseCase.execute(input);

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

                if (error instanceof EntityNotFoundError) {
                    return new Response(
                        JSON.stringify({
                            success: false,
                            error: error.message,
                            code: error.code
                        }),
                        {
                            status: 404,
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
                        error: "User update failed",
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

            // Warm the cache with the updated user
            try {
                const cachedUserService = getService<CachedUserService>(ServiceKeys.CACHED_USER_SERVICE);
                // The cached user service should have already cached the updated user
                // but we can ensure it's warmed here if needed
            } catch (cacheError) {
                console.error("Error warming cache after user update:", cacheError);
                // Don't fail the request if cache warming fails
            }

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
                            updatedAt: user.updatedAt
                        },
                        message
                    }
                }),
                {
                    status: 200,
                    headers: { 
                        "Content-Type": "application/json",
                        "Cache-Control": "private, no-cache" // Don't cache user profile updates
                    }
                }
            );

        } catch (error) {
            console.error("User update route error:", error);

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