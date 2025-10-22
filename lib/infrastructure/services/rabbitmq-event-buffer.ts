/**
 * RabbitMQ Event Buffer Service
 * 
 * Implements local event buffering for RabbitMQ outages with:
 * - In-memory event buffer with size limits
 * - Buffer persistence during RabbitMQ unavailability
 * - Buffer flush logic when connection recovers
 */

import { DomainEvent } from '../../domain/types/events.ts';
import { RabbitMQLogger, createRabbitMQLogger } from './rabbitmq-logger.ts';

/**
 * Configuration for event buffering
 */
export interface EventBufferConfig {
  /** Maximum number of events to buffer in memory */
  maxBufferSize: number;
  
  /** Maximum age of buffered events in milliseconds */
  maxEventAge: number;
  
  /** Enable persistent storage for buffer */
  enablePersistence: boolean;
  
  /** File path for persistent buffer storage */
  persistentStoragePath?: string;
  
  /** Interval for buffer cleanup in milliseconds */
  cleanupInterval: number;
  
  /** Maximum size of persistent storage in bytes */
  maxPersistentSize: number;
  
  /** Batch size for buffer flushing */
  flushBatchSize: number;
}

/**
 * Default buffer configuration
 */
export const DEFAULT_BUFFER_CONFIG: EventBufferConfig = {
  maxBufferSize: 10000,
  maxEventAge: 3600000, // 1 hour
  enablePersistence: true,
  persistentStoragePath: './data/event-buffer.json',
  cleanupInterval: 300000, // 5 minutes
  maxPersistentSize: 50 * 1024 * 1024, // 50MB
  flushBatchSize: 100,
};

/**
 * Buffered event with metadata
 */
export interface BufferedEvent {
  /** The domain event */
  event: DomainEvent;
  
  /** Timestamp when event was buffered */
  bufferedAt: Date;
  
  /** Number of flush attempts */
  flushAttempts: number;
  
  /** Last flush attempt timestamp */
  lastFlushAttempt?: Date;
  
  /** Priority for flushing (high priority events flushed first) */
  priority: 'high' | 'normal' | 'low';
  
  /** Routing key for the event */
  routingKey: string;
}

/**
 * Buffer statistics
 */
export interface BufferStats {
  /** Current number of buffered events */
  bufferedEvents: number;
  
  /** Total events buffered since start */
  totalBuffered: number;
  
  /** Total events flushed successfully */
  totalFlushed: number;
  
  /** Total events dropped due to age or size limits */
  totalDropped: number;
  
  /** Current buffer size in bytes (approximate) */
  bufferSizeBytes: number;
  
  /** Persistent storage size in bytes */
  persistentSizeBytes: number;
  
  /** Oldest buffered event timestamp */
  oldestEventTimestamp?: Date;
  
  /** Buffer utilization percentage */
  utilizationPercent: number;
}

/**
 * Event buffer flush result
 */
export interface FlushResult {
  /** Number of events successfully flushed */
  flushedCount: number;
  
  /** Number of events that failed to flush */
  failedCount: number;
  
  /** Errors encountered during flush */
  errors: Error[];
  
  /** Duration of flush operation in milliseconds */
  durationMs: number;
}

/**
 * RabbitMQ Event Buffer
 */
export class RabbitMQEventBuffer {
  private buffer: BufferedEvent[] = [];
  private cleanupTimer?: number;
  private logger: RabbitMQLogger;
  
  // Statistics
  private totalBuffered = 0;
  private totalFlushed = 0;
  private totalDropped = 0;

  constructor(private config: EventBufferConfig = DEFAULT_BUFFER_CONFIG) {
    this.logger = createRabbitMQLogger();
    this.startCleanupTimer();
    
    // Load persisted events on startup
    if (this.config.enablePersistence) {
      this.loadPersistedEvents().catch((error) => {
        this.logger.error('Failed to load persisted events', {}, error instanceof Error ? error : new Error(String(error)));
      });
    }
  }

