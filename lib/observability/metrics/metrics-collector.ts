/**
 * MetricsCollector - Interface and implementation for collecting SimplyCaster-specific metrics
 * 
 * This module provides:
 * - Room operation metrics collection
 * - WebRTC connection quality and duration metrics
 * - Recording operation metrics
 * - Infrastructure and performance metrics
 */

import { metrics } from "npm:@opentelemetry/api@1.7.0";
import type { Meter, Counter, Histogram, UpDownCounter } from "npm:@opentelemetry/api@1.7.0";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Room operation metrics context
 */
export interface RoomMetricsContext {
  roomId: string;
  hostId: string;
  participantCount: number;
  maxParticipants: number;
  allowVideo: boolean;
  operation: 'create' | 'join' | 'leave' | 'close' | 'kick';
  success: boolean;
  duration?: number;
  errorType?: string;
}

/**
 * WebRTC connection metrics context
 */
export interface WebRTCMetricsContext {
  roomId: string;
  participantId: string;
  participantType: 'host' | 'guest';
  connectionId: string;
  operation: 'signaling' | 'ice_candidate' | 'connection_established' | 'media_stream' | 'quality_check';
  success: boolean;
  duration?: number;
  quality?: number; // 0-1 scale
  bandwidth?: number; // bytes/sec
  packetLoss?: number; // 0-1 scale
  latency?: number; // milliseconds
  errorType?: string;
}

/**
 * Recording operation metrics context
 */
export interface RecordingMetricsContext {
  roomId: string;
  recordingId: string;
  participantCount: number;
  operation: 'start' | 'stop' | 'upload' | 'process' | 'complete' | 'fail';
  success: boolean;
  duration?: number;
  fileSize?: number; // bytes
  format?: string;
  errorType?: string;
}

/**
 * Database metrics context
 */
export interface DatabaseMetricsContext {
  operation: 'select' | 'insert' | 'update' | 'delete' | 'transaction';
  table?: string;
  success: boolean;
  duration: number;
  rowsAffected?: number;
  connectionPoolSize?: number;
  activeConnections?: number;
  errorType?: string;
}

/**
 * Redis cache metrics context
 */
export interface CacheMetricsContext {
  operation: 'get' | 'set' | 'delete' | 'exists' | 'expire';
  key?: string;
  keyPattern?: string;
  hit: boolean;
  success: boolean;
  duration: number;
  valueSize?: number; // bytes
  ttl?: number; // seconds
  errorType?: string;
}

/**
 * System resource metrics context
 */
export interface SystemMetricsContext {
  cpuUsage?: number; // 0-1 scale
  memoryUsage?: number; // bytes
  memoryTotal?: number; // bytes
  diskUsage?: number; // bytes
  diskTotal?: number; // bytes
  networkBytesIn?: number;
  networkBytesOut?: number;
}

/**
 * Metrics collector interface
 */
export interface IMetricsCollector {
  // Room operation metrics
  recordRoomOperation(context: RoomMetricsContext): void;
  recordActiveRooms(count: number): void;
  recordTotalParticipants(count: number): void;
  
  // WebRTC metrics
  recordWebRTCOperation(context: WebRTCMetricsContext): void;
  recordConnectionQuality(context: Pick<WebRTCMetricsContext, 'roomId' | 'participantId' | 'quality' | 'bandwidth' | 'packetLoss' | 'latency'>): void;
  recordActiveConnections(count: number): void;
  
  // Recording metrics
  recordRecordingOperation(context: RecordingMetricsContext): void;
  recordActiveRecordings(count: number): void;
  recordTotalRecordingSize(bytes: number): void;
  
  // Database metrics
  recordDatabaseOperation(context: DatabaseMetricsContext): void;
  recordConnectionPoolStats(context: Pick<DatabaseMetricsContext, 'connectionPoolSize' | 'activeConnections'>): void;
  
  // Cache metrics
  recordCacheOperation(context: CacheMetricsContext): void;
  recordCacheHitRate(rate: number): void;
  recordCacheSize(bytes: number): void;
  
  // System metrics
  recordSystemMetrics(context: SystemMetricsContext): void;
  
