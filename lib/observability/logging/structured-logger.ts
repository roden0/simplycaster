/**
 * StructuredLogger - Structured logging with OpenTelemetry trace correlation
 * 
 * This module provides:
 * - Logger with trace ID and span ID correlation
 * - Structured log formatting with consistent schema
 * - Context propagation for user and operation tracking
 * - Integration with OpenTelemetry for automatic trace correlation
 */

import { trace } from "npm:@opentelemetry/api@1.7.0";

// ============================================================================
// INTERFACES AND TYPES
// ============================================================================

/**
 * Log levels supported by the structured logger
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log context for additional metadata
 */
export interface LogContext {
  /** Trace ID from OpenTelemetry */
  traceId?: string;
  /** Span ID from OpenTelemetry */
  spanId?: string;
  /** User ID for user-specific operations */
  userId?: string;
  /** Room ID for room-specific operations */
  roomId?: string;
  /** Operation name or identifier */
  operation?: string;
  /** Component or service name */
  component?: string;
  /** Request ID for request correlation */
  requestId?: string;
  /** Session ID for session tracking */
  sessionId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Structured log entry format
 */
export interface LogEntry {
  /** Timestamp in ISO format */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Service name */
  service: string;
  /** Service version */
  version: string;
  /** Environment */
  environment: string;
  /** Trace ID */
  traceId?: string;
  /** Span ID */
  spanId?: string;
  /** User context */
  userId?: string;
  /** Room context */
  roomId?: string;
  /** Operation context */
  operation?: string;
  /** Component context */
  component?: string;
  /** Request context */
  requestId?: string;
  /** Session context */
  sessionId?: string;
  /** Error details if applicable */
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Service name */
  serviceName: string;
  /** Service version */
  serviceVersion: string;
  /** Environment */
  environment: string;
  /** Minimum log level */
  level: LogLevel;
  /** Enable console output */
  enableConsole: boolean;
  /** Enable structured JSON output */
  enableStructured: boolean;
  /** Enable trace correlation */
  enableTraceCorrelation: boolean;
}

/**
 * Structured logger interface
 */
export interface IStructuredLogger {
  /** Log debug message */
  debug(message: string, context?: LogContext): void;
  /** Log info message */
  info(message: string, context?: LogContext): void;
  /** Log warning message */
  warn(message: string, context?: LogContext): void;
  /** Log error message */
  error(message: string, error?: Error, context?: LogContext): void;
  /** Create child logger with additional context */
  child(context: Partial<LogContext>): IStructuredLogger;
  /** Set log level */
  setLevel(level: LogLevel): void;
  /** Get current log level */
  getLevel(): LogLevel;
}

// ============================================================================
// STRUCTURED LOGGER IMPLEMENTATION
// ============================================================================

/**
 * Default logger configuration
 */
const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  serviceName: 'simplycast',
  serviceVersion: '1.0.0',
  environment: 'development',
  level: 'info',
  enableConsole: true,
  enableStructured: true,
  enableTraceCorrelation: true,
};

/**
 * Log level priorities for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * StructuredLogger implementation
 */
export class StructuredLogger implements IStructuredLogger {
  private config: LoggerConfig;
  private baseContext: Partial<LogContext>;

  constructor(config: Partial<LoggerConfig> = {}, baseContext: Partial<LogContext> = {}) {
    this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
    this.baseContext = baseContext;
  }

  /**
   * Log debug message
   */
  debug(message: string, context: LogContext = {}): void {
    this.log('debug', message, undefined, context);
  }

  /**
   * Log info message
   */
  info(message: string, context: LogContext = {}): void {
    this.log('info', message, undefined, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context: LogContext = {}): void {
    this.log('warn', message, undefined, context);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context: LogContext = {}): void {
    this.log('error', message, error, context);
  }

  /**
   * Create child logger with additional context
   */
  child(context: Partial<LogContext>): IStructuredLogger {
    const mergedContext = { ...this.baseContext, ...context };
    return new StructuredLogger(this.config, mergedContext);
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, error?: Error, context: LogContext = {}): void {
    // Check if log level meets minimum threshold
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
      return;
    }

    // Merge contexts
    const mergedContext = { ...this.baseContext, ...context };

    // Get trace context if enabled
    const traceContext = this.config.enableTraceCorrelation ? this.getTraceContext() : {};

    // Create log entry
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.config.serviceName,
      version: this.config.serviceVersion,
      environment: this.config.environment,
      ...traceContext,
      ...mergedContext,
    };

