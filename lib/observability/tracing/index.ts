/**
 * Tracing utilities and context propagation for distributed tracing
 * 
 * This module provides:
 * - Trace context propagation across service boundaries
 * - HTTP request/response tracing utilities
 * - Async operation correlation
 * - Context management utilities
 */

export type {
  TraceContext,
  TracePropagationOptions,
  RequestTracingOptions,
  AsyncOperationContext,
  ITraceContextManager,
  TraceCorrelationData,
  SpanContext,
  TraceHeaders,
} from "./trace-context.ts";

export {
  TraceContextManager,
  traceContextManager,
  propagateTraceContext,
  extractTraceContext,
  injectTraceContext,
  createTraceHeaders,
  parseTraceHeaders,
  correlateAsyncOperation,
  withTraceContext,
  getCurrentTraceContext,
  setTraceContext,
  clearTraceContext,
  createChildContext,
  DEFAULT_TRACE_PROPAGATION_OPTIONS,
} from "./trace-context.ts";

export type {
  HTTPTracingOptions,
  RequestSpanOptions,
  ResponseSpanOptions,
  IHTTPTracer,
  HTTPTraceData,
  RequestMetadata,
  ResponseMetadata,
} from "./http-tracing.ts";

export {
  HTTPTracer,
  httpTracer,
  traceHTTPRequest,
  traceHTTPResponse,
  instrumentHTTPHandler,
  createRequestSpan,
  createResponseSpan,
  extractRequestMetadata,
  extractResponseMetadata,
  addHTTPAttributes,
  withHTTPTracing,
  DEFAULT_HTTP_TRACING_OPTIONS,
} from "./http-tracing.ts";

export type {
  AsyncTracingOptions,
  AsyncOperationOptions,
  IAsyncTracer,
  AsyncTraceData,
  OperationMetadata,
} from "./async-tracing.ts";

export {
  AsyncTracer,
  asyncTracer,
  traceAsyncOperation,
  instrumentAsyncFunction,
  createAsyncSpan,
  correlateAsyncOperations,
  withAsyncTracing,
  trackAsyncOperation,
  DEFAULT_ASYNC_TRACING_OPTIONS,
} from "./async-tracing.ts";

export type {
  RoomCreationFlowContext,
  RecordingFlowContext,
  AuthFlowContext,
} from "./user-flows.ts";

export {
  traceRoomCreationFlow,
  traceRoomJoinFlow,
  traceRecordingFlow,
  traceRecordingStartFlow,
  traceRecordingStopFlow,
  traceAuthFlow,
  traceLoginFlow,
  traceLogoutFlow,
  traceCompleteUserJourney,
  createRoomFlowContext,
  createRecordingFlowContext,
  createAuthFlowContext,
  withRoomFlowTracing,
  withRecordingFlowTracing,
  withAuthFlowTracing,
} from "./user-flows.ts";

// Re-export OpenTelemetry tracing types for convenience
export { SpanStatusCode, SpanKind } from "npm:@opentelemetry/api@1.7.0";
export type { Span, Tracer, Context } from "npm:@opentelemetry/api@1.7.0";