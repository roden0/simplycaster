/**
 * Example usage of RabbitMQ Async Event Publisher
 * 
 * This file demonstrates how to use the async event publisher
 * with buffering capabilities for handling RabbitMQ outages.
 */

import { RabbitMQAsyncEventPublisher, createRabbitMQAsyncEventPublisher } from './rabbitmq-async-event-publisher.ts';
import { parseRabbitMQConfig } from './rabbitmq-config.ts';
import { DomainEvent, EventType } from '../../domain/types/events.ts';

/**
 * Example: Using async event publisher with buffering
 */
export async function exampleAsyncEventPublishing(): Promise<void> {
  // Create async event publisher with custom configuration
  const rabbitMQConfig = await parseRabbitMQConfig();
  
  const asyncConfig = {
    maxBufferSize: 500,
    flushInterval: 3000, // 3 seconds
    maxConcurrency: 5,
    enableBackgroundProcessing: true,
    batchSize: 25,
    publishTimeout: 15000, // 15 seconds
    bufferConfig: {
      maxBufferSize: 5000,
      maxEventAge: 1800000, // 30 minutes
      enablePersistence: true,
      persistentStoragePath: './data/example-event-buffer.json',
      cleanupInterval: 180000, // 3 minutes
      flushBatchSize: 50,
    },
  };

  const publisher = await createRabbitMQAsyncEventPublisher(rabbitMQConfig, asyncConfig);

  try {
    // Example 1: Publishing high priority events (published immediately)
    const highPriorityEvent: DomainEvent = {
      id: crypto.randomUUID(),
      type: EventType.RECORDING_FAILED,
      version: '1.0',
      timestamp: new Date(),
      correlationId: 'example-correlation-1',
      userId: 'user-123',
      data: {
        recordingId: 'recording-456',
        roomId: 'room-789',
        error: 'Storage failure',
      },
      metadata: {
        source: 'simplycast',
        priority: 'high',
      },
    };

    console.log('Publishing high priority event...');
    await publisher.publish(highPriorityEvent);
    console.log('High priority event published immediately');

    // Example 2: Publishing normal priority events (queued for batch processing)
    const normalEvents: DomainEvent[] = [];
    for (let i = 0; i < 10; i++) {
      normalEvents.push({
        id: crypto.randomUUID(),
        type: EventType.USER_JOINED,
        version: '1.0',
        timestamp: new Date(),
        correlationId: `batch-correlation-${i}`,
        userId: `user-${i}`,
        data: {
          roomId: 'room-789',
          displayName: `User ${i}`,
          participantType: 'guest',
        },
        metadata: {
          source: 'simplycast',
          priority: 'normal',
        },
      });
    }

    console.log('Publishing batch of normal priority events...');
    await publisher.publishBatch(normalEvents);
    console.log('Batch events queued for processing');

    // Example 3: Monitoring publisher statistics
    const stats = await publisher.getStats();
    console.log('Publisher Statistics:', {
      publishedEvents: stats.publishedEvents,
      failedEvents: stats.failedEvents,
      queuedEvents: stats.queuedEvents,
      currentQueueLength: stats.currentQueueLength,
      bufferStats: stats.bufferStats,
      isRabbitMQAvailable: stats.isRabbitMQAvailable,
    });

    // Example 4: Simulating RabbitMQ outage (events will be buffered)
    console.log('Simulating RabbitMQ outage...');
    
    // Publish events during outage - they will be buffered
    const outageEvents: DomainEvent[] = [];
    for (let i = 0; i < 5; i++) {
      outageEvents.push({
        id: crypto.randomUUID(),
        type: EventType.ROOM_CREATED,
        version: '1.0',
        timestamp: new Date(),
        correlationId: `outage-correlation-${i}`,
        userId: 'host-123',
        data: {
          roomId: `room-outage-${i}`,
          roomName: `Outage Room ${i}`,
          hostId: 'host-123',
          maxParticipants: 10,
        },
        metadata: {
          source: 'simplycast',
          priority: 'normal',
        },
      });
    }

    // These events will be buffered if RabbitMQ is unavailable
    for (const event of outageEvents) {
      await publisher.publish(event);
    }

    console.log('Events published during outage (buffered if RabbitMQ unavailable)');

    // Example 5: Force flush buffer when connection recovers
    if (!publisher.isRabbitMQHealthy()) {
      console.log('RabbitMQ is unavailable, events are buffered');
      console.log('Buffer stats:', publisher.getEventBuffer().getStats());
      
      // When connection recovers, you can force flush
      // await publisher.forceFlushBuffer();
    }

    // Example 6: Health monitoring
    const health = await publisher.getHealth();
    console.log('Publisher Health:', health);

    // Wait a bit to see background processing
    console.log('Waiting for background processing...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Final statistics
    const finalStats = await publisher.getStats();
    console.log('Final Statistics:', {
      publishedEvents: finalStats.publishedEvents,
      failedEvents: finalStats.failedEvents,
      bufferStats: finalStats.bufferStats,
    });

  } catch (error) {
    console.error('Error in async event publishing example:', error);
  } finally {
    // Clean shutdown
    console.log('Shutting down async event publisher...');
    await publisher.close();
    console.log('Async event publisher shut down successfully');
  }
}

/**
 * Example: Handling buffer events during outages
 */
export async function exampleBufferManagement(): Promise<void> {
  const rabbitMQConfig = await parseRabbitMQConfig();
  const publisher = await createRabbitMQAsyncEventPublisher(rabbitMQConfig);

  try {
    const buffer = publisher.getEventBuffer();

    // Add events directly to buffer (useful for testing)
    const testEvent: DomainEvent = {
      id: crypto.randomUUID(),
      type: EventType.USER_LEFT,
      version: '1.0',
      timestamp: new Date(),
      data: {
        roomId: 'room-123',
        userId: 'user-456',
        displayName: 'Test User',
        participantType: 'guest',
      },
      metadata: {
        source: 'simplycast',
        priority: 'low',
      },
    };

    await buffer.addEvent(testEvent, 'users.left', 'low');
    console.log('Event added to buffer');

    // Check buffer statistics
    const bufferStats = buffer.getStats();
    console.log('Buffer Statistics:', bufferStats);

    // Get buffered events (read-only)
    const bufferedEvents = buffer.getBufferedEvents();
    console.log(`Buffer contains ${bufferedEvents.length} events`);

    // Clear buffer if needed
    if (bufferStats.bufferedEvents > 100) {
      console.log('Buffer is getting full, clearing...');
      await buffer.clearBuffer();
    }

  } catch (error) {
    console.error('Error in buffer management example:', error);
  } finally {
    await publisher.close();
  }
}

/**
 * Example: Configuration updates at runtime
 */
export async function exampleRuntimeConfiguration(): Promise<void> {
  const rabbitMQConfig = await parseRabbitMQConfig();
  const publisher = await createRabbitMQAsyncEventPublisher(rabbitMQConfig);

  try {
    // Get current configuration
    const currentConfig = publisher.getAsyncConfig();
    console.log('Current async configuration:', currentConfig);

    // Update configuration at runtime
    publisher.updateAsyncConfig({
      maxConcurrency: 15,
      flushInterval: 2000, // 2 seconds
      bufferConfig: {
        maxBufferSize: 15000,
        cleanupInterval: 120000, // 2 minutes
      },
    });

    console.log('Configuration updated');

    // Publish some events with new configuration
    const events: DomainEvent[] = [];
    for (let i = 0; i < 20; i++) {
      events.push({
        id: crypto.randomUUID(),
        type: EventType.EPISODE_PUBLISHED,
        version: '1.0',
        timestamp: new Date(),
        data: {
          episodeId: `episode-${i}`,
          title: `Episode ${i}`,
          slug: `episode-${i}`,
          audioFilePath: `/audio/episode-${i}.mp3`,
          durationSeconds: 3600,
          audioSizeBytes: 50000000,
        },
        metadata: {
          source: 'simplycast',
          priority: 'normal',
        },
      });
    }

    await publisher.publishBatch(events);
    console.log('Batch published with updated configuration');

  } catch (error) {
    console.error('Error in runtime configuration example:', error);
  } finally {
    await publisher.close();
  }
}

// Run examples if this file is executed directly
if (import.meta.main) {
  console.log('Running RabbitMQ Async Event Publisher Examples...\n');
  
  try {
    console.log('=== Example 1: Basic Async Event Publishing ===');
    await exampleAsyncEventPublishing();
    
    console.log('\n=== Example 2: Buffer Management ===');
    await exampleBufferManagement();
    
    console.log('\n=== Example 3: Runtime Configuration ===');
    await exampleRuntimeConfiguration();
    
    console.log('\nAll examples completed successfully!');
  } catch (error) {
    console.error('Error running examples:', error);
    Deno.exit(1);
  }
}