/**
 * Example: Traced Room Creation Route
 * 
 * This example shows how to integrate distributed tracing into a room creation route
 * with end-to-end tracing from HTTP request to database operations.
 */

import { define } from "../../../utils.ts";
import { getService } from "../../container/global.ts";
import { ServiceKeys } from "../../container/registry.ts";
import { CreateRoomUseCase, type CreateRoomInput } from "../../application/use-cases/room/index.ts";
import { ValidationError, EntityNotFoundError, BusinessRuleError } from "../../domain/errors/index.ts";

// Import tracing utilities
import { 
  withTracing, 
  withRoleBasedTracing,
  type TracingMiddlewareOptions 
} from "../../middleware/tracing.ts";
import { 
  traceRoomCreationFlow,
  createRoomFlowContext,
  type RoomCreationFlowContext 
} from "../tracing/user-flows.ts";
import { 
  startActiveSpan, 
  addCommonAttributes,
  SpanStatusCode 
} from "../observability-service.ts";

// Tracing options for room creation
const ROOM_CREATION_TRACING_OPTIONS: Partial<TracingMiddlewareOptions> = {
  enableRequestTracing: true,
  enableResponseTracing: true,
  includeRequestBody: true,
  includeResponseBody: false,
  spanNameGenerator: (req) => `POST /api/rooms/create`,
  attributesExtractor: (req, user) => ({
    'room.creation_method': 'api',
    'user.role': user?.role || 'anonymous',
    'request.content_type': req.headers.get('content-type') || '',
  }),
};

/**
 * Traced room creation handler
 */