  // Health and status
  getCollectorHealth(): {
    healthy: boolean;
    initialized: boolean;
    metricsRecorded: number;
    lastError?: string;
  };
  
  // Lifecycle
  initialize(serviceName: string, serviceVersion: string): Promise<void>;
  shutdown(): Promise<void>;
}

// ============================================================================
// METRICS COLLECTOR IMPLEMENTATION
// ============================================================================

/**
 * MetricsCollector implementation using OpenTelemetry
 */
export class MetricsCollector implements IMetricsCollector {
  private meter: Meter | null = null;
  private initialized = false;
  private metricsRecorded = 0;
  private lastError: string | null = null;
  
  // Room operation metrics
  private roomOperationCounter: Counter | null = null;
  private roomOperationDuration: Histogram | null = null;
  private activeRoomsGauge: UpDownCounter | null = null;
  private totalParticipantsGauge: UpDownCounter | null = null;
  
  // WebRTC metrics
  private webrtcOperationCounter: Counter | null = null;
  private webrtcOperationDuration: Histogram | null = null;
  private connectionQualityGauge: Histogram | null = null;
  private connectionBandwidthGauge: Histogram | null = null;
  private connectionLatencyGauge: Histogram | null = null;
  private activeConnectionsGauge: UpDownCounter | null = null;
  
  // Recording metrics
  private recordingOperationCounter: Counter | null = null;
  private recordingOperationDuration: Histogram | null = null;
  private recordingFileSizeHistogram: Histogram | null = null;
  private activeRecordingsGauge: UpDownCounter | null = null;
  private totalRecordingSizeGauge: UpDownCounter | null = null;
  
  // Database metrics
  private databaseOperationCounter: Counter | null = null;
  private databaseOperationDuration: Histogram | null = null;
  private databaseRowsAffected: Histogram | null = null;
  private connectionPoolSizeGauge: UpDownCounter | null = null;
  private databaseActiveConnectionsGauge: UpDownCounter | null = null;
  
  // Cache metrics
  private cacheOperationCounter: Counter | null = null;
  private cacheOperationDuration: Histogram | null = null;
  private cacheHitRateGauge: Histogram | null = null;
  private cacheSizeGauge: UpDownCounter | null = null;
  
  // System metrics
  private cpuUsageGauge: Histogram | null = null;
  private memoryUsageGauge: UpDownCounter | null = null;
  private diskUsageGauge: UpDownCounter | null = null;
  private networkBytesCounter: Counter | null = null;

  /**
   * Initialize the metrics collector
   */
  async initialize(serviceName: string, serviceVersion: string): Promise<void> {
    try {
      this.lastError = null;
      
      // Get meter from OpenTelemetry
      this.meter = metrics.getMeter(serviceName, serviceVersion);
      
      // Initialize room operation metrics
      await this.initializeRoomMetrics();
      
      // Initialize WebRTC metrics
      await this.initializeWebRTCMetrics();
      
      // Initialize recording metrics
      await this.initializeRecordingMetrics();
      
      // Initialize database metrics
      await this.initializeDatabaseMetrics();
      
      // Initialize cache metrics
      await this.initializeCacheMetrics();
      
      // Initialize system metrics
      await this.initializeSystemMetrics();
      
      this.initialized = true;
      console.log(`MetricsCollector: Successfully initialized for service '${serviceName}' v${serviceVersion}`);
      
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error('MetricsCollector: Failed to initialize:', this.lastError);
      this.initialized = false;
    }
  }

  /**
   * Initialize room operation metrics
   */
  private async initializeRoomMetrics(): Promise<void> {
    if (!this.meter) return;

    this.roomOperationCounter = this.meter.createCounter('simplycast_room_operations_total', {
      description: 'Total number of room operations',
      unit: '1',
    });

    this.roomOperationDuration = this.meter.createHistogram('simplycast_room_operation_duration_ms', {
      description: 'Duration of room operations in milliseconds',
      unit: 'ms',
    });

    this.activeRoomsGauge = this.meter.createUpDownCounter('simplycast_active_rooms', {
      description: 'Number of currently active rooms',
      unit: '1',
    });

    this.totalParticipantsGauge = this.meter.createUpDownCounter('simplycast_total_participants', {
      description: 'Total number of participants across all rooms',
      unit: '1',
    });
  }

