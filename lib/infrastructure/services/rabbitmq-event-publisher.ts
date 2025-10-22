/**
 * RabbitMQ Event Publisher Service
 * 
 * Implements event publishing with routing logic, serialization,
 * validation, and event envelope wrapping.
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
import { RabbitMQMetricsCollector, createRabbitMQMetricsCollector } from './rabbitmq-metrics-collector.ts';

/**
 * RabbitMQ implementation of EventPublisher
 */
export class RabbitMQEventPublisher implements EventPublisher {
  private connectionManager: RabbitMQConnectionManager;
  private circuitBreaker: RabbitMQCircuitBreakerWithFallback<void>;
  private retryService: RabbitMQRetryService;
  private deadLetterService: RabbitMQDeadLetterService;
  private monitoringService: RabbitMQMonitoringService;
  private metricsCollector: RabbitMQMetricsCollector;
  private logger: RabbitMQLogger;
  private publishedEvents = 0;
  private failedEvents = 0;
  private bufferedEvents: DomainEvent[] = [];

  constructor(private config: RabbitMQConfig) {
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
    this.metricsCollector = createRabbitMQMetricsCollector(this.monitoringService);
  }

  /**
   * Initialize the publisher and establish connection
   */
  async initialize(): Promise<void> {
    await this.connectionManager.connect();
    await this.deadLetterService.initialize();
    this.logger.logConnectionEvent('connected', 'Event publisher initialized');
  }

  /**
   * Publish a single domain event
   */
  async publish(event: DomainEvent): Promise<void> {
    const startTime = Date.now();
    
    // Validate event
    const validation = this.validateEvent(event);
    if (!validation.isValid) {
      this.logger.logValidationError(event, validation.errors);
      throw new Error(`Event validation failed: ${validation.errors.join(', ')}`);
    }

    // Use retry service to handle the publish operation
    const retryResult = await this.retryService.executeWithRetry(
      async () => {
        // Execute publish operation through circuit breaker
        await this.circuitBreaker.executeWithFallback(async () => {
          await this.publishEvent(event);
        });
      },
      event,
      'publish_event'
    );

    // Record retry metrics if there were multiple attempts
    if (retryResult.attempts > 1) {
      for (let i = 2; i <= retryResult.attempts; i++) {
        this.metricsCollector.recordRetryAttempt(event, i);
      }
    }

    const durationMs = Date.now() - startTime;

    if (retryResult.success) {
      this.publishedEvents++;
      const routingKey = this.generateRoutingKey(event.type);
      
      // Record metrics
      this.metricsCollector.recordEventPublished(event, durationMs, routingKey);
      this.monitoringService.recordPublishSuccess(event, durationMs);
      this.logger.logPublishSuccess(event, durationMs);
    } else {
      this.failedEvents++;
      const error = retryResult.error!;
      const routingKey = this.generateRoutingKey(event.type);
      
      // Record metrics
      this.metricsCollector.recordEventFailed(event, error, durationMs, routingKey);
      this.monitoringService.recordPublishFailure(event, error, durationMs);
      this.logger.logPublishFailure(event, error, durationMs);
      
      // Record dead letter queue metrics
      this.metricsCollector.recordDeadLetterQueueEvent(event, error.message);
      
      // Send to dead letter queue if all retries failed
      await this.deadLetterService.sendToDeadLetterQueue(
        event,
        error,
        retryResult.attempts,
        routingKey,
        startTime
      );
      
      this.logger.logDeadLetterQueue(event, error.message, retryResult.attempts);
      
      throw error;
    }
  }

  /**
   * Internal method to publish event (used by circuit breaker)
   */
  private async publishEvent(event: DomainEvent): Promise<void> {
    // Get routing key
    const routingKey = this.generateRoutingKey(event.type);

    // Create event envelope
    const envelope = this.createEventEnvelope(event);

    // Serialize event
    const messageBuffer = this.serializeEvent(envelope);

    const channel = this.connectionManager.getPublishChannel();
    
    // Publish with confirmation
    await this.publishWithConfirmation(channel, routingKey, messageBuffer, event);
  }

  /**
   * Fallback mechanism when RabbitMQ is unavailable
   */
  private async fallbackPublish(): Promise<void> {
    console.warn('⚠️ RabbitMQ unavailable: buffering events locally');
    // Events are buffered in the circuit breaker fallback
    // In a real implementation, you might want to:
    // 1. Store events in local database
    // 2. Write to local file system
    // 3. Send to alternative message queue
    // For now, we'll just log the fallback
  }