    // Add error details if provided
    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as Error & { code?: string | number }).code,
      };
    }

    // Output log entry
    this.output(logEntry);

    // Also record to active span if available
    if (this.config.enableTraceCorrelation) {
      this.recordToSpan(level, message, logEntry, error);
    }
  }

  /**
   * Get trace context from OpenTelemetry
   */
  private getTraceContext(): Partial<LogContext> {
    try {
      const activeSpan = trace.getActiveSpan();
      if (!activeSpan) {
        return {};
      }

      const spanContext = activeSpan.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };
    } catch (_error) {
      // Silently ignore trace context errors to avoid breaking logging
      return {};
    }
  }

  /**
   * Record log entry to active span
   */
  private recordToSpan(level: LogLevel, message: string, logEntry: LogEntry, error?: Error): void {
    try {
      const activeSpan = trace.getActiveSpan();
      if (!activeSpan) {
        return;
      }

      // Add log event to span
      activeSpan.addEvent(`log.${level}`, {
        'log.severity': level,
        'log.message': message,
        'log.timestamp': logEntry.timestamp,
        ...(logEntry.userId && { 'user.id': logEntry.userId }),
        ...(logEntry.roomId && { 'room.id': logEntry.roomId }),
        ...(logEntry.operation && { 'operation.name': logEntry.operation }),
        ...(logEntry.component && { 'component.name': logEntry.component }),
      });

      // Record exception if error is provided
      if (error) {
        activeSpan.recordException(error);
      }
    } catch (_spanError) {
      // Silently ignore span recording errors to avoid breaking logging
    }
  }

  /**
   * Output log entry to configured destinations
   */
  private output(logEntry: LogEntry): void {
    if (this.config.enableStructured) {
      // Output structured JSON
      console.log(JSON.stringify(logEntry));
    } else if (this.config.enableConsole) {
      // Output human-readable format
      const timestamp = logEntry.timestamp;
      const level = logEntry.level.toUpperCase().padEnd(5);
      const traceInfo = logEntry.traceId ? ` [${logEntry.traceId.slice(0, 8)}]` : '';
      const contextInfo = this.formatContextInfo(logEntry);
      
      console.log(`${timestamp} ${level}${traceInfo}${contextInfo} ${logEntry.message}`);
      
      if (logEntry.error && logEntry.error.stack) {
        console.log(logEntry.error.stack);
      }
    }

    // Export to OTLP/Loki if configured
    this.exportLog(logEntry);
  }

  /**
   * Export log entry to external systems
   */
  private exportLog(logEntry: LogEntry): void {
    try {
      // This will be implemented when the log exporter is integrated
      // For now, we'll use a simple approach that can be enhanced later
      const globalExporter = (globalThis as { logExporter?: { addToBuffer: (logs: LogEntry[]) => void } }).logExporter;
      if (globalExporter && typeof globalExporter.addToBuffer === 'function') {
        globalExporter.addToBuffer([logEntry]);
      }
    } catch (_error) {
      // Silently ignore export errors to avoid breaking logging
    }
  }

  /**
   * Format context information for human-readable output
   */
  private formatContextInfo(logEntry: LogEntry): string {
    const parts: string[] = [];
    
    if (logEntry.userId) parts.push(`user:${logEntry.userId}`);
    if (logEntry.roomId) parts.push(`room:${logEntry.roomId}`);
    if (logEntry.operation) parts.push(`op:${logEntry.operation}`);
    if (logEntry.component) parts.push(`comp:${logEntry.component}`);
    
    return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
  }
}

// ============================================================================
// LOGGER FACTORY AND UTILITIES
// ============================================================================

/**
 * Global logger configuration
 */
let globalLoggerConfig: LoggerConfig = { ...DEFAULT_LOGGER_CONFIG };

/**
 * Configure global logger settings
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalLoggerConfig = { ...globalLoggerConfig, ...config };
}

/**
 * Create a new structured logger instance
 */
export function createLogger(context: Partial<LogContext> = {}): IStructuredLogger {
  return new StructuredLogger(globalLoggerConfig, context);
}

/**
 * Get logger configuration from environment variables
 */
