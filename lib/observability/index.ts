/**
 * ObservabilityService - Main export file for OpenTelemetry observability
 * 
 * This module exports all observability functionality including:
 * - Service initialization and management
 * - Configuration interfaces and utilities
 * - Span creation and management
 * - Metrics recording
 * - Structured logging with trace correlation
 * - Decorators and utilities
 */

// Re-export OpenTelemetry API types and constants
export { SpanStatusCode, SpanKind } from "npm:@opentelemetry/api@1.7.0";
export type { Span, Tracer, Meter, Counter, Histogram } from "npm:@opentelemetry/api@1.7.0";

// Export configuration interfaces and utilities
export type {
  ObservabilityConfig,
  OtelConfig,
  OtlpExporterConfig,
  SamplingConfig,
  ResourceConfig,
  InstrumentationConfig as OtelInstrumentationConfig,
  PerformanceConfig,
  SimplyCasterConfig,
  LgtmConfig,
} from "./config/observability-config.ts";

export {
  DEFAULT_CONFIG,
  loadConfigFromEnv,
  validateConfig,
  loadAndValidateConfig,
  ConfigValidationError,
  getEnvironmentOverrides,
  mergeConfig,
  createEnvironmentConfig,
} from "./config/observability-config.ts";

// Export service interfaces and types
export type {
  IObservabilityService,
  SpanOptions,
  MetricOptions,
  ServiceHealth,
} from "./observability-service.ts";

// Export service implementation and utilities
export {
  ObservabilityService,
  observabilityService,
  initializeObservability,
  createSpan,
  startActiveSpan,
  recordCounter,
  recordHistogram,
  recordGauge,
  getObservabilityHealth,
  shutdownObservability,
  traced,
  metered,
  addCommonAttributes,
  createChildSpan,
} from "./observability-service.ts";

// Export logging interfaces and types
export type {
  LogLevel,
  LogContext,
  LogEntry,
  LoggerConfig,
  IStructuredLogger,
} from "./logging/index.ts";

// Export logging implementation and utilities
export {
  StructuredLogger,
  configureLogger,
  createLogger,
  getLoggerConfigFromEnv,
  initializeLogger,
  logger,
  debug,
  info,
  warn,
  error,
  logged,
  createComponentLogger,
  createUserLogger,
  createRoomLogger,
  createOperationLogger,
} from "./logging/index.ts";

// Export log exporter types and interfaces
export type {
  LogExportConfig,
  LokiLabels,
  ILogExporter,
  LogExportStats,
} from "./logging/index.ts";

// Export log exporter implementation and utilities
export {
  LogExporter,
  createLogExporter,
  logExporter,
  ExportingStructuredLogger,
} from "./logging/index.ts";

// Export instrumentation interfaces and types
export type {
  RoomOperationContext,
  RecordingOperationContext,
  ParticipantOperationContext,
  SignalingContext,
  ConnectionContext,
  MediaStreamContext,
  ConnectionQualityMetrics,
  QueryContext,
  TransactionContext,
  ConnectionPoolContext,
  QueryResult,
  RedisOperationContext,
  CacheOperationContext,
  SessionOperationContext,
  RateLimitContext,
  RedisOperationResult,
  CommonInstrumentationContext,
  InstrumentationConfig,
} from "./instrumentation/index.ts";

// Export instrumentation implementation and utilities
export {
  // Room instrumentation
  RoomInstrumentation,
  instrumentRoomCreation,
  instrumentRoomJoin,
  instrumentRoomLeave,
  instrumentParticipantKick,
  instrumentRecordingStart,
  instrumentRecordingStop,
  instrumentRoomClose,
  recordRoomStatistics,
  
  // WebRTC instrumentation
  WebRTCInstrumentation,
  instrumentSignaling,
  instrumentICECandidate,
  instrumentConnectionEstablishment,
  instrumentMediaStream,
  recordConnectionQuality,
  recordConnectionStateChange,
  recordICEConnectionStateChange,
  
  // Database instrumentation
  DatabaseInstrumentation,
  instrumentQuery,
  instrumentTransaction,
  instrumentConnectionPool,
  recordConnectionPoolStats,
  recordQueryPerformanceStats,
  extractTableName,
  getQueryOperation,
  autoInstrumentQuery,
  
  // Redis instrumentation
  RedisInstrumentation,
  instrumentRedisOperation,
  instrumentCacheOperation,
  instrumentSessionOperation,
  instrumentRateLimit,
  recordRedisConnectionPoolStats,
  recordCacheStats,
  recordSessionStats,
  recordRateLimitStats,
  
  // Instrumentation utilities
  initializeInstrumentation,
  getInstrumentationHealth,
  InstrumentationUtils,
  DEFAULT_INSTRUMENTATION_CONFIG,
} from "./instrumentation/index.ts";

// Export metrics interfaces and types
export type {
  RoomMetricsContext,
  WebRTCMetricsContext,
  RecordingMetricsContext,
  DatabaseMetricsContext,
  CacheMetricsContext,
  SystemMetricsContext,
  IMetricsCollector,
  DatabasePerformanceContext,
  RedisPerformanceContext,
  SystemResourceContext,
  PerformanceThresholds,
  PerformanceAlert,
  InfrastructureHealth,
  IInfrastructureMetrics,
  MetricsServiceHealth,
} from "./metrics/index.ts";

// Export metrics implementation and utilities
export {
  // MetricsCollector
  MetricsCollector,
  metricsCollector,
  initializeMetricsCollector,
  recordRoomOperation,
  recordWebRTCOperation,
  recordRecordingOperation,
  recordDatabaseOperation,
  recordCacheOperation,
  recordSystemMetrics,
  getMetricsCollectorHealth,
  shutdownMetricsCollector,
  
  // InfrastructureMetrics
  InfrastructureMetrics,
  infrastructureMetrics,
  initializeInfrastructureMetrics,
  recordDatabasePerformance,
  recordRedisPerformance,
  recordSystemResources,
  getInfrastructureHealth,
  getPerformanceAlerts,
  shutdownInfrastructureMetrics,
  
  // Unified MetricsService
  MetricsService,
  metricsService,
  initializeMetricsService,
  getMetricsServiceHealth,
  shutdownMetricsService,
  
  // Utilities and decorators
  metricsRecorded,
  recordRoomMetrics,
  recordWebRTCMetrics,
  recordDatabaseMetrics,
  recordCacheMetrics,
} from "./metrics/index.ts";

// Export tracing interfaces and types
export type {
  TraceContext,
  TracePropagationOptions,
  RequestTracingOptions,
  AsyncOperationContext,
  ITraceContextManager,
  TraceCorrelationData,
  SpanContext,
  TraceHeaders,
  HTTPTracingOptions,
  RequestSpanOptions,
  ResponseSpanOptions,
  IHTTPTracer,
  HTTPTraceData,
  RequestMetadata,
  ResponseMetadata,
  AsyncTracingOptions,
  AsyncOperationOptions,
  IAsyncTracer,
  AsyncTraceData,
  OperationMetadata,
  RoomCreationFlowContext,
  RecordingFlowContext,
  AuthFlowContext,
} from "./tracing/index.ts";

// Export tracing implementation and utilities
export {
  // Trace context management
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
  
  // HTTP tracing
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
  
  // Async tracing
  AsyncTracer,
  asyncTracer,
  traceAsyncOperation,
  instrumentAsyncFunction,
  createAsyncSpan,
  correlateAsyncOperations,
  withAsyncTracing,
  trackAsyncOperation,
  DEFAULT_ASYNC_TRACING_OPTIONS,
  
  // User flow tracing
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
} from "./tracing/index.ts";