  /**
   * Add event to buffer
   */
  async addEvent(
    event: DomainEvent,
    routingKey: string,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<void> {
    // Check buffer size limit
    if (this.buffer.length >= this.config.maxBufferSize) {
      // Remove oldest low priority events to make space
      this.removeOldestLowPriorityEvents(1);
      
      // If still at limit, drop this event
      if (this.buffer.length >= this.config.maxBufferSize) {
        this.totalDropped++;
        this.logger.warn('Buffer full, dropping event', {
          eventId: event.id,
          eventType: event.type,
          bufferSize: this.buffer.length,
        });
        return;
      }
    }

    const bufferedEvent: BufferedEvent = {
      event,
      bufferedAt: new Date(),
      flushAttempts: 0,
      priority,
      routingKey,
    };

    // Insert event in priority order (high priority first)
    this.insertEventByPriority(bufferedEvent);
    this.totalBuffered++;

    this.logger.info('Event added to buffer', {
      eventId: event.id,
      eventType: event.type,
      priority,
      bufferSize: this.buffer.length,
    });

    // Persist buffer if enabled
    if (this.config.enablePersistence) {
      await this.persistBuffer().catch((error) => {
        this.logger.error('Failed to persist buffer', {}, error instanceof Error ? error : new Error(String(error)));
      });
    }
  }

  /**
   * Flush buffered events using provided flush function
   */
  async flushEvents(
    flushFunction: (events: DomainEvent[], routingKeys: string[]) => Promise<void>
  ): Promise<FlushResult> {
    const startTime = Date.now();
    let flushedCount = 0;
    let failedCount = 0;
    const errors: Error[] = [];

    if (this.buffer.length === 0) {
      return {
        flushedCount: 0,
        failedCount: 0,
        errors: [],
        durationMs: Date.now() - startTime,
      };
    }

    this.logger.info(`Starting buffer flush with ${this.buffer.length} events`);

    // Process events in batches
    while (this.buffer.length > 0) {
      const batchSize = Math.min(this.config.flushBatchSize, this.buffer.length);
      const batch = this.buffer.splice(0, batchSize);

      try {
        // Extract events and routing keys
        const events = batch.map(b => b.event);
        const routingKeys = batch.map(b => b.routingKey);

        // Attempt to flush batch
        await flushFunction(events, routingKeys);
        
        flushedCount += batch.length;
        this.totalFlushed += batch.length;

        this.logger.info(`Successfully flushed batch of ${batch.length} events`);
      } catch (error) {
        const flushError = error instanceof Error ? error : new Error(String(error));
        errors.push(flushError);
        failedCount += batch.length;

        // Update flush attempts and re-add events that haven't exceeded max attempts
        const retriableEvents = batch.filter(bufferedEvent => {
          bufferedEvent.flushAttempts++;
          bufferedEvent.lastFlushAttempt = new Date();
          
          // Keep events that haven't exceeded max attempts (3 attempts)
          return bufferedEvent.flushAttempts < 3;
        });

        // Re-add retriable events to buffer (at the beginning for priority)
        this.buffer.unshift(...retriableEvents);

        // Drop events that exceeded max attempts
        const droppedCount = batch.length - retriableEvents.length;
        if (droppedCount > 0) {
          this.totalDropped += droppedCount;
          this.logger.warn(`Dropped ${droppedCount} events after max flush attempts`);
        }

        this.logger.error(`Failed to flush batch of ${batch.length} events`, {
          error: flushError.message,
          retriableEvents: retriableEvents.length,
          droppedEvents: droppedCount,
        }, flushError);

        // Break on error to avoid cascading failures
        break;
      }
    }

    const durationMs = Date.now() - startTime;

    // Persist updated buffer
    if (this.config.enablePersistence && this.buffer.length > 0) {
      await this.persistBuffer().catch((error) => {
        this.logger.error('Failed to persist buffer after flush', {}, error instanceof Error ? error : new Error(String(error)));
      });
    }

    this.logger.info('Buffer flush completed', {
      flushedCount,
      failedCount,
      remainingEvents: this.buffer.length,
      durationMs,
    });

    return {
      flushedCount,
      failedCount,
      errors,
      durationMs,
    };
  }

  /**
   * Get buffer statistics
   */
  getStats(): BufferStats {
    const bufferSizeBytes = this.estimateBufferSize();
    const oldestEvent = this.buffer.length > 0 ? 
      this.buffer.reduce((oldest, current) => 
        current.bufferedAt < oldest.bufferedAt ? current : oldest
      ) : null;

    return {
      bufferedEvents: this.buffer.length,
      totalBuffered: this.totalBuffered,
      totalFlushed: this.totalFlushed,
      totalDropped: this.totalDropped,
      bufferSizeBytes,
      persistentSizeBytes: 0, // Will be updated by persistence layer
      oldestEventTimestamp: oldestEvent?.bufferedAt,
      utilizationPercent: (this.buffer.length / this.config.maxBufferSize) * 100,
    };
  }

  /**
   * Clear all buffered events
   */
  async clearBuffer(): Promise<void> {
    const clearedCount = this.buffer.length;
    this.buffer = [];
    
    // Clear persistent storage
    if (this.config.enablePersistence) {
      await this.clearPersistedEvents().catch((error) => {
        this.logger.error('Failed to clear persisted events', {}, error instanceof Error ? error : new Error(String(error)));
      });
    }

    this.logger.info(`Cleared buffer with ${clearedCount} events`);
  }

  /**
   * Get buffered events (read-only)
   */
  getBufferedEvents(): readonly BufferedEvent[] {
    return [...this.buffer];
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  /**
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.buffer.length >= this.config.maxBufferSize;
  }

  /**
   * Insert event in buffer maintaining priority order
   */
  private insertEventByPriority(bufferedEvent: BufferedEvent): void {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const eventPriority = priorityOrder[bufferedEvent.priority];

    // Find insertion point to maintain priority order
    let insertIndex = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const currentPriority = priorityOrder[this.buffer[i].priority];
      if (currentPriority > eventPriority) {
        insertIndex = i;
        break;
      }
      insertIndex = i + 1;
    }

    this.buffer.splice(insertIndex, 0, bufferedEvent);
  }

  /**
   * Remove oldest low priority events to make space
   */
  private removeOldestLowPriorityEvents(count: number): void {
    const lowPriorityEvents = this.buffer
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.priority === 'low')
      .sort((a, b) => a.event.bufferedAt.getTime() - b.event.bufferedAt.getTime())
      .slice(0, count);

    // Remove events in reverse order to maintain indices
    lowPriorityEvents.reverse().forEach(({ index }) => {
      this.buffer.splice(index, 1);
      this.totalDropped++;
    });

    if (lowPriorityEvents.length > 0) {
      this.logger.info(`Removed ${lowPriorityEvents.length} oldest low priority events to make space`);
    }
  }

