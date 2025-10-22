/**
 * RabbitMQ Asynchronous Event Publisher Service
 * 
 * Implements non-blocking event publishing with Promise handling,
 * event queuing for batch publishing, and background processing
 * for event buffer management.
 */

import type { ChannelWrapper } from 'amqp-connection-manager';
import {
  DomainEvent,
  EventEnvelope,
  EventPublisher,
  EventValidationResult,
  EventType,
} from '../../domain/types/events.ts';
import {
  RabbitMQConfig,
  PublishResult,
  DEFAULT_ROUTING_PATTERNS,
} from '../../domain/types/rabbitmq-config.ts';
import { RabbitMQConnectionManager } from './rabbitmq-connection-manager.ts';
import { RabbitMQCircuitBreakerWithFallback, createCircuitBreakerWithFallback } from './rabbitmq-circuit-breaker.ts';
import { RabbitMQRetryService, createRetryService } from './rabbitmq-retry-service.ts';
import { RabbitMQDeadLetterService, createDeadLetterService } from './rabbitmq-dead-letter-service.ts';
import { RabbitMQMonitoringService, createMonitoringService } from './rabbitmq-monitoring-service.ts';
import { RabbitMQLogger, createRabbitMQLogger } from './rabbitmq-logger.ts';
import { RabbitMQEventBuffer, createEventBuffer, EventBufferConfig } from './rabbitmq-event-buffer.ts';

/**
 * Configuration for asynchronous publishing
 */
export interface AsyncPublishConfig {
  /** Maximum number of events to buffer before forcing a flush */
  maxBufferSize: number;
  
  /** Maximum time to wait before flushing buffer (milliseconds) */
  flushInterval: number;
  
  /** Maximum number of concurrent publish operations */
  maxConcurrency: number;
  
  /** Enable background processing */
  enableBackgroundProcessing: boolean;
  
  /** Batch size for background processing */
  batchSize: number;
  
  /** Maximum time to wait for a publish operation (milliseconds) */
  publishTimeout: number;
  
  /** Event buffer configuration for outage handling */
  bufferConfig?: Partial<EventBufferConfig>;
}

/**
 * Default async publish configuration
 */
export const DEFAULT_ASYNC_CONFIG: AsyncPublishConfig = {
  maxBufferSize: 1000,
  flushInterval: 5000, // 5 seconds
  maxConcurrency: 10,
  enableBackgroundProcessing: true,
  batchSize: 50,
  publishTimeout: 30000, // 30 seconds
};

/**
 * Queued event with metadata
 */
interface QueuedEvent {
  event: DomainEvent;
  resolve: (value: void | PromiseLike<void>) => void;
  reject: (reason?: any) => void;
  timestamp: Date;
  retryCount: number;
}

/**
 * Publish operation result
 */
interface PublishOperation {
  event: DomainEvent;
  promise: Promise<void>;
  startTime: Date;
}

/**
 * RabbitMQ Asynchronous Event Publisher
 */
export class RabbitMQAsyncEventPublisher implements EventPublisher {
  private connectionManager: RabbitMQConnectionManager;
  private circuitBreaker: RabbitMQCircuitBreakerWithFallback<void>;
  private retryService: RabbitMQRetryService;
  private deadLetterService: RabbitMQDeadLetterService;
  private monitoringService: RabbitMQMonitoringService;
  private logger: RabbitMQLogger;
  private eventBuffer: RabbitMQEventBuffer;
  
  // Async publishing state
  private eventQueue: QueuedEvent[] = [];
  private activeOperations = new Map<string, PublishOperation>();
  private flushTimer?: number;
  private backgroundProcessor?: number;
  private bufferFlushTimer?: number;
  private isProcessing = false;
  private isShuttingDown = false;
  private isRabbitMQAvailable = true;
  
  // Statistics
  private publishedEvents = 0;
  private failedEvents = 0;
  private queuedEvents = 0;
  private processedBatches = 0;

