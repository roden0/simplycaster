/**
 * Recording Metadata Route
 * 
 * Handles getting recording metadata with caching for better performance
 */

import { define } from "../../../../utils.ts";
import { getService } from "../../../../lib/container/global.ts";
import { ServiceKeys } from "../../../../lib/container/registry.ts";
import { CachedRecordingService } from "../../../../lib/infrastructure/services/cached-recording-service.ts";
import { requireAuth } from "../../../../lib/middleware/auth.ts";

export const handler = define.handlers({
    GET: requireAuth(async (req, user, ctx) => {
        try {
            // Get recording ID from URL parameters
            const recordingId = ctx.params.id;

            if (!recordingId) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "Recording ID is required",
                        code: "VALIDATION_ERROR"
                    }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" }
                    }
                );
            }

            // Get cached recording service for better performance
            const cachedRecordingService = getService<CachedRecordingService>(ServiceKeys.CACHED_RECORDING_SERVICE);

            // Get recording with files from cache
            const recordingWithFiles = await cachedRecordingService.getRecordingWithFiles(recordingId);

            if (!recordingWithFiles) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "Recording not found",
                        code: "RECORDING_NOT_FOUND"
                    }),
                    {
                        status: 404,
                        headers: { "Content-Type": "application/json" }
                    }
                );
            }

            // Check if user has access to this recording
            if (user.role !== 'admin' && recordingWithFiles.createdBy !== user.id) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "You don't have access to this recording",
                        code: "INSUFFICIENT_PERMISSIONS"
                    }),
                    {
                        status: 403,
                        headers: { "Content-Type": "application/json" }
                    }
                );
            }

            // Success response
            return new Response(
                JSON.stringify({
                    success: true,
                    data: {
                        recording: {
                            id: recordingWithFiles.id,
                            roomId: recordingWithFiles.roomId,
                            folderName: recordingWithFiles.folderName,
                            status: recordingWithFiles.status,
                            durationSeconds: recordingWithFiles.durationSeconds,
                            totalSizeBytes: recordingWithFiles.totalSizeBytes,
                            participantCount: recordingWithFiles.participantCount,
                            startedAt: recordingWithFiles.startedAt,
                            stoppedAt: recordingWithFiles.stoppedAt,
                            completedAt: recordingWithFiles.completedAt,
                            createdBy: recordingWithFiles.createdBy,
                            createdAt: recordingWithFiles.createdAt,
                            updatedAt: recordingWithFiles.updatedAt,
                            files: recordingWithFiles.files.map(file => ({
                                id: file.id,
                                fileName: file.fileName,
                                filePath: file.filePath,
                                mimeType: file.mimeType,
                                participantName: file.participantName,
                                participantType: file.participantType,
                                sizeBytes: file.sizeBytes,
                                durationSeconds: file.durationSeconds,
                                uploadedAt: file.uploadedAt
                            }))
                        }
                    }
                }),
                {
                    status: 200,
                    headers: { 
                        "Content-Type": "application/json",
                        "Cache-Control": "private, max-age=600" // Cache for 10 minutes
                    }
                }
            );

        } catch (error) {
            console.error("Recording metadata route error:", error);

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