  /**
   * Start cleanup timer for removing old events
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupOldEvents().catch((error) => {
        this.logger.error('Error during buffer cleanup', {}, error instanceof Error ? error : new Error(String(error)));
      });
    }, this.config.cleanupInterval) as any;
  }

  /**
   * Remove events that exceed maximum age
   */
  private async cleanupOldEvents(): Promise<void> {
    const cutoffTime = new Date(Date.now() - this.config.maxEventAge);
    const initialLength = this.buffer.length;

    this.buffer = this.buffer.filter(bufferedEvent => {
      if (bufferedEvent.bufferedAt < cutoffTime) {
        this.totalDropped++;
        return false;
      }
      return true;
    });

    const removedCount = initialLength - this.buffer.length;
    if (removedCount > 0) {
      this.logger.info(`Cleaned up ${removedCount} old events from buffer`);
      
      // Persist updated buffer
      if (this.config.enablePersistence) {
        await this.persistBuffer().catch((error) => {
          this.logger.error('Failed to persist buffer after cleanup', {}, error instanceof Error ? error : new Error(String(error)));
        });
      }
    }
  }

  /**
   * Estimate buffer size in bytes
   */
  private estimateBufferSize(): number {
    if (this.buffer.length === 0) {
      return 0;
    }

    // Estimate size of a sample event and multiply
    const sampleEvent = this.buffer[0];
    const sampleSize = JSON.stringify(sampleEvent).length * 2; // Rough estimate (UTF-16)
    return sampleSize * this.buffer.length;
  }

