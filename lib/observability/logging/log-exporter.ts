/**
 * Log Exporter - Export structured logs to Loki via OTLP
 * 
 * This module provides:
 * - Log export to Loki with proper labels
 * - Integration with OpenTelemetry log export
 * - Batch processing and error handling
 * - Configurable export intervals and retry logic
 */

import type { LogEntry, LoggerConfig } from "./structured-logger.ts";
import { loadAndValidateConfig } from "../config/observability-config.ts";

// ============================================================================
// INTERFACES AND TYPES
// ============================================================================

/**
 * Log export configuration
 */
export interface LogExportConfig {
  /** OTLP endpoint for logs */
  endpoint: string;
  /** Export protocol */
  protocol: 'http/protobuf' | 'http/json';
  /** Batch size for log export */
  batchSize: number;
  /** Export interval in milliseconds */
  exportInterval: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Retry delay in milliseconds */
  retryDelay: number;
  /** Enable/disable log export */
  enabled: boolean;
}

/**
 * Loki labels for log entries
 */
export interface LokiLabels {
  service: string;
  version: string;
  environment: string;
  level: string;
  component?: string;
  operation?: string;
  userId?: string;
  roomId?: string;
}

/**
 * Log exporter interface
 */
export interface ILogExporter {
  /** Export log entries */
  export(logs: LogEntry[]): Promise<void>;
  /** Start the exporter */
  start(): void;
  /** Stop the exporter */
  stop(): void;
  /** Get export statistics */
  getStats(): LogExportStats;
}

/**
 * Export statistics
 */
export interface LogExportStats {
  totalExported: number;
  totalFailed: number;
  lastExportTime?: Date;
  lastError?: string;
}

// ============================================================================
// LOG EXPORTER IMPLEMENTATION
// ============================================================================

/**
 * Default log export configuration
 */
const DEFAULT_EXPORT_CONFIG: LogExportConfig = {
  endpoint: 'http://otel-lgtm:4318/v1/logs',
  protocol: 'http/protobuf',
  batchSize: 100,
  exportInterval: 5000, // 5 seconds
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  enabled: true,
};

/**
 * Log exporter implementation
 */
export class LogExporter implements ILogExporter {
  private config: LogExportConfig;
  private logBuffer: LogEntry[] = [];
  private exportTimer: number | null = null;
  private stats: LogExportStats = {
    totalExported: 0,
    totalFailed: 0,
  };

  constructor(config: Partial<LogExportConfig> = {}) {
    this.config = { ...DEFAULT_EXPORT_CONFIG, ...config };
  }

  /**
   * Export log entries to Loki
   */
  async export(logs: LogEntry[]): Promise<void> {
    if (!this.config.enabled || logs.length === 0) {
      return;
    }

    try {
      const payload = this.createOTLPPayload(logs);
      await this.sendToOTLP(payload);
      
      this.stats.totalExported += logs.length;
      this.stats.lastExportTime = new Date();
    } catch (error) {
      this.stats.totalFailed += logs.length;
      this.stats.lastError = error instanceof Error ? error.message : String(error);
      
      // Retry logic could be implemented here
      console.error('Failed to export logs:', error);
    }
  }

  /**
   * Start the log exporter
   */
  start(): void {
    if (!this.config.enabled) {
      return;
    }

    this.exportTimer = setInterval(() => {
      this.flushBuffer();
    }, this.config.exportInterval);
  }

  /**
   * Stop the log exporter
   */
  stop(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = null;
    }
    
