/**
 * Cache Warming Route
 * 
 * Handles manual cache warming trigger for administrators
 */

import { define } from "../../../../utils.ts";
import { getService } from "../../../../lib/container/global.ts";
import { ServiceKeys } from "../../../../lib/container/registry.ts";
import { CacheWarmingService } from "../../../../lib/infrastructure/services/cache-warming-service.ts";
import { requireRole } from "../../../../lib/middleware/auth.ts";

export const handler = define.handlers({
    POST: requireRole(['admin'])(async (req, user) => {
        try {
            // Get cache warming service
            const cacheWarmingService = await getService<CacheWarmingService>(ServiceKeys.CACHE_WARMING_SERVICE);

            // Get current status before warming
            const statusBefore = cacheWarmingService.getStatus();

            if (statusBefore.isWarming) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "Cache warming is already in progress",
                        code: "CACHE_WARMING_IN_PROGRESS"
                    }),
                    {
                        status: 409,
                        headers: { "Content-Type": "application/json" }
                    }
                );
            }

            // Trigger manual cache warming
            const startTime = Date.now();
            await cacheWarmingService.triggerManualWarming();
            const duration = Date.now() - startTime;

            // Get status after warming
            const statusAfter = cacheWarmingService.getStatus();

            // Success response
            return new Response(
                JSON.stringify({
                    success: true,
                    data: {
                        message: "Cache warming completed successfully",
                        duration: `${duration}ms`,
                        statusBefore,
                        statusAfter,
                        triggeredBy: user.email,
                        triggeredAt: new Date().toISOString()
                    }
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                }
            );

        } catch (error) {
            console.error("Cache warming route error:", error);

            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Failed to warm cache",
                    code: "CACHE_WARMING_FAILED",
                    details: error instanceof Error ? error.message : String(error)
                }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" }
                }
            );
        }
    })
});