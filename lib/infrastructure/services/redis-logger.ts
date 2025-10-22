/**
 * Redis Logger Service
 * 
 * Provides structured logging for Redis operations with performance tracking,
 * audit logging, and configurable log levels for monitoring and debugging.
 */

export interface RedisLogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  operation: string;
  key?: string;
  duration?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
  context?: {
    userId?: string;
    sessionId?: string;
    requestId?: string;
    userAgent?: string;
    ipAddress?: string;
  };
}

export interface RedisLoggerConfig {
  enableOperationLogging: boolean;
  enablePerformanceLogging: boolean;
  enableAuditLogging: boolean;
  enableSlowQueryLogging: boolean;
  slowQueryThresholdMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxLogEntries: number;
  retainLogsHours: number;
  enableConsoleOutput: boolean;
  enableFileOutput: boolean;
  logFilePath?: string;
}

export class RedisLogger {
  private config: RedisLoggerConfig;
  private logEntries: RedisLogEntry[] = [];
  private performanceMetrics = new Map<string, number[]>();
  private cleanupTimer?: number;

  constructor(config: Partial<RedisLoggerConfig> = {}) {
    this.config = {
      enableOperationLogging: true,
      enablePerformanceLogging: true,
      enableAuditLogging: true,
      enableSlowQueryLogging: true,
      slowQueryThresholdMs: 50,
      logLevel: 'info',
      maxLogEntries: 10000,
      retainLogsHours: 24,
      enableConsoleOutput: true,
      enableFileOutput: false,
      ...config,
    };

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Log Redis operation
   */
  logOperation(
    operation: string,
    key: string | undefined,
    duration: number | undefined,
    success: boolean,
    error?: Error,
    metadata?: Record<string, any>,
    context?: RedisLogEntry['context']
  ): void {
    if (!this.config.enableOperationLogging) return;

    const level = this.determineLogLevel(success, duration, error);
    
    // Skip if below configured log level
    if (!this.shouldLog(level)) return;

    const logEntry: RedisLogEntry = {
      timestamp: new Date(),
      level,
      operation,
      key,
      duration,
      success,
      error: error?.message,
      metadata,
      context,
    };

    this.addLogEntry(logEntry);

    // Track performance metrics
    if (this.config.enablePerformanceLogging && duration !== undefined) {
      this.trackPerformanceMetric(operation, duration);
    }

    // Log slow queries
    if (this.config.enableSlowQueryLogging && 
        duration !== undefined && 
        duration > this.config.slowQueryThresholdMs) {
      this.logSlowQuery(operation, key, duration, metadata);
    }
  }

  /**
   * Log cache operation (hit/miss)
   */
  logCacheOperation(
    operation: 'hit' | 'miss' | 'invalidation',
    key: string,
    duration?: number,
    metadata?: Record<string, any>,
    context?: RedisLogEntry['context']
  ): void {
    if (!this.config.enableOperationLogging) return;

    this.logOperation(
      `cache_${operation}`,
      key,
      duration,
      true,
      undefined,
      { cacheOperation: operation, ...metadata },
      context
    );
  }

  /**
   * Log audit event
   */
  logAuditEvent(
    action: string,
    key: string | undefined,
    success: boolean,
    metadata?: Record<string, any>,
    context?: RedisLogEntry['context']
  ): void {
    if (!this.config.enableAuditLogging) return;

    const logEntry: RedisLogEntry = {
      timestamp: new Date(),
      level: success ? 'info' : 'warn',
      operation: `audit_${action}`,
      key,
      success,
      metadata: { auditEvent: true, ...metadata },
      context,
    };

    this.addLogEntry(logEntry);
  }

  /**
   * Log connection event
   */
  logConnectionEvent(
    event: 'connect' | 'disconnect' | 'reconnect' | 'error',
    success: boolean,
    error?: Error,
    metadata?: Record<string, any>
  ): void {
    const level = success ? 'info' : 'error';
    
    const logEntry: RedisLogEntry = {
      timestamp: new Date(),
      level,
      operation: `connection_${event}`,
      success,
      error: error?.message,
      metadata: { connectionEvent: true, ...metadata },
    };

    this.addLogEntry(logEntry);
  }

  /**
   * Log performance alert
   */
  logPerformanceAlert(
    alertType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    message: string,
    metrics?: Record<string, any>
  ): void {
    const level = severity === 'critical' ? 'error' : severity === 'high' ? 'warn' : 'info';
    
    const logEntry: RedisLogEntry = {
      timestamp: new Date(),
      level,
      operation: `alert_${alertType}`,
      success: false,
      metadata: { 
        alertType, 
        severity, 
        message, 
        performanceAlert: true,
        ...metrics 
      },
    };

    this.addLogEntry(logEntry);
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(
    limit: number = 100,
    level?: RedisLogEntry['level'],
    operation?: string
  ): RedisLogEntry[] {
    let logs = [...this.logEntries];

    // Filter by level
    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    // Filter by operation
    if (operation) {
      logs = logs.filter(log => log.operation.includes(operation));
    }

    // Sort by timestamp (newest first) and limit
    return logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): Record<string, {
    count: number;
    average: number;
    min: number;
    max: number;
    p95: number;
  }> {
    const summary: Record<string, any> = {};

    for (const [operation, times] of this.performanceMetrics.entries()) {
      if (times.length === 0) continue;

      const sorted = [...times].sort((a, b) => a - b);
      const sum = times.reduce((a, b) => a + b, 0);

      summary[operation] = {
        count: times.length,
        average: sum / times.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p95: sorted[Math.floor(sorted.length * 0.95)],
      };
    }

    return summary;
  }

  /**
   * Get error summary
   */
  getErrorSummary(hours: number = 1): {
    totalErrors: number;
    errorsByOperation: Record<string, number>;
    recentErrors: RedisLogEntry[];
  } {
    const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
    const recentErrors = this.logEntries.filter(
      log => log.timestamp >= cutoff && !log.success
    );

    const errorsByOperation: Record<string, number> = {};
    for (const error of recentErrors) {
      errorsByOperation[error.operation] = (errorsByOperation[error.operation] || 0) + 1;
    }

    return {
      totalErrors: recentErrors.length,
      errorsByOperation,
      recentErrors: recentErrors.slice(-10), // Last 10 errors
    };
  }

  /**
   * Export logs for external analysis
   */
  exportLogs(
    format: 'json' | 'csv' = 'json',
    filters?: {
      startTime?: Date;
      endTime?: Date;
      level?: RedisLogEntry['level'];
      operation?: string;
    }
  ): string {
    let logs = [...this.logEntries];

    // Apply filters
    if (filters) {
      if (filters.startTime) {
        logs = logs.filter(log => log.timestamp >= filters.startTime!);
      }
      if (filters.endTime) {
        logs = logs.filter(log => log.timestamp <= filters.endTime!);
      }
      if (filters.level) {
        logs = logs.filter(log => log.level === filters.level);
      }
      if (filters.operation) {
        logs = logs.filter(log => log.operation.includes(filters.operation!));
      }
    }

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else {
      // CSV format
      const headers = ['timestamp', 'level', 'operation', 'key', 'duration', 'success', 'error'];
      const csvLines = [headers.join(',')];
      
      for (const log of logs) {
        const row = [
          log.timestamp.toISOString(),
          log.level,
          log.operation,
          log.key || '',
          log.duration?.toString() || '',
          log.success.toString(),
          log.error || '',
        ];
        csvLines.push(row.map(field => `"${field}"`).join(','));
      }
      
      return csvLines.join('\n');
    }
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logEntries = [];
    this.performanceMetrics.clear();
  }

  /**
   * Stop the logger and cleanup
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Determine appropriate log level
   */
  private determineLogLevel(
    success: boolean,
    duration?: number,
    error?: Error
  ): RedisLogEntry['level'] {
    if (!success || error) {
      return 'error';
    }
    
    if (duration && duration > this.config.slowQueryThresholdMs) {
      return 'warn';
    }
    
    return 'debug';
  }

  /**
   * Check if we should log at this level
   */
  private shouldLog(level: RedisLogEntry['level']): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevelIndex = levels.indexOf(this.config.logLevel);
    const logLevelIndex = levels.indexOf(level);
    
    return logLevelIndex >= configLevelIndex;
  }

  /**
   * Add log entry with output handling
   */
  private addLogEntry(logEntry: RedisLogEntry): void {
    // Add to memory store
    this.logEntries.push(logEntry);
    
    // Trim if over limit
    if (this.logEntries.length > this.config.maxLogEntries) {
      this.logEntries = this.logEntries.slice(-this.config.maxLogEntries);
    }

    // Console output
    if (this.config.enableConsoleOutput) {
      this.outputToConsole(logEntry);
    }

    // File output (if configured)
    if (this.config.enableFileOutput && this.config.logFilePath) {
      this.outputToFile(logEntry);
    }
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(logEntry: RedisLogEntry): void {
    const timestamp = logEntry.timestamp.toISOString();
    const level = logEntry.level.toUpperCase().padEnd(5);
    const operation = logEntry.operation.padEnd(20);
    const key = logEntry.key ? ` key=${logEntry.key}` : '';
    const duration = logEntry.duration ? ` duration=${logEntry.duration}ms` : '';
    const error = logEntry.error ? ` error="${logEntry.error}"` : '';
    
    const message = `[${timestamp}] ${level} Redis ${operation}${key}${duration}${error}`;
    
    switch (logEntry.level) {
      case 'error':
        console.error(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'debug':
        console.debug(message);
        break;
    }
  }

  /**
   * Output log entry to file
   */
  private async outputToFile(logEntry: RedisLogEntry): Promise<void> {
    if (!this.config.logFilePath) return;

    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      await Deno.writeTextFile(this.config.logFilePath, logLine, { append: true });
    } catch (error) {
      console.error('Failed to write Redis log to file:', error);
    }
  }

  /**
   * Track performance metric
   */
  private trackPerformanceMetric(operation: string, duration: number): void {
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }
    
    const metrics = this.performanceMetrics.get(operation)!;
    metrics.push(duration);
    
    // Keep only last 1000 measurements per operation
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }
  }

  /**
   * Log slow query with detailed information
   */
  private logSlowQuery(
    operation: string,
    key: string | undefined,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    const logEntry: RedisLogEntry = {
      timestamp: new Date(),
      level: 'warn',
      operation: `slow_${operation}`,
      key,
      duration,
      success: true,
      metadata: { 
        slowQuery: true, 
        threshold: this.config.slowQueryThresholdMs,
        ...metadata 
      },
    };

    this.addLogEntry(logEntry);
  }

  /**
   * Start cleanup timer for old logs
   */
  private startCleanupTimer(): void {
    // Run cleanup every hour
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldLogs();
    }, 3600000);
  }

  /**
   * Clean up old log entries
   */
  private cleanupOldLogs(): void {
    const cutoff = new Date(Date.now() - (this.config.retainLogsHours * 60 * 60 * 1000));
    const initialCount = this.logEntries.length;
    
    this.logEntries = this.logEntries.filter(log => log.timestamp >= cutoff);
    
    const removedCount = initialCount - this.logEntries.length;
    if (removedCount > 0) {
      console.log(`Redis Logger: Cleaned up ${removedCount} old log entries`);
    }
  }
}