    // Flush remaining logs
    this.flushBuffer();
  }

  /**
   * Get export statistics
   */
  getStats(): LogExportStats {
    return { ...this.stats };
  }

  /**
   * Add logs to buffer for batch export
   */
  addToBuffer(logs: LogEntry[]): void {
    this.logBuffer.push(...logs);
    
    if (this.logBuffer.length >= this.config.batchSize) {
      this.flushBuffer();
    }
  }

  /**
   * Flush log buffer
   */
  private async flushBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }

    const logsToExport = this.logBuffer.splice(0, this.config.batchSize);
    await this.export(logsToExport);
  }

  /**
   * Create OTLP payload for logs
   */
  private createOTLPPayload(logs: LogEntry[]): unknown {
    // This is a simplified OTLP log payload structure
    // In a real implementation, you would use the official OTLP protobuf definitions
    return {
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: logs[0]?.service || 'simplycast' } },
              { key: 'service.version', value: { stringValue: logs[0]?.version || '1.0.0' } },
            ],
          },
          scopeLogs: [
            {
              scope: {
                name: 'simplycast-logger',
                version: '1.0.0',
              },
              logRecords: logs.map(log => ({
                timeUnixNano: new Date(log.timestamp).getTime() * 1000000, // Convert to nanoseconds
                severityNumber: this.getSeverityNumber(log.level),
                severityText: log.level.toUpperCase(),
                body: { stringValue: log.message },
                attributes: this.createLogAttributes(log),
                traceId: log.traceId,
                spanId: log.spanId,
              })),
            },
          ],
        },
      ],
    };
  }

  /**
   * Send payload to OTLP endpoint
   */
  private async sendToOTLP(payload: unknown): Promise<void> {
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': this.config.protocol === 'http/protobuf' 
          ? 'application/x-protobuf' 
          : 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`OTLP export failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Get OTLP severity number from log level
   */
  private getSeverityNumber(level: string): number {
    switch (level.toLowerCase()) {
      case 'debug': return 5;
      case 'info': return 9;
      case 'warn': return 13;
      case 'error': return 17;
      default: return 9;
    }
  }

  /**
   * Create log attributes for OTLP
   */
  private createLogAttributes(log: LogEntry): Array<{ key: string; value: { stringValue: string } }> {
    const attributes: Array<{ key: string; value: { stringValue: string } }> = [];

    if (log.component) attributes.push({ key: 'component', value: { stringValue: log.component } });
    if (log.operation) attributes.push({ key: 'operation', value: { stringValue: log.operation } });
    if (log.userId) attributes.push({ key: 'user.id', value: { stringValue: log.userId } });
    if (log.roomId) attributes.push({ key: 'room.id', value: { stringValue: log.roomId } });
    if (log.requestId) attributes.push({ key: 'request.id', value: { stringValue: log.requestId } });
    if (log.sessionId) attributes.push({ key: 'session.id', value: { stringValue: log.sessionId } });

    // Add error attributes if present
    if (log.error) {
      attributes.push({ key: 'error.name', value: { stringValue: log.error.name } });
      attributes.push({ key: 'error.message', value: { stringValue: log.error.message } });
      if (log.error.code) {
        attributes.push({ key: 'error.code', value: { stringValue: String(log.error.code) } });
      }
    }

    // Add metadata attributes
    if (log.metadata) {
      for (const [key, value] of Object.entries(log.metadata)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          attributes.push({ key: `metadata.${key}`, value: { stringValue: String(value) } });
        }
      }
    }

    return attributes;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create log exporter with environment configuration
 */
export function createLogExporter(): LogExporter {
  try {
    const observabilityConfig = loadAndValidateConfig();
    
    const exportConfig: Partial<LogExportConfig> = {
      endpoint: `${observabilityConfig.exporter.endpoint}/v1/logs`,
      protocol: observabilityConfig.exporter.protocol === 'grpc' ? 'http/protobuf' : observabilityConfig.exporter.protocol,
      enabled: observabilityConfig.otel.enabled,
    };

    return new LogExporter(exportConfig);
  } catch (error) {
    console.warn('Failed to load observability config for log exporter, using defaults:', error);
    return new LogExporter();
  }
}

/**
 * Global log exporter instance
 */
export const logExporter = createLogExporter();

// ============================================================================
// INTEGRATION WITH STRUCTURED LOGGER
// ============================================================================

/**
 * Enhanced structured logger with log export
 */
export class ExportingStructuredLogger {
  private exporter: LogExporter;
  private exportBuffer: LogEntry[] = [];

  constructor(exporter?: LogExporter) {
    this.exporter = exporter || logExporter;
  }

  /**
   * Log entry and add to export buffer
   */
  logAndExport(logEntry: LogEntry): void {
    // Output to console (existing behavior)
    console.log(JSON.stringify(logEntry));
    
    // Add to export buffer
    this.exportBuffer.push(logEntry);
    this.exporter.addToBuffer([logEntry]);
  }

  /**
   * Start log export
   */
  startExport(): void {
    this.exporter.start();
  }

  /**
   * Stop log export
   */
  stopExport(): void {
    this.exporter.stop();
  }

  /**
   * Get export statistics
   */
  getExportStats(): LogExportStats {
    return this.exporter.getStats();
  }
}