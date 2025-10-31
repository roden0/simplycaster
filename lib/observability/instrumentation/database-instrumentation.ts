/**
 * Database Operations Instrumentation
 * 
 * Provides OpenTelemetry instrumentation for database operations including:
 * - Automatic query instrumentation with execution time
 * - Transaction boundary tracing
 * - Connection pool usage monitoring
 */

import { SpanKind, SpanStatusCode } from "npm:@opentelemetry/api@1.7.0";
import type { Span } from "npm:@opentelemetry/api@1.7.0";
import { startActiveSpan, recordCounter, recordHistogram, recordGauge, addCommonAttributes } from "../observability-service.ts";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Database query context
 */
export interface QueryContext {
  operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  table?: string;
  queryType?: string;
  userId?: string;
  connectionId?: string;
  transactionId?: string;
}

/**
 * Transaction context
 */
export interface TransactionContext {
  transactionId: string;
  operation: 'begin' | 'commit' | 'rollback';
  userId?: string;
  connectionId?: string;
  queryCount?: number;
}

/**
 * Connection pool context
 */
export interface ConnectionPoolContext {
  poolName: string;
  operation: 'acquire' | 'release' | 'create' | 'destroy';
  connectionId?: string;
  poolSize?: number;
  activeConnections?: number;
  idleConnections?: number;
  waitingRequests?: number;
}

/**
 * Query execution result
 */
export interface QueryResult {
  rowCount?: number;
  affectedRows?: number;
  insertId?: string;
  executionTime: number;
  fromCache?: boolean;
}

// ============================================================================
// DATABASE INSTRUMENTATION CLASS
// ============================================================================

/**
 * Database operations instrumentation service
 */
export class DatabaseInstrumentation {
  private static readonly COMPONENT_NAME = 'database';

