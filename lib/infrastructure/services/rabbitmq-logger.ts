/**
 * RabbitMQ Structured Logger
 * 
 * Provides structured logging for RabbitMQ event publishing operations
 * with correlation ID tracking and contextual information.
 */

import { DomainEvent } from '../../domain/types/events.ts';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Log context for RabbitMQ operations
 */
export interface RabbitMQLogContext {
  /** Operation being performed */
  operation: string;
  
  /** Event ID if applicable */
  eventId?: string;
  
  /** Event type if applicable */
  eventType?: string;
  
  /** Correlation ID for tracing */
  correlationId?: string;
  
  /** User ID if applicable */
  userId?: string;
  
  /** Session ID if applicable */
  sessionId?: string;
  
  /** Duration of operation in milliseconds */
  durationMs?: number;
  
  /** Additional context data */
  metadata?: Record<string, unknown>;
}

/**
 * Structured log entry
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
  
  /** RabbitMQ specific context */
  context: RabbitMQLogContext;
  
  /** Error information if applicable */
  error?: {
    message: string;
    stack?: string;
    name: string;
  };
}

/**
 * RabbitMQ Structured Logger
 */
export class RabbitMQLogger {
  private serviceName = 'rabbitmq-event-publisher';

  constructor(private minLogLevel: LogLevel = LogLevel.INFO) {}

  /**
   * Log event publishing success
   */
  logPublishSuccess(event: DomainEvent, durationMs: number): void {
    this.log(LogLevel.INFO, 'Event published successfully', {
      operation: 'publish_event',
      eventId: event.id,
      eventType: event.type,
      correlationId: event.correlationId,
      userId: event.userId,
      sessionId: event.sessionId,
      durationMs,
      metadata: {
        version: event.version,
        dataSize: JSON.stringify(event.data).length,
        hasMetadata: !!event.metadata,
      },
    });
  }

  /**
   * Log event publishing failure
   */
  logPublishFailure(event: DomainEvent, error: Error, durationMs: number): void {
    this.log(LogLevel.ERROR, 'Event publishing failed', {
      operation: 'publish_event',
      eventId: event.id,
      eventType: event.type,
      correlationId: event.correlationId,
      userId: event.userId,
      sessionId: event.sessionId,
      durationMs,
      metadata: {
        version: event.version,
        dataSize: JSON.stringify(event.data).length,
        errorType: this.classifyError(error),
      },
    }, error);
  }

  /**
   * Log batch publishing operation
   */
  logBatchPublish(events: DomainEvent[], durationMs: number, successCount: number, failureCount: number): void {
    this.log(LogLevel.INFO, 'Batch publish completed', {
      operation: 'batch_publish',
      durationMs,
      metadata: {
        totalEvents: events.length,
        successCount,
        failureCount,
        successRate: events.length > 0 ? (successCount / events.length) * 100 : 0,
        eventTypes: this.getEventTypeCounts(events),
      },
    });
  }

  /**
   * Log connection events
   */
  logConnectionEvent(event: 'connected' | 'disconnected' | 'reconnecting' | 'error', details?: string): void {
    const level = event === 'error' ? LogLevel.ERROR : LogLevel.INFO;
    
    this.log(level, `RabbitMQ connection ${event}`, {
      operation: 'connection_management',
      metadata: {
        connectionEvent: event,
        details,
      },
    });
  }

  /**
   * Log circuit breaker state changes
   */
  logCircuitBreakerStateChange(
    oldState: string,
    newState: string,
    failureCount: number,
    context?: Record<string, unknown>
  ): void {
    const level = newState === 'OPEN' ? LogLevel.WARN : LogLevel.INFO;
    
    this.log(level, `Circuit breaker state changed: ${oldState} -> ${newState}`, {
      operation: 'circuit_breaker',
      metadata: {
        oldState,
        newState,
        failureCount,
        ...context,
      },
    });
  }

  /**
   * Log retry attempts
   */
  logRetryAttempt(
    event: DomainEvent,
    attemptNumber: number,
    maxAttempts: number,
    error: Error,
    nextRetryDelayMs?: number
  ): void {
    this.log(LogLevel.WARN, `Retry attempt ${attemptNumber}/${maxAttempts} for event`, {
      operation: 'retry_attempt',
      eventId: event.id,
      eventType: event.type,
      correlationId: event.correlationId,
      metadata: {
        attemptNumber,
        maxAttempts,
        nextRetryDelayMs,
        errorType: this.classifyError(error),
      },
    }, error);
  }

  /**
   * Log dead letter queue operations
   */
  logDeadLetterQueue(
    event: DomainEvent,
    reason: string,
    retryAttempts: number,
    context?: Record<string, unknown>
  ): void {
    this.log(LogLevel.ERROR, 'Event sent to dead letter queue', {
      operation: 'dead_letter_queue',
      eventId: event.id,
      eventType: event.type,
      correlationId: event.correlationId,
      userId: event.userId,
      metadata: {
        reason,
        retryAttempts,
        ...context,
      },
    });
  }