  /**
   * Initialize WebRTC metrics
   */
  private async initializeWebRTCMetrics(): Promise<void> {
    if (!this.meter) return;

    this.webrtcOperationCounter = this.meter.createCounter('simplycast_webrtc_operations_total', {
      description: 'Total number of WebRTC operations',
      unit: '1',
    });

    this.webrtcOperationDuration = this.meter.createHistogram('simplycast_webrtc_operation_duration_ms', {
      description: 'Duration of WebRTC operations in milliseconds',
      unit: 'ms',
    });

    this.connectionQualityGauge = this.meter.createHistogram('simplycast_webrtc_connection_quality', {
      description: 'WebRTC connection quality score (0-1)',
      unit: '1',
    });

    this.connectionBandwidthGauge = this.meter.createHistogram('simplycast_webrtc_connection_bandwidth_bps', {
      description: 'WebRTC connection bandwidth in bytes per second',
      unit: 'By/s',
    });

    this.connectionLatencyGauge = this.meter.createHistogram('simplycast_webrtc_connection_latency_ms', {
      description: 'WebRTC connection latency in milliseconds',
      unit: 'ms',
    });

    this.activeConnectionsGauge = this.meter.createUpDownCounter('simplycast_active_webrtc_connections', {
      description: 'Number of currently active WebRTC connections',
      unit: '1',
    });
  }

  /**
   * Initialize recording metrics
   */
  private async initializeRecordingMetrics(): Promise<void> {
    if (!this.meter) return;

    this.recordingOperationCounter = this.meter.createCounter('simplycast_recording_operations_total', {
      description: 'Total number of recording operations',
      unit: '1',
    });

    this.recordingOperationDuration = this.meter.createHistogram('simplycast_recording_operation_duration_ms', {
      description: 'Duration of recording operations in milliseconds',
      unit: 'ms',
    });

    this.recordingFileSizeHistogram = this.meter.createHistogram('simplycast_recording_file_size_bytes', {
      description: 'Size of recording files in bytes',
      unit: 'By',
    });

    this.activeRecordingsGauge = this.meter.createUpDownCounter('simplycast_active_recordings', {
      description: 'Number of currently active recordings',
      unit: '1',
    });

    this.totalRecordingSizeGauge = this.meter.createUpDownCounter('simplycast_total_recording_size_bytes', {
      description: 'Total size of all recordings in bytes',
      unit: 'By',
    });
  }

  /**
   * Initialize database metrics
   */
  private async initializeDatabaseMetrics(): Promise<void> {
    if (!this.meter) return;

    this.databaseOperationCounter = this.meter.createCounter('simplycast_database_operations_total', {
      description: 'Total number of database operations',
      unit: '1',
    });

    this.databaseOperationDuration = this.meter.createHistogram('simplycast_database_operation_duration_ms', {
      description: 'Duration of database operations in milliseconds',
      unit: 'ms',
    });

    this.databaseRowsAffected = this.meter.createHistogram('simplycast_database_rows_affected', {
      description: 'Number of rows affected by database operations',
      unit: '1',
    });

    this.connectionPoolSizeGauge = this.meter.createUpDownCounter('simplycast_database_connection_pool_size', {
      description: 'Size of database connection pool',
      unit: '1',
    });

    this.databaseActiveConnectionsGauge = this.meter.createUpDownCounter('simplycast_database_active_connections', {
      description: 'Number of active database connections',
      unit: '1',
    });
  }

  /**
   * Initialize cache metrics
   */
  private async initializeCacheMetrics(): Promise<void> {
    if (!this.meter) return;

    this.cacheOperationCounter = this.meter.createCounter('simplycast_cache_operations_total', {
      description: 'Total number of cache operations',
      unit: '1',
    });

    this.cacheOperationDuration = this.meter.createHistogram('simplycast_cache_operation_duration_ms', {
      description: 'Duration of cache operations in milliseconds',
      unit: 'ms',
    });

    this.cacheHitRateGauge = this.meter.createHistogram('simplycast_cache_hit_rate', {
      description: 'Cache hit rate (0-1)',
      unit: '1',
    });

    this.cacheSizeGauge = this.meter.createUpDownCounter('simplycast_cache_size_bytes', {
      description: 'Total size of cache in bytes',
      unit: 'By',
    });
  }

