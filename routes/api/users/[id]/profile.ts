/**
 * User Profile Route
 * 
 * Handles getting user profile with caching for better performance
 */

import { define } from "../../../../utils.ts";
import { getService } from "../../../../lib/container/global.ts";
import { ServiceKeys } from "../../../../lib/container/registry.ts";
import { CachedUserService } from "../../../../lib/infrastructure/services/cached-user-service.ts";
import { requireAuth } from "../../../../lib/middleware/auth.ts";

export const handler = define.handlers({
    GET: requireAuth(async (req, user, ctx) => {
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

            // Check if user is accessing their own profile or is an admin
            if (userId !== user.id && user.role !== 'admin') {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "You can only access your own profile",
                        code: "INSUFFICIENT_PERMISSIONS"
                    }),
                    {
                        status: 403,
                        headers: { "Content-Type": "application/json" }
                    }
                );
            }

            // Get cached user service for better performance
            const cachedUserService = getService<CachedUserService>(ServiceKeys.CACHED_USER_SERVICE);

            // Get user profile from cache
            const userProfile = await cachedUserService.getUserById(userId);

            if (!userProfile) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "User not found",
                        code: "USER_NOT_FOUND"
                    }),
                    {
                        status: 404,
                        headers: { "Content-Type": "application/json" }
                    }
                );
            }

            // Success response
            return new Response(
                JSON.stringify({
                    success: true,
                    data: {
                        user: {
                            id: userProfile.id,
                            email: userProfile.email,
                            role: userProfile.role,
                            isActive: userProfile.isActive,
                            emailVerified: userProfile.emailVerified,
                            createdAt: userProfile.createdAt,
                            updatedAt: userProfile.updatedAt,
                            lastLoginAt: userProfile.lastLoginAt
                        }
                    }
                }),
                {
                    status: 200,
                    headers: { 
                        "Content-Type": "application/json",
                        "Cache-Control": "private, max-age=300" // Cache for 5 minutes
                    }
                }
            );

        } catch (error) {
            console.error("User profile route error:", error);

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