  /**
   * Log validation errors
   */
  logValidationError(event: Partial<DomainEvent>, errors: string[]): void {
    this.log(LogLevel.ERROR, 'Event validation failed', {
      operation: 'event_validation',
      eventId: event.id,
      eventType: event.type,
      correlationId: event.correlationId,
      metadata: {
        validationErrors: errors,
        eventData: event.data ? Object.keys(event.data) : [],
      },
    });
  }

  /**
   * Log serialization errors
   */
  logSerializationError(event: DomainEvent, error: Error): void {
    this.log(LogLevel.ERROR, 'Event serialization failed', {
      operation: 'event_serialization',
      eventId: event.id,
      eventType: event.type,
      correlationId: event.correlationId,
      metadata: {
        dataSize: JSON.stringify(event.data).length,
        hasMetadata: !!event.metadata,
      },
    }, error);
  }

  /**
   * Log health check results
   */
  logHealthCheck(healthy: boolean, components: Record<string, boolean>, errors: string[]): void {
    const level = healthy ? LogLevel.INFO : LogLevel.WARN;
    
    this.log(level, `Health check ${healthy ? 'passed' : 'failed'}`, {
      operation: 'health_check',
      metadata: {
        healthy,
        components,
        errors,
      },
    });
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetrics(
    totalPublished: number,
    totalFailed: number,
    averageDurationMs: number,
    eventsPerSecond: number
  ): void {
    this.log(LogLevel.INFO, 'Performance metrics', {
      operation: 'performance_metrics',
      metadata: {
        totalPublished,
        totalFailed,
        successRate: totalPublished + totalFailed > 0 ? 
          (totalPublished / (totalPublished + totalFailed)) * 100 : 0,
        averageDurationMs,
        eventsPerSecond,
      },
    });
  }

  /**
   * Log debug information
   */
  debug(message: string, context: Partial<RabbitMQLogContext> = {}): void {
    this.log(LogLevel.DEBUG, message, {
      operation: 'debug',
      ...context,
    });
  }

  /**
   * Log informational messages
   */
  info(message: string, context: Partial<RabbitMQLogContext> = {}): void {
    this.log(LogLevel.INFO, message, {
      operation: 'info',
      ...context,
    });
  }

  /**
   * Log warning messages
   */
  warn(message: string, context: Partial<RabbitMQLogContext> = {}, error?: Error): void {
    this.log(LogLevel.WARN, message, {
      operation: 'warning',
      ...context,
    }, error);
  }

  /**
   * Log error messages
   */
  error(message: string, context: Partial<RabbitMQLogContext> = {}, error?: Error): void {
    this.log(LogLevel.ERROR, message, {
      operation: 'error',
      ...context,
    }, error);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context: Partial<RabbitMQLogContext>,
    error?: Error
  ): void {
    // Check if log level meets minimum threshold
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.serviceName,
      context: {
        operation: 'unknown',
        ...context,
      },
    };

    // Add error information if provided
    if (error) {
      logEntry.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    }

    // Output structured log
    this.outputLog(logEntry);
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(level);
    const minIndex = levels.indexOf(this.minLogLevel);
    
    return currentIndex >= minIndex;
  }

  /**
   * Output log entry (can be overridden for different outputs)
   */
  private outputLog(logEntry: LogEntry): void {
    // In production, this might go to a structured logging system
    // For now, we'll use console with structured JSON
    
    const logLine = JSON.stringify(logEntry);
    
    switch (logEntry.level) {
      case LogLevel.DEBUG:
        console.debug(logLine);
        break;
      case LogLevel.INFO:
        console.log(logLine);
        break;
      case LogLevel.WARN:
        console.warn(logLine);
        break;
      case LogLevel.ERROR:
        console.error(logLine);
        break;
    }
  }

  /**
   * Classify error type for logging
   */
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('validation')) return 'validation_error';
    if (message.includes('serialization')) return 'serialization_error';
    if (message.includes('connection')) return 'connection_error';
    if (message.includes('timeout')) return 'timeout_error';
    if (message.includes('circuit breaker')) return 'circuit_breaker_error';
    if (message.includes('authentication')) return 'auth_error';
    if (message.includes('authorization')) return 'auth_error';
    if (message.includes('not found')) return 'not_found_error';
    
    return 'unknown_error';
  }

  /**
   * Get event type counts from event array
   */
  private getEventTypeCounts(events: DomainEvent[]): Record<string, number> {
    return events.reduce((counts, event) => {
      counts[event.type] = (counts[event.type] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
  }

  /**
   * Set minimum log level
   */
  setLogLevel(level: LogLevel): void {
    this.minLogLevel = level;
    this.info('Log level changed', { metadata: { newLevel: level } });
  }

  /**
   * Get current log level
   */
  getLogLevel(): LogLevel {
    return this.minLogLevel;
  }
}

/**
 * Factory function to create logger
 */
export function createRabbitMQLogger(minLogLevel: LogLevel = LogLevel.INFO): RabbitMQLogger {
  return new RabbitMQLogger(minLogLevel);
}

/**
 * Global logger instance (can be configured)
 */
export const rabbitMQLogger = createRabbitMQLogger();