  /**
   * Initialize system metrics
   */
  private async initializeSystemMetrics(): Promise<void> {
    if (!this.meter) return;

    this.cpuUsageGauge = this.meter.createHistogram('simplycast_system_cpu_usage', {
      description: 'System CPU usage (0-1)',
      unit: '1',
    });

    this.memoryUsageGauge = this.meter.createUpDownCounter('simplycast_system_memory_usage_bytes', {
      description: 'System memory usage in bytes',
      unit: 'By',
    });

    this.diskUsageGauge = this.meter.createUpDownCounter('simplycast_system_disk_usage_bytes', {
      description: 'System disk usage in bytes',
      unit: 'By',
    });

    this.networkBytesCounter = this.meter.createCounter('simplycast_system_network_bytes_total', {
      description: 'Total network bytes transferred',
      unit: 'By',
    });
  }

  // ============================================================================
  // ROOM OPERATION METRICS
  // ============================================================================

  /**
   * Record room operation metrics
   */
  recordRoomOperation(context: RoomMetricsContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        room_id: context.roomId,
        host_id: context.hostId,
        operation: context.operation,
        success: context.success.toString(),
        allow_video: context.allowVideo.toString(),
        participant_count: context.participantCount.toString(),
        max_participants: context.maxParticipants.toString(),
        ...(context.errorType && { error_type: context.errorType }),
      };

      this.roomOperationCounter?.add(1, attributes);

