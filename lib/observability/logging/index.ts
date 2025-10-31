/**
 * Logging module - Structured logging with OpenTelemetry trace correlation
 * 
 * This module exports all logging functionality including:
 * - Structured logger interface and implementation
 * - Logger configuration and utilities
 * - Log export to Loki via OTLP
 * - Convenience functions and decorators
 * - Context-aware logger factories
 */

// Export types and interfaces
export type {
  LogLevel,
  LogContext,
  LogEntry,
  LoggerConfig,
  IStructuredLogger,
} from "./structured-logger.ts";

// Export logger implementation and utilities
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
} from "./structured-logger.ts";

// Export log exporter types and interfaces
export type {
  LogExportConfig,
  LokiLabels,
  ILogExporter,
  LogExportStats,
} from "./log-exporter.ts";

// Export log exporter implementation and utilities
export {
  LogExporter,
  createLogExporter,
  logExporter,
  ExportingStructuredLogger,
} from "./log-exporter.ts";