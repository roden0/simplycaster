/**
 * Recording Statistics Route
 * 
 * Handles getting recording statistics with caching for better performance
 */

import { define } from "../../../utils.ts";
import { getService } from "../../../lib/container/global.ts";
import { ServiceKeys } from "../../../lib/container/registry.ts";
import { CachedRecordingService } from "../../../lib/infrastructure/services/cached-recording-service.ts";
import { requireAuth } from "../../../lib/middleware/auth.ts";

export const handler = define.handlers({
    GET: requireAuth(async (req, user) => {
        try {
            // Parse query parameters
            const url = new URL(req.url);
            const userId = url.searchParams.get("userId");

            // Determine which user's stats to get
            let targetUserId = user.id;
            
            if (userId) {
                // Only admin can get stats for other users
                if (user.role !== 'admin') {
                    return new Response(
                        JSON.stringify({
                            success: false,
                            error: "You can only access your own recording statistics",
                            code: "INSUFFICIENT_PERMISSIONS"
                        }),
                        {
                            status: 403,
                            headers: { "Content-Type": "application/json" }
                        }
                    );
                }
                targetUserId = userId;
            }

            // Get cached recording service for better performance
            const cachedRecordingService = await getService<CachedRecordingService>(ServiceKeys.CACHED_RECORDING_SERVICE);

            // Get recording statistics from cache
            const stats = await cachedRecordingService.getRecordingStats(targetUserId);

            // Success response
            return new Response(
                JSON.stringify({
                    success: true,
                    data: {
                        userId: targetUserId,
                        statistics: {
                            totalRecordings: stats.totalRecordings,
                            totalDurationSeconds: stats.totalDuration,
                            totalSizeBytes: stats.totalSize,
                            averageDurationSeconds: stats.totalRecordings > 0 
                                ? Math.round(stats.totalDuration / stats.totalRecordings) 
                                : 0,
                            averageSizeBytes: stats.totalRecordings > 0 
                                ? Math.round(stats.totalSize / stats.totalRecordings) 
                                : 0
                        }
                    }
                }),
                {
                    status: 200,
                    headers: { 
                        "Content-Type": "application/json",
                        "Cache-Control": "private, max-age=900" // Cache for 15 minutes
                    }
                }
            );

        } catch (error) {
            console.error("Recording statistics route error:", error);

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