      if (context.duration !== undefined) {
        this.roomOperationDuration?.record(context.duration, attributes);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordRoomOperation', error);
    }
  }

  /**
   * Record active rooms count
   */
  recordActiveRooms(count: number): void {
    if (!this.initialized) return;

    try {
      // For UpDownCounter, we need to calculate the delta
      // This is a simplified implementation - in practice, you might want to track the previous value
      this.activeRoomsGauge?.add(count);
      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordActiveRooms', error);
    }
  }

  /**
   * Record total participants count
   */
  recordTotalParticipants(count: number): void {
    if (!this.initialized) return;

    try {
      this.totalParticipantsGauge?.add(count);
      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordTotalParticipants', error);
    }
  }

  // ============================================================================
  // WEBRTC METRICS
  // ============================================================================

  /**
   * Record WebRTC operation metrics
   */
  recordWebRTCOperation(context: WebRTCMetricsContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        room_id: context.roomId,
        participant_id: context.participantId,
        participant_type: context.participantType,
        connection_id: context.connectionId,
        operation: context.operation,
        success: context.success.toString(),
        ...(context.errorType && { error_type: context.errorType }),
      };

      this.webrtcOperationCounter?.add(1, attributes);

      if (context.duration !== undefined) {
        this.webrtcOperationDuration?.record(context.duration, attributes);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordWebRTCOperation', error);
    }
  }

  /**
   * Record connection quality metrics
   */
  recordConnectionQuality(context: Pick<WebRTCMetricsContext, 'roomId' | 'participantId' | 'quality' | 'bandwidth' | 'packetLoss' | 'latency'>): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        room_id: context.roomId,
        participant_id: context.participantId,
      };

      if (context.quality !== undefined) {
        this.connectionQualityGauge?.record(context.quality, attributes);
      }

      if (context.bandwidth !== undefined) {
        this.connectionBandwidthGauge?.record(context.bandwidth, attributes);
      }

      if (context.latency !== undefined) {
        this.connectionLatencyGauge?.record(context.latency, attributes);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordConnectionQuality', error);
    }
  }

  /**
   * Record active connections count
   */
  recordActiveConnections(count: number): void {
    if (!this.initialized) return;

    try {
      this.activeConnectionsGauge?.add(count);
      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordActiveConnections', error);
    }
  }

  // ============================================================================
  // RECORDING METRICS
  // ============================================================================

  /**
   * Record recording operation metrics
   */
  recordRecordingOperation(context: RecordingMetricsContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        room_id: context.roomId,
        recording_id: context.recordingId,
        operation: context.operation,
        success: context.success.toString(),
        participant_count: context.participantCount.toString(),
        ...(context.format && { format: context.format }),
        ...(context.errorType && { error_type: context.errorType }),
      };

      this.recordingOperationCounter?.add(1, attributes);

      if (context.duration !== undefined) {
        this.recordingOperationDuration?.record(context.duration, attributes);
      }

      if (context.fileSize !== undefined) {
        this.recordingFileSizeHistogram?.record(context.fileSize, attributes);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordRecordingOperation', error);
    }
  }

  /**
   * Record active recordings count
   */
  recordActiveRecordings(count: number): void {
    if (!this.initialized) return;

    try {
      this.activeRecordingsGauge?.add(count);
      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordActiveRecordings', error);
    }
  }

  /**
   * Record total recording size
   */
  recordTotalRecordingSize(bytes: number): void {
    if (!this.initialized) return;

    try {
      this.totalRecordingSizeGauge?.add(bytes);
      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordTotalRecordingSize', error);
    }
  }

  // ============================================================================
  // DATABASE METRICS
  // ============================================================================

  /**
   * Record database operation metrics
   */
  recordDatabaseOperation(context: DatabaseMetricsContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        operation: context.operation,
        success: context.success.toString(),
        ...(context.table && { table: context.table }),
        ...(context.errorType && { error_type: context.errorType }),
      };

      this.databaseOperationCounter?.add(1, attributes);
      this.databaseOperationDuration?.record(context.duration, attributes);

      if (context.rowsAffected !== undefined) {
        this.databaseRowsAffected?.record(context.rowsAffected, attributes);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordDatabaseOperation', error);
    }
  }

  /**
   * Record connection pool statistics
   */
  recordConnectionPoolStats(context: Pick<DatabaseMetricsContext, 'connectionPoolSize' | 'activeConnections'>): void {
    if (!this.initialized) return;

    try {
      if (context.connectionPoolSize !== undefined) {
        this.connectionPoolSizeGauge?.add(context.connectionPoolSize);
      }

      if (context.activeConnections !== undefined) {
        this.databaseActiveConnectionsGauge?.add(context.activeConnections);
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordConnectionPoolStats', error);
    }
  }

  // ============================================================================
  // CACHE METRICS
  // ============================================================================

  /**
   * Record cache operation metrics
   */
  recordCacheOperation(context: CacheMetricsContext): void {
    if (!this.initialized) return;

    try {
      const attributes = {
        operation: context.operation,
        hit: context.hit.toString(),
        success: context.success.toString(),
        ...(context.keyPattern && { key_pattern: context.keyPattern }),
        ...(context.errorType && { error_type: context.errorType }),
      };

      this.cacheOperationCounter?.add(1, attributes);
      this.cacheOperationDuration?.record(context.duration, attributes);

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordCacheOperation', error);
    }
  }

  /**
   * Record cache hit rate
   */
  recordCacheHitRate(rate: number): void {
    if (!this.initialized) return;

    try {
      this.cacheHitRateGauge?.record(rate);
      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordCacheHitRate', error);
    }
  }

  /**
   * Record cache size
   */
  recordCacheSize(bytes: number): void {
    if (!this.initialized) return;

    try {
      this.cacheSizeGauge?.add(bytes);
      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordCacheSize', error);
    }
  }

  // ============================================================================
  // SYSTEM METRICS
  // ============================================================================

  /**
   * Record system metrics
   */
  recordSystemMetrics(context: SystemMetricsContext): void {
    if (!this.initialized) return;

    try {
      if (context.cpuUsage !== undefined) {
        this.cpuUsageGauge?.record(context.cpuUsage);
      }

      if (context.memoryUsage !== undefined) {
        this.memoryUsageGauge?.add(context.memoryUsage);
      }

      if (context.diskUsage !== undefined) {
        this.diskUsageGauge?.add(context.diskUsage);
      }

      if (context.networkBytesIn !== undefined) {
        this.networkBytesCounter?.add(context.networkBytesIn, { direction: 'in' });
      }

      if (context.networkBytesOut !== undefined) {
        this.networkBytesCounter?.add(context.networkBytesOut, { direction: 'out' });
      }

      this.metricsRecorded++;
    } catch (error) {
      this.handleError('recordSystemMetrics', error);
    }
  }

  // ============================================================================
  // HEALTH AND LIFECYCLE
  // ============================================================================

  /**
   * Get collector health status
   */
  getCollectorHealth(): { healthy: boolean; initialized: boolean; metricsRecorded: number; lastError?: string } {
    return {
      healthy: this.initialized && this.lastError === null,
      initialized: this.initialized,
      metricsRecorded: this.metricsRecorded,
      lastError: this.lastError || undefined,
    };
  }

  /**
   * Shutdown the metrics collector
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      console.log('MetricsCollector: Starting graceful shutdown...');

      // Reset all metric instruments
      this.roomOperationCounter = null;
      this.roomOperationDuration = null;
      this.activeRoomsGauge = null;
      this.totalParticipantsGauge = null;
      
      this.webrtcOperationCounter = null;
      this.webrtcOperationDuration = null;
      this.connectionQualityGauge = null;
      this.connectionBandwidthGauge = null;
      this.connectionLatencyGauge = null;
      this.activeConnectionsGauge = null;
      
      this.recordingOperationCounter = null;
      this.recordingOperationDuration = null;
      this.recordingFileSizeHistogram = null;
      this.activeRecordingsGauge = null;
      this.totalRecordingSizeGauge = null;
      
      this.databaseOperationCounter = null;
      this.databaseOperationDuration = null;
      this.databaseRowsAffected = null;
      this.connectionPoolSizeGauge = null;
      this.databaseActiveConnectionsGauge = null;
      
      this.cacheOperationCounter = null;
      this.cacheOperationDuration = null;
      this.cacheHitRateGauge = null;
      this.cacheSizeGauge = null;
      
      this.cpuUsageGauge = null;
      this.memoryUsageGauge = null;
      this.diskUsageGauge = null;
      this.networkBytesCounter = null;

      // Reset state
      this.meter = null;
      this.initialized = false;

      console.log('MetricsCollector: Graceful shutdown completed');
    } catch (error) {
      this.handleError('shutdown', error);
      throw error;
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(operation: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.lastError = `${operation}: ${errorMessage}`;
    console.error(`MetricsCollector.${operation}:`, errorMessage);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global metrics collector instance
 */
export const metricsCollector = new MetricsCollector();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Initialize metrics collector
 */
export async function initializeMetricsCollector(serviceName: string, serviceVersion: string): Promise<void> {
  await metricsCollector.initialize(serviceName, serviceVersion);
}

/**
 * Record room operation with global collector
 */
export function recordRoomOperation(context: RoomMetricsContext): void {
  metricsCollector.recordRoomOperation(context);
}

/**
 * Record WebRTC operation with global collector
 */
export function recordWebRTCOperation(context: WebRTCMetricsContext): void {
  metricsCollector.recordWebRTCOperation(context);
}

/**
 * Record recording operation with global collector
 */
export function recordRecordingOperation(context: RecordingMetricsContext): void {
  metricsCollector.recordRecordingOperation(context);
}

/**
 * Record database operation with global collector
 */
export function recordDatabaseOperation(context: DatabaseMetricsContext): void {
  metricsCollector.recordDatabaseOperation(context);
}

/**
 * Record cache operation with global collector
 */
export function recordCacheOperation(context: CacheMetricsContext): void {
  metricsCollector.recordCacheOperation(context);
}

/**
 * Record system metrics with global collector
 */
export function recordSystemMetrics(context: SystemMetricsContext): void {
  metricsCollector.recordSystemMetrics(context);
}

/**
 * Get metrics collector health
 */
export function getMetricsCollectorHealth(): { healthy: boolean; initialized: boolean; metricsRecorded: number; lastError?: string } {
  return metricsCollector.getCollectorHealth();
}

/**
 * Shutdown metrics collector
 */
export async function shutdownMetricsCollector(): Promise<void> {
  await metricsCollector.shutdown();
}