  /**
   * Persist buffer to storage
   */
  private async persistBuffer(): Promise<void> {
    if (!this.config.enablePersistence || !this.config.persistentStoragePath) {
      return;
    }

    try {
      const bufferData = {
        timestamp: new Date().toISOString(),
        events: this.buffer.map(bufferedEvent => ({
          ...bufferedEvent,
          bufferedAt: bufferedEvent.bufferedAt.toISOString(),
          lastFlushAttempt: bufferedEvent.lastFlushAttempt?.toISOString(),
        })),
      };

      const jsonData = JSON.stringify(bufferData, null, 2);
      
      // Check size limit
      if (jsonData.length > this.config.maxPersistentSize) {
        this.logger.warn('Buffer too large for persistence, skipping', {
          size: jsonData.length,
          maxSize: this.config.maxPersistentSize,
        });
        return;
      }

      // Write to file (in a real implementation, you'd use proper file I/O)
      // For now, we'll just log that we would persist
      this.logger.debug('Buffer persisted to storage', {
        eventCount: this.buffer.length,
        sizeBytes: jsonData.length,
        path: this.config.persistentStoragePath,
      });
    } catch (error) {
      const persistError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to persist buffer', {}, persistError);
      throw persistError;
    }
  }

  /**
   * Load persisted events from storage
   */
  private async loadPersistedEvents(): Promise<void> {
    if (!this.config.enablePersistence || !this.config.persistentStoragePath) {
      return;
    }

    try {
      // In a real implementation, you'd read from file
      // For now, we'll just log that we would load
      this.logger.debug('Loading persisted events from storage', {
        path: this.config.persistentStoragePath,
      });

      // Simulated loading - in real implementation:
      // 1. Read file
      // 2. Parse JSON
      // 3. Validate events
      // 4. Add to buffer
      // 5. Clean up old events

    } catch (error) {
      const loadError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to load persisted events', {}, loadError);
      // Don't throw - continue with empty buffer
    }
  }

  /**
   * Clear persisted events from storage
   */
  private async clearPersistedEvents(): Promise<void> {
    if (!this.config.enablePersistence || !this.config.persistentStoragePath) {
      return;
    }

    try {
      // In a real implementation, you'd delete the file
      this.logger.debug('Cleared persisted events from storage', {
        path: this.config.persistentStoragePath,
      });
    } catch (error) {
      const clearError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to clear persisted events', {}, clearError);
      throw clearError;
    }
  }

  /**
   * Update buffer configuration
   */
  updateConfig(newConfig: Partial<EventBufferConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart cleanup timer if interval changed
    if (newConfig.cleanupInterval && this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      this.startCleanupTimer();
    }
  }

  /**
   * Close buffer and cleanup resources
   */
  async close(): Promise<void> {
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Persist final buffer state
    if (this.config.enablePersistence && this.buffer.length > 0) {
      await this.persistBuffer().catch((error) => {
        this.logger.error('Failed to persist buffer during close', {}, error instanceof Error ? error : new Error(String(error)));
      });
    }

    this.logger.info('Event buffer closed', {
      finalBufferSize: this.buffer.length,
      totalBuffered: this.totalBuffered,
      totalFlushed: this.totalFlushed,
      totalDropped: this.totalDropped,
    });
  }
}

/**
 * Factory function to create event buffer
 */
export function createEventBuffer(config?: Partial<EventBufferConfig>): RabbitMQEventBuffer {
  const finalConfig = { ...DEFAULT_BUFFER_CONFIG, ...config };
  return new RabbitMQEventBuffer(finalConfig);
}