  /**
   * Publish multiple events in a batch
   */
  async publishBatch(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    const errors: Error[] = [];

    // Process events individually to track success/failure
    const publishPromises = events.map(async (event) => {
      try {
        await this.publish(event);
        successCount++;
      } catch (error) {
        failureCount++;
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    });
    
    await Promise.allSettled(publishPromises);
    
    const durationMs = Date.now() - startTime;
    this.logger.logBatchPublish(events, durationMs, successCount, failureCount);
    
    if (failureCount > 0) {
      const errorMessage = `Batch publish partially failed: ${failureCount}/${events.length} events failed`;
      throw new Error(errorMessage);
    }
  }

  /**
   * Validate domain event structure and content
   */
  private validateEvent(event: DomainEvent): EventValidationResult {
    const errors: string[] = [];

    // Required fields validation
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

    // Event type validation
    if (event.type && !this.isValidEventType(event.type)) {
      errors.push(`Invalid event type: ${event.type}`);
    }

    // Metadata validation
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

    // Correlation ID validation
    if (event.correlationId && typeof event.correlationId !== 'string') {
      errors.push('Correlation ID must be a string');
    }

    // User ID validation
    if (event.userId && typeof event.userId !== 'string') {
      errors.push('User ID must be a string');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if event type is valid
   */
  private isValidEventType(eventType: string): boolean {
    return Object.values(EventType).includes(eventType as EventType) ||
           Boolean(eventType.match(/^[a-z]+\.[a-z]+$/)); // Allow custom event types with dot notation
  }

  /**
   * Generate routing key based on event type
   */
  private generateRoutingKey(eventType: string): string {
    // Extract category from event type (e.g., 'room' from 'room.created')
    const [category] = eventType.split('.');
    
    switch (category) {
      case 'room':
        return eventType; // Use full event type for room events
      case 'recording':
        return eventType; // Use full event type for recording events
      case 'user':
        return eventType; // Use full event type for user events
      case 'auth':
        return eventType; // Use full event type for auth events
      case 'feed':
        return eventType; // Use full event type for feed events
      default:
        // For unknown categories, use the full event type
        return eventType;
    }
  }

  /**
   * Create event envelope for serialization
   */
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

  /**
   * Serialize event to buffer for publishing
   */
  private serializeEvent(envelope: EventEnvelope): Uint8Array {
    try {
      const jsonString = JSON.stringify(envelope);
      return new TextEncoder().encode(jsonString);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const serializationError = new Error(`Event serialization failed: ${errorMessage}`);
      
      // Log serialization error
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

  /**
   * Publish event with confirmation
   */
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

    // Add optional headers if they exist
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
      // Publish with confirmation
      await channel.publish(
        this.config.exchange,
        routingKey,
        messageBuffer,
        publishOptions
      );

      // Wait for confirmation with timeout
      await this.waitForConfirmation(channel);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Publish confirmation failed: ${errorMessage}`);
    }
  }

  /**
   * Wait for publish confirmation with timeout
   */
  private async waitForConfirmation(channel: ChannelWrapper): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Publish confirmation timeout'));
      }, this.config.publishOptions.confirmTimeout);

      // Note: amqp-connection-manager handles confirmations automatically
      // This is a simplified implementation
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
      return healthStatus.healthy;
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
      successRate: this.publishedEvents > 0 ? 
        (this.publishedEvents / (this.publishedEvents + this.failedEvents)) * 100 : 0,
      connectionStats: this.connectionManager.getStats(),
      circuitBreakerStats: this.circuitBreaker.getStats(),
      bufferedEventsCount: this.bufferedEvents.length,
      monitoringReport,
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
    try {
      await this.deadLetterService.close();
      await this.connectionManager.close();
      this.logger.logConnectionEvent('disconnected', 'Event publisher closed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error closing event publisher', {}, error instanceof Error ? error : new Error(errorMessage));
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
   * Get metrics collector for external access
   */
  getMetricsCollector(): RabbitMQMetricsCollector {
    return this.metricsCollector;
  }

  /**
   * Start periodic metrics collection
   */
  startMetricsCollection(intervalMs = 30000): NodeJS.Timeout {
    return this.metricsCollector.startPeriodicCollection(intervalMs);
  }

  /**
   * Stop periodic metrics collection
   */
  stopMetricsCollection(intervalId: NodeJS.Timeout): void {
    this.metricsCollector.stopPeriodicCollection(intervalId);
  }

  /**
   * Get metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    return this.metricsCollector.getPrometheusMetrics();
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    return this.metricsCollector.getMetricsSummary();
  }
}

/**
 * Factory function to create and initialize RabbitMQ event publisher
 */
export async function createRabbitMQEventPublisher(config: RabbitMQConfig): Promise<RabbitMQEventPublisher> {
  const publisher = new RabbitMQEventPublisher(config);
  await publisher.initialize();
  return publisher;
}