const tracedRoomCreationHandler = withRoleBasedTracing(
  ['host', 'admin'],
  async (req, user, ctx) => {
    return startActiveSpan(
      'room_creation_api_handler',
      async (span) => {
        try {
          // Parse request body
          const body = await req.json();
          
          // Create room flow context
          const flowContext: RoomCreationFlowContext = createRoomFlowContext(
            user.id,
            body.name,
            {
              maxParticipants: body.maxParticipants,
              allowVideo: body.allowVideo,
            }
          );

          // Add request attributes to span
          span.setAttributes({
            'room.name': body.name || '',
            'room.slug': body.slug || '',
            'room.max_participants': body.maxParticipants || 10,
            'room.allow_video': body.allowVideo !== false,
            'request.body_size': JSON.stringify(body).length,
          });

          // Add common attributes
          addCommonAttributes(span, {
            userId: user.id,
            operation: 'room_creation',
            component: 'room_api',
          });

          // Trace the complete room creation flow
          const result = await traceRoomCreationFlow(
            flowContext,
            async () => {
              // Prepare input for use case
              const input: CreateRoomInput = {
                name: body.name,
                slug: body.slug,
                hostId: user.id,
                maxParticipants: body.maxParticipants,
                allowVideo: body.allowVideo
              };

              // Get create room use case from container
              const createRoomUseCase = await getService<CreateRoomUseCase>(
                ServiceKeys.CREATE_ROOM_USE_CASE
              );

              // Execute room creation with tracing
              return startActiveSpan(
                'create_room_use_case_execution',
                async (useCaseSpan) => {
                  useCaseSpan.setAttributes({
                    'use_case.name': 'CreateRoomUseCase',
                    'use_case.input.host_id': input.hostId,
                    'use_case.input.name': input.name || '',
                  });

                  const result = await createRoomUseCase.execute(input);
                  
                  if (result.success) {
                    useCaseSpan.setAttributes({
                      'use_case.result.room_id': result.data.room.id,
                      'use_case.result.success': true,
                    });
                    useCaseSpan.setStatus({ code: SpanStatusCode.OK });
                  } else {
                    useCaseSpan.setAttributes({
                      'use_case.result.success': false,
                      'use_case.result.error_type': result.error?.constructor.name || 'unknown',
                    });
                    useCaseSpan.recordException(result.error || new Error('Unknown error'));
                    useCaseSpan.setStatus({
                      code: SpanStatusCode.ERROR,
                      message: result.error?.message || 'Use case execution failed',
                    });
                  }

                  return result;
                }
              );
            }
          );

          // Handle use case result
          if (!result.success) {
            const error = result.error;
            
            // Add error attributes to span
            span.setAttributes({
              'error.type': error?.constructor.name || 'unknown',
              'error.message': error?.message || 'unknown',
              'response.status': getErrorStatusCode(error),
            });

            // Record exception
            span.recordException(error || new Error('Unknown error'));
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error?.message || 'Room creation failed',
            });

            return createErrorResponse(error);
          }

          // Success - initialize WebRTC capabilities
          const { room, message } = result.data;
          
          await startActiveSpan(
            'webrtc_initialization',
            async (webrtcSpan) => {
              try {
                webrtcSpan.setAttributes({
                  'webrtc.room_id': room.id,
                  'webrtc.host_id': room.hostId,
                  'webrtc.max_participants': room.maxParticipants,
                });

                const { getWebRTCServiceManager } = await import("../../../lib/webrtc/index.ts");
                const serviceManager = getWebRTCServiceManager();
                const roomCoordinator = serviceManager.getRoomCoordinator();
                
                await roomCoordinator.initializeRoom(room.id, {
                  hostId: room.hostId,
                  maxParticipants: room.maxParticipants,
                  allowVideo: room.allowVideo,
                  roomName: room.name
                });
                
                webrtcSpan.setStatus({ code: SpanStatusCode.OK });
                console.log(`WebRTC capabilities initialized for room ${room.id}`);
                
              } catch (webrtcError) {
                webrtcSpan.recordException(webrtcError instanceof Error ? webrtcError : new Error(String(webrtcError)));
                webrtcSpan.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: 'WebRTC initialization failed',
                });
                console.error("Error initializing WebRTC capabilities:", webrtcError);
                // Don't fail the request if WebRTC initialization fails
              }
            }
          );

          // Add success attributes to span
          span.setAttributes({
            'room.created_id': room.id,
            'room.created_name': room.name || '',
            'response.status': 201,
            'response.success': true,
          });

          span.setStatus({ code: SpanStatusCode.OK });

          // Return success response
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                room: {
                  id: room.id,
                  name: room.name,
                  slug: room.slug,
                  status: room.status,
                  hostId: room.hostId,
                  maxParticipants: room.maxParticipants,
                  allowVideo: room.allowVideo,
                  createdAt: room.createdAt,
                  updatedAt: room.updatedAt
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
          // Record unexpected error
          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Unexpected error in room creation',
          });

          span.setAttributes({
            'error.type': 'unexpected',
            'error.message': error instanceof Error ? error.message : String(error),
            'response.status': 500,
          });

          console.error("Room creation route error:", error);
          
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
    );
  },
  ROOM_CREATION_TRACING_OPTIONS
);

/**
 * Helper function to get error status code
 */
function getErrorStatusCode(error: unknown): number {
  if (error instanceof ValidationError) return 400;
  if (error instanceof EntityNotFoundError) return 404;
  if (error instanceof BusinessRuleError) return 422;
  return 500;
}

/**
 * Helper function to create error response
 */
function createErrorResponse(error: unknown): Response {
  const statusCode = getErrorStatusCode(error);
  
  if (error instanceof ValidationError) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        code: error.code,
        field: error.field
      }),
      {
        status: statusCode,
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
        status: statusCode,
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
        status: statusCode,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // Generic error
  return new Response(
    JSON.stringify({
      success: false,
      error: "Room creation failed",
      code: "INTERNAL_ERROR"
    }),
    {
      status: statusCode,
      headers: { "Content-Type": "application/json" }
    }
  );
}

/**
 * Export the traced handler
 */
export const handler = define.handlers({
  POST: tracedRoomCreationHandler
});