export function getLoggerConfigFromEnv(): Partial<LoggerConfig> {
  return {
    serviceName: Deno.env.get('OTEL_SERVICE_NAME') || 'simplycast',
    serviceVersion: Deno.env.get('OTEL_SERVICE_VERSION') || '1.0.0',
    environment: (Deno.env.get('OTEL_ENVIRONMENT') as 'development' | 'staging' | 'production') || 'development',
    level: (Deno.env.get('LOG_LEVEL') as LogLevel) || 'info',
    enableConsole: Deno.env.get('LOG_ENABLE_CONSOLE') !== 'false',
    enableStructured: Deno.env.get('LOG_ENABLE_STRUCTURED') !== 'false',
    enableTraceCorrelation: Deno.env.get('LOG_ENABLE_TRACE_CORRELATION') !== 'false',
  };
}

/**
 * Initialize logger with environment configuration
 */
export function initializeLogger(): void {
  const envConfig = getLoggerConfigFromEnv();
  configureLogger(envConfig);
}

// ============================================================================
// GLOBAL LOGGER INSTANCE
// ============================================================================

/**
 * Global logger instance
 */
export const logger = createLogger();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Log debug message with global logger
 */
export function debug(message: string, context?: LogContext): void {
  logger.debug(message, context);
}

/**
 * Log info message with global logger
 */
export function info(message: string, context?: LogContext): void {
  logger.info(message, context);
}

/**
 * Log warning message with global logger
 */
export function warn(message: string, context?: LogContext): void {
  logger.warn(message, context);
}

/**
 * Log error message with global logger
 */
export function error(message: string, err?: Error, context?: LogContext): void {
  logger.error(message, err, context);
}

// ============================================================================
// DECORATORS
// ============================================================================

/**
 * Decorator for automatic logging of method calls
 */
export function logged(logLevel: LogLevel = 'debug', includeArgs = false, includeResult = false) {
  return function <T extends (...args: unknown[]) => unknown>(
    target: Record<string, unknown>,
    propertyKey: string,
    descriptor?: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor?.value || target[propertyKey];
    if (!originalMethod || typeof originalMethod !== 'function') return descriptor;

    const wrappedMethod = function (this: unknown, ...args: unknown[]) {
      const className = (target.constructor as { name?: string })?.name || 'Unknown';
      const methodName = `${className}.${propertyKey}`;
      
      const context: LogContext = {
        operation: methodName,
        component: className,
      };

      // Log method entry
      const entryMessage = `Entering ${methodName}`;
      const entryContext = includeArgs ? { ...context, metadata: { args } } : context;
      
      if (logLevel === 'debug') logger.debug(entryMessage, entryContext);
      else if (logLevel === 'info') logger.info(entryMessage, entryContext);
      else if (logLevel === 'warn') logger.warn(entryMessage, entryContext);

      const startTime = Date.now();

      try {
        const result = (originalMethod as (...args: unknown[]) => unknown).apply(this, args);
        
        // Log method success
        const duration = Date.now() - startTime;
        const successMessage = `Completed ${methodName} in ${duration}ms`;
        const successContext = includeResult ? { ...context, metadata: { result, duration } } : { ...context, metadata: { duration } };
        
        if (logLevel === 'debug') logger.debug(successMessage, successContext);
        else if (logLevel === 'info') logger.info(successMessage, successContext);
        else if (logLevel === 'warn') logger.warn(successMessage, successContext);
        
        return result;
      } catch (error) {
        // Log method error
        const duration = Date.now() - startTime;
        const errorMessage = `Failed ${methodName} after ${duration}ms`;
        const errorContext = { ...context, metadata: { duration } };
        
        logger.error(errorMessage, error instanceof Error ? error : new Error(String(error)), errorContext);
        throw error;
      }
    } as T;

    if (descriptor) {
      descriptor.value = wrappedMethod;
      return descriptor;
    } else {
      target[propertyKey] = wrappedMethod;
    }
  };
}

/**
 * Create a logger with specific context for a component
 */
export function createComponentLogger(component: string, additionalContext: Partial<LogContext> = {}): IStructuredLogger {
  return createLogger({ component, ...additionalContext });
}

/**
 * Create a logger with user context
 */
export function createUserLogger(userId: string, additionalContext: Partial<LogContext> = {}): IStructuredLogger {
  return createLogger({ userId, ...additionalContext });
}

/**
 * Create a logger with room context
 */
export function createRoomLogger(roomId: string, additionalContext: Partial<LogContext> = {}): IStructuredLogger {
  return createLogger({ roomId, ...additionalContext });
}

/**
 * Create a logger with operation context
 */
export function createOperationLogger(operation: string, additionalContext: Partial<LogContext> = {}): IStructuredLogger {
  return createLogger({ operation, ...additionalContext });
}