  /**
   * Instrument database query execution
   */
  static async instrumentQuery<T>(
    query: string,
    context: QueryContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      `db.query.${context.operation}`,
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'db.operation': context.operation,
            'db.statement': this.sanitizeQuery(query),
            'db.system': 'postgresql',
            'component.name': this.COMPONENT_NAME,
          });

          if (context.table) {
            span.setAttribute('db.table', context.table);
          }

          if (context.queryType) {
            span.setAttribute('db.query.type', context.queryType);
          }

          if (context.connectionId) {
            span.setAttribute('db.connection.id', context.connectionId);
          }

          if (context.transactionId) {
            span.setAttribute('db.transaction.id', context.transactionId);
          }

          // Add common attributes
          addCommonAttributes(span, {
            userId: context.userId,
            operation: `db.query.${context.operation}`,
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Extract result information if available
          let rowCount: number | undefined;
          let fromCache = false;

          if (result && typeof result === 'object') {
            const resultObj = result as any;
            rowCount = resultObj.rowCount || resultObj.affectedRows || resultObj.length;
            fromCache = resultObj.fromCache || false;
          }

          // Record success metrics
          recordCounter('db_queries_total', 1, {
            attributes: {
              operation: context.operation,
              table: context.table || 'unknown',
              status: 'success',
              from_cache: fromCache.toString(),
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('db_query_duration_ms', duration, {
            attributes: {
              operation: context.operation,
              table: context.table || 'unknown',
              from_cache: fromCache.toString(),
              component: this.COMPONENT_NAME,
            },
          });

          // Record row count if available
          if (rowCount !== undefined) {
            recordHistogram('db_query_rows', rowCount, {
              attributes: {
                operation: context.operation,
                table: context.table || 'unknown',
                component: this.COMPONENT_NAME,
              },
            });
            span.setAttribute('db.rows_affected', rowCount);
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttributes({
            'db.query.duration_ms': duration,
            'db.query.from_cache': fromCache,
          });

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('db_queries_total', 1, {
            attributes: {
              operation: context.operation,
              table: context.table || 'unknown',
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          // Record slow query if it took too long
          const duration = Date.now() - Date.now();
          if (duration > 1000) { // Slow query threshold: 1 second
            recordCounter('db_slow_queries_total', 1, {
              attributes: {
                operation: context.operation,
                table: context.table || 'unknown',
                duration_ms: duration.toString(),
                component: this.COMPONENT_NAME,
              },
            });
          }

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Instrument transaction operations
   */
  static async instrumentTransaction<T>(
    context: TransactionContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      `db.transaction.${context.operation}`,
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'db.operation': 'transaction',
            'db.transaction.operation': context.operation,
            'db.transaction.id': context.transactionId,
            'db.system': 'postgresql',
            'component.name': this.COMPONENT_NAME,
          });

          if (context.connectionId) {
            span.setAttribute('db.connection.id', context.connectionId);
          }

          if (context.queryCount) {
            span.setAttribute('db.transaction.query_count', context.queryCount);
          }

          // Add common attributes
          addCommonAttributes(span, {
            userId: context.userId,
            operation: `db.transaction.${context.operation}`,
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('db_transactions_total', 1, {
            attributes: {
              operation: context.operation,
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('db_transaction_duration_ms', duration, {
            attributes: {
              operation: context.operation,
              component: this.COMPONENT_NAME,
            },
          });

          // Record transaction query count if available
          if (context.queryCount) {
            recordHistogram('db_transaction_queries', context.queryCount, {
              attributes: {
                operation: context.operation,
                component: this.COMPONENT_NAME,
              },
            });
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('db.transaction.duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('db_transactions_total', 1, {
            attributes: {
              operation: context.operation,
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Instrument connection pool operations
   */
  static async instrumentConnectionPool<T>(
    context: ConnectionPoolContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return startActiveSpan(
      `db.pool.${context.operation}`,
      async (span: Span) => {
        try {
          // Set span attributes
          span.setAttributes({
            'db.operation': 'connection_pool',
            'db.pool.operation': context.operation,
            'db.pool.name': context.poolName,
            'db.system': 'postgresql',
            'component.name': this.COMPONENT_NAME,
          });

          if (context.connectionId) {
            span.setAttribute('db.connection.id', context.connectionId);
          }

          if (context.poolSize) {
            span.setAttribute('db.pool.size', context.poolSize);
          }

          if (context.activeConnections) {
            span.setAttribute('db.pool.active_connections', context.activeConnections);
          }

          if (context.idleConnections) {
            span.setAttribute('db.pool.idle_connections', context.idleConnections);
          }

          if (context.waitingRequests) {
            span.setAttribute('db.pool.waiting_requests', context.waitingRequests);
          }

          // Add common attributes
          addCommonAttributes(span, {
            operation: `db.pool.${context.operation}`,
            component: this.COMPONENT_NAME,
          });

          const startTime = Date.now();
          const result = await operation();
          const duration = Date.now() - startTime;

          // Record success metrics
          recordCounter('db_pool_operations_total', 1, {
            attributes: {
              operation: context.operation,
              pool_name: context.poolName,
              status: 'success',
              component: this.COMPONENT_NAME,
            },
          });

          recordHistogram('db_pool_operation_duration_ms', duration, {
            attributes: {
              operation: context.operation,
              pool_name: context.poolName,
              component: this.COMPONENT_NAME,
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('db.pool.operation_duration_ms', duration);

          return result;
        } catch (error) {
          // Record error metrics
          recordCounter('db_pool_operations_total', 1, {
            attributes: {
              operation: context.operation,
              pool_name: context.poolName,
              status: 'error',
              error_type: error instanceof Error ? error.constructor.name : 'unknown',
              component: this.COMPONENT_NAME,
            },
          });

          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      },
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Record connection pool statistics
   */
  static recordConnectionPoolStats(poolName: string, stats: {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    waitingRequests: number;
    maxConnections: number;
  }): void {
    const baseAttributes = {
      pool_name: poolName,
      component: this.COMPONENT_NAME,
    };

    // Record current connection counts
    recordGauge('db_pool_connections_total', stats.totalConnections, {
      attributes: baseAttributes,
    });

    recordGauge('db_pool_connections_active', stats.activeConnections, {
      attributes: baseAttributes,
    });

    recordGauge('db_pool_connections_idle', stats.idleConnections, {
      attributes: baseAttributes,
    });

    recordGauge('db_pool_requests_waiting', stats.waitingRequests, {
      attributes: baseAttributes,
    });

    // Record pool utilization percentage
    const utilization = stats.maxConnections > 0 ? (stats.totalConnections / stats.maxConnections) * 100 : 0;
    recordGauge('db_pool_utilization_percent', utilization, {
      attributes: baseAttributes,
    });

    // Record active connection percentage
    const activePercentage = stats.totalConnections > 0 ? (stats.activeConnections / stats.totalConnections) * 100 : 0;
    recordGauge('db_pool_active_percent', activePercentage, {
      attributes: baseAttributes,
    });
  }

  /**
   * Record query performance statistics
   */
  static recordQueryPerformanceStats(table: string, operation: string, stats: {
    averageDuration: number;
    p95Duration: number;
    p99Duration: number;
    queryCount: number;
    errorCount: number;
    slowQueryCount: number;
  }): void {
    const baseAttributes = {
      table,
      operation,
      component: this.COMPONENT_NAME,
    };

    // Record performance percentiles
    recordGauge('db_query_duration_avg_ms', stats.averageDuration, {
      attributes: baseAttributes,
    });

    recordGauge('db_query_duration_p95_ms', stats.p95Duration, {
      attributes: baseAttributes,
    });

    recordGauge('db_query_duration_p99_ms', stats.p99Duration, {
      attributes: baseAttributes,
    });

    // Record query counts
    recordGauge('db_queries_per_minute', stats.queryCount, {
      attributes: baseAttributes,
    });

    recordGauge('db_query_errors_per_minute', stats.errorCount, {
      attributes: baseAttributes,
    });

    recordGauge('db_slow_queries_per_minute', stats.slowQueryCount, {
      attributes: baseAttributes,
    });

    // Calculate error rate
    const errorRate = stats.queryCount > 0 ? (stats.errorCount / stats.queryCount) * 100 : 0;
    recordGauge('db_query_error_rate_percent', errorRate, {
      attributes: baseAttributes,
    });
  }

  /**
   * Sanitize SQL query for logging (remove sensitive data)
   */
  private static sanitizeQuery(query: string): string {
    // Remove potential sensitive data from queries
    return query
      .replace(/password\s*=\s*'[^']*'/gi, "password = '***'")
      .replace(/password\s*=\s*"[^"]*"/gi, 'password = "***"')
      .replace(/token\s*=\s*'[^']*'/gi, "token = '***'")
      .replace(/token\s*=\s*"[^"]*"/gi, 'token = "***"')
      .replace(/secret\s*=\s*'[^']*'/gi, "secret = '***'")
      .replace(/secret\s*=\s*"[^"]*"/gi, 'secret = "***"')
      .trim();
  }

  /**
   * Extract table name from SQL query
   */
  static extractTableName(query: string): string | undefined {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Match common SQL patterns
    const patterns = [
      /(?:from|into|update|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i,
      /(?:insert\s+into)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i,
      /(?:delete\s+from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i,
    ];

    for (const pattern of patterns) {
      const match = normalizedQuery.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Determine query operation type from SQL
   */
  static getQueryOperation(query: string): QueryContext['operation'] {
    const normalizedQuery = query.toLowerCase().trim();
    
    if (normalizedQuery.startsWith('select')) return 'select';
    if (normalizedQuery.startsWith('insert')) return 'insert';
    if (normalizedQuery.startsWith('update')) return 'update';
    if (normalizedQuery.startsWith('delete')) return 'delete';
    if (normalizedQuery.includes('on conflict') || normalizedQuery.includes('on duplicate key')) return 'upsert';
    
    return 'select'; // Default fallback
  }
}



// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Instrument database query
 */
export async function instrumentQuery<T>(
  query: string,
  context: QueryContext,
  operation: () => Promise<T>
): Promise<T> {
  return DatabaseInstrumentation.instrumentQuery(query, context, operation);
}

/**
 * Instrument database transaction
 */
export async function instrumentTransaction<T>(
  context: TransactionContext,
  operation: () => Promise<T>
): Promise<T> {
  return DatabaseInstrumentation.instrumentTransaction(context, operation);
}

/**
 * Instrument connection pool operation
 */
export async function instrumentConnectionPool<T>(
  context: ConnectionPoolContext,
  operation: () => Promise<T>
): Promise<T> {
  return DatabaseInstrumentation.instrumentConnectionPool(context, operation);
}

/**
 * Record connection pool statistics
 */
export function recordConnectionPoolStats(poolName: string, stats: {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  maxConnections: number;
}): void {
  DatabaseInstrumentation.recordConnectionPoolStats(poolName, stats);
}

/**
 * Record query performance statistics
 */
export function recordQueryPerformanceStats(table: string, operation: string, stats: {
  averageDuration: number;
  p95Duration: number;
  p99Duration: number;
  queryCount: number;
  errorCount: number;
  slowQueryCount: number;
}): void {
  DatabaseInstrumentation.recordQueryPerformanceStats(table, operation, stats);
}

/**
 * Extract table name from SQL query
 */
export function extractTableName(query: string): string | undefined {
  return DatabaseInstrumentation.extractTableName(query);
}

/**
 * Get query operation type from SQL
 */
export function getQueryOperation(query: string): QueryContext['operation'] {
  return DatabaseInstrumentation.getQueryOperation(query);
}

/**
 * Auto-instrument query with automatic context detection
 */
export async function autoInstrumentQuery<T>(
  query: string,
  userId?: string,
  connectionId?: string,
  transactionId?: string,
  operation?: () => Promise<T>
): Promise<T> {
  if (!operation) {
    throw new Error('Operation function is required');
  }

  const context: QueryContext = {
    operation: getQueryOperation(query),
    table: extractTableName(query),
    userId,
    connectionId,
    transactionId,
  };

  return instrumentQuery(query, context, operation);
}