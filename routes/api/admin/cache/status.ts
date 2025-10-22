/**
 * Cache Status Route
 * 
 * Handles getting cache system status for administrators
 */

import { define } from "../../../../utils.ts";
import { getService } from "../../../../lib/container/global.ts";
import { ServiceKeys } from "../../../../lib/container/registry.ts";
import { CacheWarmingService } from "../../../../lib/infrastructure/services/cache-warming-service.ts";
import { RedisService } from "../../../../lib/domain/services/redis-service.ts";
import { requireRole } from "../../../../lib/middleware/auth.ts";

export const handler = define.handlers({
    GET: requireRole(['admin'])(async (req, user) => {
        try {
            // Get services
            const cacheWarmingService = getService<CacheWarmingService>(ServiceKeys.CACHE_WARMING_SERVICE);
            const redisService = getService<RedisService>(ServiceKeys.REDIS_SERVICE);

            // Get cache warming status
            const cacheWarmingStatus = cacheWarmingService.getStatus();

            // Check Redis health
            const redisHealthy = await redisService.ping();

            // Get some basic cache statistics
            let cacheStats = null;
            try {
                // Try to get some basic Redis info (this is implementation-specific)
                // For now, we'll just check connectivity
                cacheStats = {
                    redisConnected: redisHealthy,
                    lastChecked: new Date().toISOString()
                };
            } catch (error) {
                console.error("Error getting cache stats:", error);
                cacheStats = {
                    redisConnected: false,
                    error: error instanceof Error ? error.message : String(error),
                    lastChecked: new Date().toISOString()
                };
            }

            // Success response
            return new Response(
                JSON.stringify({
                    success: true,
                    data: {
                        cacheWarming: cacheWarmingStatus,
                        redis: cacheStats,
                        system: {
                            timestamp: new Date().toISOString(),
                            requestedBy: user.email
                        }
                    }
                }),
                {
                    status: 200,
                    headers: { 
                        "Content-Type": "application/json",
                        "Cache-Control": "no-cache" // Don't cache status responses
                    }
                }
            );

        } catch (error) {
            console.error("Cache status route error:", error);

            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Failed to get cache status",
                    code: "CACHE_STATUS_FAILED",
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