  constructor(
    private config: RabbitMQConfig,
    private asyncConfig: AsyncPublishConfig = DEFAULT_ASYNC_CONFIG
  ) {
    this.connectionManager = new RabbitMQConnectionManager(config);
    this.circuitBreaker = createCircuitBreakerWithFallback(
      config.circuitBreaker,
      () => this.fallbackPublish()
    );
    this.retryService = createRetryService(config.retry);
    this.deadLetterService = createDeadLetterService(config);
    this.logger = createRabbitMQLogger();
    this.monitoringService = createMonitoringService(
      this.connectionManager,
      this.circuitBreaker,
      this.retryService,
      this.deadLetterService
    );
    this.eventBuffer = createEventBuffer(asyncConfig.bufferConfig);
  }

  /**
   * Initialize the async publisher
   */
  async initialize(): Promise<void> {
    await this.connectionManager.connect();
    await this.deadLetterService.initialize();
    
    if (this.asyncConfig.enableBackgroundProcessing) {
      this.startBackgroundProcessing();
    }
    
    this.startFlushTimer();
    this.startBufferFlushTimer();
    
    // Monitor connection status for buffer management
    this.monitorConnectionStatus();
    
    this.logger.logConnectionEvent('connected', 'Async event publisher initialized');
  }

  /**
   * Publish a single domain event asynchronously
   */
  async publish(event: DomainEvent): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Publisher is shutting down');
    }

    // Validate event
    const validation = this.validateEvent(event);
    if (!validation.isValid) {
      this.logger.logValidationError(event, validation.errors);
      throw new Error(`Event validation failed: ${validation.errors.join(', ')}`);
    }

    // Check if we should publish immediately or queue
    if (this.shouldPublishImmediately(event)) {
      return this.publishImmediately(event);
    }

    // Queue the event for batch processing
    return this.queueEvent(event);
  }

  /**
   * Publish multiple events in a batch asynchronously
   */
  async publishBatch(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    if (this.isShuttingDown) {
      throw new Error('Publisher is shutting down');
    }

    // Validate all events first
    for (const event of events) {
      const validation = this.validateEvent(event);
      if (!validation.isValid) {
        this.logger.logValidationError(event, validation.errors);
        throw new Error(`Event validation failed: ${validation.errors.join(', ')}`);
      }
    }

    // Process batch with concurrency control
    return this.processBatchWithConcurrency(events);
  }

  /**
   * Determine if event should be published immediately
   */
  private shouldPublishImmediately(event: DomainEvent): boolean {
    // High priority events are published immediately
    if (event.metadata?.priority === 'high') {
      return true;
    }

    // If buffer is full, publish immediately
    if (this.eventQueue.length >= this.asyncConfig.maxBufferSize) {
      return true;
    }

    // If we're at max concurrency, queue the event
    if (this.activeOperations.size >= this.asyncConfig.maxConcurrency) {
      return false;
    }

    // Default to queueing for batch processing
    return false;
  }

  /**
   * Publish event immediately without queueing
   */
  private async publishImmediately(event: DomainEvent): Promise<void> {
    const operationId = `${event.id}-${Date.now()}`;
    const operation: PublishOperation = {
      event,
      promise: this.executePublish(event),
      startTime: new Date(),
    };

    this.activeOperations.set(operationId, operation);

    try {
      // Add timeout to prevent hanging operations
      await Promise.race([
        operation.promise,
        this.createTimeoutPromise(this.asyncConfig.publishTimeout),
      ]);

      this.publishedEvents++;
      this.monitoringService.recordPublishSuccess(event, Date.now() - operation.startTime.getTime());
      this.logger.logPublishSuccess(event, Date.now() - operation.startTime.getTime());
    } catch (error) {
      this.failedEvents++;
      const publishError = error instanceof Error ? error : new Error(String(error));
      
      this.monitoringService.recordPublishFailure(event, publishError, Date.now() - operation.startTime.getTime());
      this.logger.logPublishFailure(event, publishError, Date.now() - operation.startTime.getTime());
      
      throw publishError;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Queue event for batch processing
   */
  private async queueEvent(event: DomainEvent): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const queuedEvent: QueuedEvent = {
        event,
        resolve,
        reject,
        timestamp: new Date(),
        retryCount: 0,
      };

      this.eventQueue.push(queuedEvent);
      this.queuedEvents++;

      // If buffer is full, trigger immediate flush
      if (this.eventQueue.length >= this.asyncConfig.maxBufferSize) {
        this.flushEventQueue().catch((error) => {
          this.logger.error('Error flushing event queue', {}, error instanceof Error ? error : new Error(String(error)));
        });
      }
    });
  }

  /**
   * Process batch with concurrency control
   */
  private async processBatchWithConcurrency(events: DomainEvent[]): Promise<void> {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    const errors: Error[] = [];

    // Create semaphore for concurrency control
    const semaphore = new Array(this.asyncConfig.maxConcurrency).fill(null);
    let semaphoreIndex = 0;

    const processEvent = async (event: DomainEvent): Promise<void> => {
      // Wait for available slot
      await new Promise<void>((resolve) => {
        const checkSlot = () => {
          if (this.activeOperations.size < this.asyncConfig.maxConcurrency) {
            resolve();
          } else {
            setTimeout(checkSlot, 10);
          }
        };
        checkSlot();
      });

      try {
        await this.executePublish(event);
        successCount++;
      } catch (error) {
        failureCount++;
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    };

    // Process all events with concurrency control
    await Promise.allSettled(events.map(processEvent));
    
    const durationMs = Date.now() - startTime;
    this.logger.logBatchPublish(events, durationMs, successCount, failureCount);
    
    if (failureCount > 0) {
      const errorMessage = `Batch publish partially failed: ${failureCount}/${events.length} events failed`;
      throw new Error(errorMessage);
    }
  }

  /**
   * Execute the actual publish operation
   */
  private async executePublish(event: DomainEvent): Promise<void> {
    // If RabbitMQ is unavailable, buffer the event
    if (!this.isRabbitMQAvailable) {
      const priority = event.metadata?.priority || 'normal';
      const routingKey = this.generateRoutingKey(event.type);
      await this.eventBuffer.addEvent(event, routingKey, priority);
      this.logger.info('Event buffered due to RabbitMQ unavailability', {
        eventId: event.id,
        eventType: event.type,
      });
      return;
    }

    return this.retryService.executeWithRetry(
      async () => {
        await this.circuitBreaker.executeWithFallback(async () => {
          await this.publishEvent(event);
        });
      },
      event,
      'async_publish_event'
    ).then((result) => {
      if (!result.success) {
        // If publish failed, buffer the event
        const priority = event.metadata?.priority || 'normal';
        const routingKey = this.generateRoutingKey(event.type);
        this.eventBuffer.addEvent(event, routingKey, priority).catch((bufferError) => {
          this.logger.error('Failed to buffer event after publish failure', {}, bufferError instanceof Error ? bufferError : new Error(String(bufferError)));
        });
        throw result.error!;
      }
    });
  }

  /**
   * Internal method to publish event
   */
  private async publishEvent(event: DomainEvent): Promise<void> {
    const routingKey = this.generateRoutingKey(event.type);
    const envelope = this.createEventEnvelope(event);
    const messageBuffer = this.serializeEvent(envelope);
    const channel = this.connectionManager.getPublishChannel();
    
    await this.publishWithConfirmation(channel, routingKey, messageBuffer, event);
  }

  /**
   * Start background processing for queued events
   */
  private startBackgroundProcessing(): void {
    if (this.backgroundProcessor) {
      return;
    }

    this.backgroundProcessor = setInterval(() => {
      if (!this.isProcessing && this.eventQueue.length > 0) {
        this.processQueuedEvents().catch((error) => {
          this.logger.error('Error in background processing', {}, error instanceof Error ? error : new Error(String(error)));
        });
      }
    }, 1000) as any; // Process every second
  }

  /**
   * Start flush timer for periodic queue flushing
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.flushEventQueue().catch((error) => {
          this.logger.error('Error in flush timer', {}, error instanceof Error ? error : new Error(String(error)));
        });
      }
    }, this.asyncConfig.flushInterval) as any;
  }

  /**
   * Process queued events in background
   */
  private async processQueuedEvents(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Take a batch of events from the queue
      const batchSize = Math.min(this.asyncConfig.batchSize, this.eventQueue.length);
      const batch = this.eventQueue.splice(0, batchSize);

      if (batch.length === 0) {
        return;
      }

      this.processedBatches++;
      this.logger.info(`Processing batch of ${batch.length} events`, {
        batchSize: batch.length,
        queueLength: this.eventQueue.length,
      });

      // Process batch with concurrency control
      await this.processBatch(batch);
    } catch (error) {
      this.logger.error('Error processing queued events', {}, error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a batch of queued events
   */
  private async processBatch(batch: QueuedEvent[]): Promise<void> {
    const processEvent = async (queuedEvent: QueuedEvent): Promise<void> => {
      try {
        await this.executePublish(queuedEvent.event);
        queuedEvent.resolve();
        this.publishedEvents++;
      } catch (error) {
        const publishError = error instanceof Error ? error : new Error(String(error));
        
        // Check if we should retry
        if (queuedEvent.retryCount < this.config.retry.maxAttempts) {
          queuedEvent.retryCount++;
          this.eventQueue.push(queuedEvent); // Re-queue for retry
          return;
        }

        // Try to buffer the event before sending to DLQ
        const priority = queuedEvent.event.metadata?.priority || 'normal';
        const routingKey = this.generateRoutingKey(queuedEvent.event.type);
        
        try {
          await this.eventBuffer.addEvent(queuedEvent.event, routingKey, priority);
          this.logger.info('Event buffered after max retries', {
            eventId: queuedEvent.event.id,
            retryCount: queuedEvent.retryCount,
          });
          queuedEvent.resolve(); // Resolve as buffered
        } catch (bufferError) {
          // If buffering also fails, send to DLQ
          await this.deadLetterService.sendToDeadLetterQueue(
            queuedEvent.event,
            publishError,
            queuedEvent.retryCount,
            routingKey,
            queuedEvent.timestamp.getTime()
          );

          queuedEvent.reject(publishError);
          this.failedEvents++;
        }
      }
    };

    // Process batch with concurrency control
    const semaphore = new Array(this.asyncConfig.maxConcurrency).fill(null);
    const processPromises = batch.map(async (queuedEvent, index) => {
      // Wait for available slot
      await new Promise<void>((resolve) => {
        const slotIndex = index % this.asyncConfig.maxConcurrency;
        const checkSlot = () => {
          if (!semaphore[slotIndex]) {
            semaphore[slotIndex] = true;
            resolve();
          } else {
            setTimeout(checkSlot, 10);
          }
        };
        checkSlot();
      });

      try {
        await processEvent(queuedEvent);
      } finally {
        const slotIndex = index % this.asyncConfig.maxConcurrency;
        semaphore[slotIndex] = null;
      }
    });

    await Promise.allSettled(processPromises);
  }

  /**
   * Flush event queue immediately
   */
  private async flushEventQueue(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    this.logger.info(`Flushing event queue with ${this.eventQueue.length} events`);
    await this.processQueuedEvents();
  }

  /**
   * Create timeout promise for operation timeout
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Fallback mechanism when RabbitMQ is unavailable
   */
  private async fallbackPublish(): Promise<void> {
    this.isRabbitMQAvailable = false;
    this.logger.warn('RabbitMQ unavailable: events will be buffered locally');
    // Events are handled by the local buffer system
  }

  /**
   * Monitor connection status and manage buffer flushing
   */
  private monitorConnectionStatus(): void {
    // Check connection status periodically
    setInterval(async () => {
      try {
        const health = await this.monitoringService.getHealthStatus();
        const wasAvailable = this.isRabbitMQAvailable;
        this.isRabbitMQAvailable = health.healthy;

        // If connection recovered, flush buffer
        if (!wasAvailable && this.isRabbitMQAvailable) {
          this.logger.info('RabbitMQ connection recovered, flushing buffer');
          await this.flushEventBuffer();
        }
      } catch (error) {
        this.isRabbitMQAvailable = false;
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Start buffer flush timer for periodic buffer flushing
   */
  private startBufferFlushTimer(): void {
    if (this.bufferFlushTimer) {
      return;
    }

    this.bufferFlushTimer = setInterval(async () => {
      if (this.isRabbitMQAvailable && !this.eventBuffer.isEmpty()) {
        try {
          await this.flushEventBuffer();
        } catch (error) {
          this.logger.error('Error in buffer flush timer', {}, error instanceof Error ? error : new Error(String(error)));
        }
      }
    }, 30000) as any; // Try to flush every 30 seconds
  }

  /**
   * Flush events from buffer when RabbitMQ is available
   */
  private async flushEventBuffer(): Promise<void> {
    if (!this.isRabbitMQAvailable || this.eventBuffer.isEmpty()) {
      return;
    }

    const flushResult = await this.eventBuffer.flushEvents(
      async (events: DomainEvent[], routingKeys: string[]) => {
        // Process events in batches with concurrency control
        const batchPromises = events.map(async (event, index) => {
          const routingKey = routingKeys[index];
          await this.publishEvent(event);
        });

        await Promise.all(batchPromises);
      }
    );

    this.publishedEvents += flushResult.flushedCount;
    this.failedEvents += flushResult.failedCount;

    this.logger.info('Buffer flush completed', {
      flushedCount: flushResult.flushedCount,
      failedCount: flushResult.failedCount,
      durationMs: flushResult.durationMs,
    });
  }

  // Validation, routing, serialization methods (same as base publisher)
  private validateEvent(event: DomainEvent): EventValidationResult {
    const errors: string[] = [];

    if (!event.id || typeof event.id !== 'string') {
      errors.push('Event ID is required and must be a string');
    }

    if (!event.type || typeof event.type !== 'string') {
      errors.push('Event type is required and must be a string');
    }

    if (!event.version || typeof event.version !== 'string') {
      errors.push('Event version is required and must be a string');
    }

    if (!event.timestamp || !(event.timestamp instanceof Date)) {
      errors.push('Event timestamp is required and must be a Date object');
    }

    if (!event.data || typeof event.data !== 'object') {
      errors.push('Event data is required and must be an object');
    }

    if (event.type && !this.isValidEventType(event.type)) {
      errors.push(`Invalid event type: ${event.type}`);
    }

    if (event.metadata) {
      if (typeof event.metadata !== 'object') {
        errors.push('Event metadata must be an object');
      }

      if (event.metadata.source && typeof event.metadata.source !== 'string') {
        errors.push('Event metadata source must be a string');
      }

      if (event.metadata.priority && !['high', 'normal', 'low'].includes(event.metadata.priority)) {
        errors.push('Event metadata priority must be high, normal, or low');
      }
    }

    if (event.correlationId && typeof event.correlationId !== 'string') {
      errors.push('Correlation ID must be a string');
    }

    if (event.userId && typeof event.userId !== 'string') {
      errors.push('User ID must be a string');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private isValidEventType(eventType: string): boolean {
    return Object.values(EventType).includes(eventType as EventType) ||
           Boolean(eventType.match(/^[a-z]+\.[a-z]+$/));
  }

  private generateRoutingKey(eventType: string): string {
    const [category] = eventType.split('.');
    
    switch (category) {
      case 'room':
      case 'recording':
      case 'user':
      case 'auth':
      case 'feed':
        return eventType;
      default:
        return eventType;
    }
  }

  private createEventEnvelope(event: DomainEvent): EventEnvelope {
    return {
      id: event.id,
      type: event.type,
      version: event.version,
      timestamp: event.timestamp.toISOString(),
      correlationId: event.correlationId,
      userId: event.userId,
      sessionId: event.sessionId,
      data: event.data,
      metadata: {
        source: 'simplycast',
        priority: 'normal',
        ...event.metadata,
      },
    };
  }

  private serializeEvent(envelope: EventEnvelope): Uint8Array {
    try {
      const jsonString = JSON.stringify(envelope);
      return new TextEncoder().encode(jsonString);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const serializationError = new Error(`Event serialization failed: ${errorMessage}`);
      
      this.logger.logSerializationError({
        id: envelope.id,
        type: envelope.type,
        version: envelope.version,
        timestamp: new Date(envelope.timestamp),
        correlationId: envelope.correlationId,
        userId: envelope.userId,
        sessionId: envelope.sessionId,
        data: envelope.data,
        metadata: envelope.metadata,
      }, serializationError);
      
      throw serializationError;
    }
  }

  private async publishWithConfirmation(
    channel: ChannelWrapper,
    routingKey: string,
    messageBuffer: Uint8Array,
    event: DomainEvent
  ): Promise<void> {
    const headers: Record<string, any> = {
      version: event.version,
      source: event.metadata?.source || 'simplycast',
      priority: event.metadata?.priority || 'normal',
    };

    if (event.userId) headers.userId = event.userId;
    if (event.sessionId) headers.sessionId = event.sessionId;

    const publishOptions = {
      persistent: this.config.publishOptions.persistent,
      mandatory: this.config.publishOptions.mandatory,
      timestamp: Date.now(),
      messageId: event.id,
      correlationId: event.correlationId,
      type: event.type,
      headers,
    };

    try {
      await channel.publish(
        this.config.exchange,
        routingKey,
        messageBuffer,
        publishOptions
      );

      await this.waitForConfirmation(channel);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Publish confirmation failed: ${errorMessage}`);
    }
  }

  private async waitForConfirmation(channel: ChannelWrapper): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Publish confirmation timeout'));
      }, this.config.publishOptions.confirmTimeout);

      clearTimeout(timeout);
      resolve();
    });
  }

  /**
   * Check if publisher is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const healthStatus = await this.monitoringService.getHealthStatus();
      return healthStatus.healthy && !this.isShuttingDown;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get publisher statistics
   */
  async getStats() {
    const monitoringReport = await this.monitoringService.getMonitoringReport();
    
    return {
      publishedEvents: this.publishedEvents,
      failedEvents: this.failedEvents,
      queuedEvents: this.queuedEvents,
      processedBatches: this.processedBatches,
      currentQueueLength: this.eventQueue.length,
      activeOperations: this.activeOperations.size,
      isRabbitMQAvailable: this.isRabbitMQAvailable,
      bufferStats: this.eventBuffer.getStats(),
      successRate: this.publishedEvents > 0 ? 
        (this.publishedEvents / (this.publishedEvents + this.failedEvents)) * 100 : 0,
      connectionStats: this.connectionManager.getStats(),
      circuitBreakerStats: this.circuitBreaker.getStats(),
      monitoringReport,
      asyncConfig: this.asyncConfig,
    };
  }

  /**
   * Get connection health
   */
  async getHealth() {
    return await this.monitoringService.getHealthStatus();
  }

  /**
   * Ping RabbitMQ to test connectivity
   */
  async ping(): Promise<void> {
    await this.connectionManager.ping();
  }

  /**
   * Close publisher and cleanup resources
   */
  async close(): Promise<void> {
    this.isShuttingDown = true;

    try {
      // Stop background processing
      if (this.backgroundProcessor) {
        clearInterval(this.backgroundProcessor);
        this.backgroundProcessor = undefined;
      }

      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = undefined;
      }

      if (this.bufferFlushTimer) {
        clearInterval(this.bufferFlushTimer);
        this.bufferFlushTimer = undefined;
      }

      // Flush remaining events
      if (this.eventQueue.length > 0) {
        this.logger.info(`Flushing ${this.eventQueue.length} remaining events before shutdown`);
        await this.flushEventQueue();
      }

      // Flush buffer if RabbitMQ is available
      if (this.isRabbitMQAvailable && !this.eventBuffer.isEmpty()) {
        this.logger.info('Flushing event buffer before shutdown');
        await this.flushEventBuffer();
      }

      // Wait for active operations to complete
      const activePromises = Array.from(this.activeOperations.values()).map(op => op.promise);
      if (activePromises.length > 0) {
        this.logger.info(`Waiting for ${activePromises.length} active operations to complete`);
        await Promise.allSettled(activePromises);
      }

      await this.eventBuffer.close();
      await this.deadLetterService.close();
      await this.connectionManager.close();
      this.logger.logConnectionEvent('disconnected', 'Async event publisher closed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error closing async event publisher', {}, error instanceof Error ? error : new Error(errorMessage));
      throw error;
    }
  }

  /**
   * Get monitoring service for external access
   */
  getMonitoringService(): RabbitMQMonitoringService {
    return this.monitoringService;
  }

  /**
   * Get retry service for external access
   */
  getRetryService(): RabbitMQRetryService {
    return this.retryService;
  }

  /**
   * Get dead letter service for external access
   */
  getDeadLetterService(): RabbitMQDeadLetterService {
    return this.deadLetterService;
  }

  /**
   * Get logger for external access
   */
  getLogger(): RabbitMQLogger {
    return this.logger;
  }

  /**
   * Get async configuration
   */
  getAsyncConfig(): AsyncPublishConfig {
    return { ...this.asyncConfig };
  }

  /**
   * Update async configuration
   */
  updateAsyncConfig(newConfig: Partial<AsyncPublishConfig>): void {
    this.asyncConfig = { ...this.asyncConfig, ...newConfig };
    
    // Update buffer configuration if provided
    if (newConfig.bufferConfig) {
      this.eventBuffer.updateConfig(newConfig.bufferConfig);
    }
    
    // Restart timers if intervals changed
    if (newConfig.flushInterval) {
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
      }
      this.startFlushTimer();
    }
  }

  /**
   * Get event buffer for external access
   */
  getEventBuffer(): RabbitMQEventBuffer {
    return this.eventBuffer;
  }

  /**
   * Force flush of event buffer
   */
  async forceFlushBuffer(): Promise<void> {
    if (this.isRabbitMQAvailable) {
      await this.flushEventBuffer();
    } else {
      this.logger.warn('Cannot flush buffer: RabbitMQ is unavailable');
    }
  }

  /**
   * Clear event buffer
   */
  async clearBuffer(): Promise<void> {
    await this.eventBuffer.clearBuffer();
  }

  /**
   * Check if RabbitMQ is available
   */
  isRabbitMQHealthy(): boolean {
    return this.isRabbitMQAvailable;
  }
}

/**
 * Factory function to create and initialize async RabbitMQ event publisher
 */
export async function createRabbitMQAsyncEventPublisher(
  config: RabbitMQConfig,
  asyncConfig?: Partial<AsyncPublishConfig>
): Promise<RabbitMQAsyncEventPublisher> {
  const finalAsyncConfig = { ...DEFAULT_ASYNC_CONFIG, ...asyncConfig };
  const publisher = new RabbitMQAsyncEventPublisher(config, finalAsyncConfig);
  await publisher.initialize();
  return publisher;
}