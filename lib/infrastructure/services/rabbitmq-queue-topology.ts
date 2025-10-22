/**
 * RabbitMQ Queue Topology Manager
 * 
 * Manages queue topology setup, validation, and configuration for different event types.
 * Implements topic exchange with routing patterns and durable queues with TTL and max length.
 */

import type { ChannelWrapper } from 'amqp-connection-manager';
import {
  RabbitMQConfig,
  QueueConfig,
  ExchangeConfig,
  QueueName,
  ExchangeName,
  DEFAULT_ROUTING_PATTERNS,
} from '../../domain/types/rabbitmq-config.ts';
import { RabbitMQConnectionManager } from './rabbitmq-connection-manager.ts';
import { RabbitMQLogger, createRabbitMQLogger } from './rabbitmq-logger.ts';

/**
 * Queue topology validation result
 */
export interface TopologyValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Queue statistics
 */
export interface QueueStats {
  name: string;
  messageCount: number;
  consumerCount: number;
  messageRate: number;
  deliveryRate: number;
  isHealthy: boolean;
}

/**
 * Exchange statistics
 */
export interface ExchangeStats {
  name: string;
  type: string;
  messageInRate: number;
  messageOutRate: number;
  isHealthy: boolean;
}

/**
 * Topology status
 */
export interface TopologyStatus {
  exchanges: ExchangeStats[];
  queues: QueueStats[];
  bindings: BindingInfo[];
  isHealthy: boolean;
  lastValidated: Date;
}

/**
 * Binding information
 */
export interface BindingInfo {
  exchange: string;
  queue: string;
  routingKey: string;
  isActive: boolean;
}

/**
 * RabbitMQ Queue Topology Manager
 */
export class RabbitMQQueueTopology {
  private connectionManager: RabbitMQConnectionManager;
  private logger: RabbitMQLogger;
  private isInitialized = false;
  private lastValidation?: Date;

  constructor(
    private config: RabbitMQConfig,
    connectionManager?: RabbitMQConnectionManager
  ) {
    this.connectionManager = connectionManager || new RabbitMQConnectionManager(config);
    this.logger = createRabbitMQLogger();
  }

  /**
   * Initialize topology by setting up exchanges, queues, and bindings
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Queue topology already initialized');
      return;
    }

    try {
      this.logger.info('Initializing RabbitMQ queue topology');

      // Ensure connection is established
      await this.connectionManager.connect();

      // Set up exchanges
      await this.setupExchanges();

      // Set up queues
      await this.setupQueues();

      // Set up bindings
      await this.setupBindings();

      // Validate topology
      const validation = await this.validateTopology();
      if (!validation.isValid) {
        throw new Error(`Topology validation failed: ${validation.errors.join(', ')}`);
      }

      this.isInitialized = true;
      this.logger.info('Queue topology initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to initialize queue topology', { error: errorMessage });
      throw new Error(`Queue topology initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Set up exchanges
   */
  private async setupExchanges(): Promise<void> {
    const channel = this.connectionManager.getManagementChannel();
    
    // Main topic exchange
    await this.declareExchange(channel, {
      name: this.config.exchange,
      type: 'topic',
      durable: true,
      autoDelete: false,
    });

    // Dead letter exchange
    await this.declareExchange(channel, {
      name: ExchangeName.DEAD_LETTER,
      type: 'topic',
      durable: true,
      autoDelete: false,
    });

    this.logger.info('Exchanges set up successfully', {
      mainExchange: this.config.exchange,
      deadLetterExchange: ExchangeName.DEAD_LETTER,
    });
  }

  /**
   * Set up queues with their configurations
   */
  private async setupQueues(): Promise<void> {
    const channel = this.connectionManager.getManagementChannel();

    for (const queueConfig of this.config.queues) {
      await this.declareQueue(channel, queueConfig);
      
      // Set up dead letter queue if configured
      if (queueConfig.deadLetterQueue) {
        await this.declareDeadLetterQueue(channel, queueConfig);
      }
    }

    this.logger.info('Queues set up successfully', {
      queueCount: this.config.queues.length,
      queues: this.config.queues.map(q => q.name),
    });
  }

  /**
   * Set up queue bindings to exchanges
   */
  private async setupBindings(): Promise<void> {
    const channel = this.connectionManager.getManagementChannel();

    for (const queueConfig of this.config.queues) {
      // Bind main queue to main exchange
      await this.bindQueue(
        channel,
        queueConfig.name,
        this.config.exchange,
        queueConfig.routingKey
      );

      // Bind dead letter queue if configured
      if (queueConfig.deadLetterQueue) {
        await this.bindQueue(
          channel,
          queueConfig.deadLetterQueue.queueName,
          queueConfig.deadLetterQueue.exchange,
          queueConfig.deadLetterQueue.routingKey
        );
      }
    }

    this.logger.info('Queue bindings set up successfully');
  }

  /**
   * Declare an exchange
   */
  private async declareExchange(
    channel: ChannelWrapper,
    exchangeConfig: ExchangeConfig
  ): Promise<void> {
    try {
      await channel.assertExchange(
        exchangeConfig.name,
        exchangeConfig.type,
        {
          durable: exchangeConfig.durable,
          autoDelete: exchangeConfig.autoDelete,
          arguments: exchangeConfig.arguments || {},
        }
      );

      this.logger.debug('Exchange declared', {
        name: exchangeConfig.name,
        type: exchangeConfig.type,
        durable: exchangeConfig.durable,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to declare exchange', {
        exchange: exchangeConfig.name,
        error: errorMessage,
      });
      throw new Error(`Failed to declare exchange ${exchangeConfig.name}: ${errorMessage}`);
    }
  }

  /**
   * Declare a queue
   */
  private async declareQueue(
    channel: ChannelWrapper,
    queueConfig: QueueConfig
  ): Promise<void> {
    try {
      await channel.assertQueue(queueConfig.name, {
        durable: queueConfig.options.durable,
        exclusive: queueConfig.options.exclusive,
        autoDelete: queueConfig.options.autoDelete,
        arguments: queueConfig.options.arguments,
      });

      this.logger.debug('Queue declared', {
        name: queueConfig.name,
        durable: queueConfig.options.durable,
        arguments: queueConfig.options.arguments,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to declare queue', {
        queue: queueConfig.name,
        error: errorMessage,
      });
      throw new Error(`Failed to declare queue ${queueConfig.name}: ${errorMessage}`);
    }
  }

  /**
   * Declare a dead letter queue
   */
  private async declareDeadLetterQueue(
    channel: ChannelWrapper,
    queueConfig: QueueConfig
  ): Promise<void> {
    if (!queueConfig.deadLetterQueue) {
      return;
    }

    const dlqConfig = queueConfig.deadLetterQueue;
    
    try {
      await channel.assertQueue(dlqConfig.queueName, {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': dlqConfig.messageTtl,
        },
      });

      this.logger.debug('Dead letter queue declared', {
        name: dlqConfig.queueName,
        exchange: dlqConfig.exchange,
        routingKey: dlqConfig.routingKey,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to declare dead letter queue', {
        queue: dlqConfig.queueName,
        error: errorMessage,
      });
      throw new Error(`Failed to declare dead letter queue ${dlqConfig.queueName}: ${errorMessage}`);
    }
  }

  /**
   * Bind a queue to an exchange
   */
  private async bindQueue(
    channel: ChannelWrapper,
    queueName: string,
    exchangeName: string,
    routingKey: string
  ): Promise<void> {
    try {
      await channel.bindQueue(queueName, exchangeName, routingKey);

      this.logger.debug('Queue bound to exchange', {
        queue: queueName,
        exchange: exchangeName,
        routingKey,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to bind queue', {
        queue: queueName,
        exchange: exchangeName,
        routingKey,
        error: errorMessage,
      });
      throw new Error(`Failed to bind queue ${queueName} to exchange ${exchangeName}: ${errorMessage}`);
    }
  }

  /**
   * Validate topology configuration and setup
   */
  async validateTopology(): Promise<TopologyValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate exchanges exist
      await this.validateExchanges(errors, warnings);

      // Validate queues exist and are properly configured
      await this.validateQueues(errors, warnings);

      // Validate bindings
      await this.validateBindings(errors, warnings);

      // Validate routing patterns
      this.validateRoutingPatterns(errors, warnings);

      this.lastValidation = new Date();

      const result = {
        isValid: errors.length === 0,
        errors,
        warnings,
      };

      this.logger.info('Topology validation completed', {
        isValid: result.isValid,
        errorCount: errors.length,
        warningCount: warnings.length,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Validation failed: ${errorMessage}`);
      
      return {
        isValid: false,
        errors,
        warnings,
      };
    }
  }

  /**
   * Validate exchanges exist
   */
  private async validateExchanges(errors: string[], warnings: string[]): Promise<void> {
    const channel = this.connectionManager.getManagementChannel();

    try {
      // Check main exchange
      await channel.checkExchange(this.config.exchange);
      
      // Check dead letter exchange
      await channel.checkExchange(ExchangeName.DEAD_LETTER);
    } catch (error) {
      errors.push(`Exchange validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate queues exist and are properly configured
   */
  private async validateQueues(errors: string[], warnings: string[]): Promise<void> {
    const channel = this.connectionManager.getManagementChannel();

    for (const queueConfig of this.config.queues) {
      try {
        // Check main queue
        await channel.checkQueue(queueConfig.name);

        // Check dead letter queue if configured
        if (queueConfig.deadLetterQueue) {
          await channel.checkQueue(queueConfig.deadLetterQueue.queueName);
        }
      } catch (error) {
        errors.push(`Queue validation failed for ${queueConfig.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Validate bindings exist
   */
  private async validateBindings(errors: string[], warnings: string[]): Promise<void> {
    // Note: RabbitMQ doesn't provide a direct way to check bindings
    // This is a simplified validation that assumes bindings exist if queues and exchanges exist
    // In a production environment, you might want to use RabbitMQ Management API
    
    for (const queueConfig of this.config.queues) {
      // Validate routing key pattern
      if (!queueConfig.routingKey || queueConfig.routingKey.trim() === '') {
        errors.push(`Empty routing key for queue ${queueConfig.name}`);
      }

      // Check if routing key matches expected patterns
      const isValidPattern = Object.values(DEFAULT_ROUTING_PATTERNS).some(
        pattern => queueConfig.routingKey === pattern || queueConfig.routingKey.startsWith(pattern.replace('*', ''))
      );

      if (!isValidPattern) {
        warnings.push(`Routing key ${queueConfig.routingKey} for queue ${queueConfig.name} doesn't match standard patterns`);
      }
    }
  }

  /**
   * Validate routing patterns
   */
  private validateRoutingPatterns(errors: string[], warnings: string[]): void {
    const routingKeys = this.config.queues.map(q => q.routingKey);
    const uniqueKeys = new Set(routingKeys);

    if (routingKeys.length !== uniqueKeys.size) {
      warnings.push('Duplicate routing keys detected - this may cause message routing conflicts');
    }

    // Validate routing key format
    for (const queueConfig of this.config.queues) {
      const routingKey = queueConfig.routingKey;
      
      // Check for valid routing key format (alphanumeric, dots, asterisks, hashes)
      if (!/^[a-zA-Z0-9.*#]+$/.test(routingKey)) {
        errors.push(`Invalid routing key format for queue ${queueConfig.name}: ${routingKey}`);
      }

      // Check for proper wildcard usage
      if (routingKey.includes('*') && routingKey.includes('#')) {
        warnings.push(`Mixed wildcards in routing key for queue ${queueConfig.name}: ${routingKey}`);
      }
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<QueueStats> {
    try {
      const channel = this.connectionManager.getManagementChannel();
      
      // Note: This is a simplified implementation
      // In production, you would use RabbitMQ Management API for detailed stats
      const queueInfo = await channel.checkQueue(queueName);
      
      return {
        name: queueName,
        messageCount: queueInfo.messageCount || 0,
        consumerCount: queueInfo.consumerCount || 0,
        messageRate: 0, // Would need Management API for this
        deliveryRate: 0, // Would need Management API for this
        isHealthy: true,
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats', {
        queue: queueName,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return {
        name: queueName,
        messageCount: 0,
        consumerCount: 0,
        messageRate: 0,
        deliveryRate: 0,
        isHealthy: false,
      };
    }
  }

  /**
   * Get topology status
   */
  async getTopologyStatus(): Promise<TopologyStatus> {
    const exchanges: ExchangeStats[] = [
      {
        name: this.config.exchange,
        type: 'topic',
        messageInRate: 0,
        messageOutRate: 0,
        isHealthy: true,
      },
      {
        name: ExchangeName.DEAD_LETTER,
        type: 'topic',
        messageInRate: 0,
        messageOutRate: 0,
        isHealthy: true,
      },
    ];

    const queues: QueueStats[] = [];
    for (const queueConfig of this.config.queues) {
      const stats = await this.getQueueStats(queueConfig.name);
      queues.push(stats);
    }

    const bindings: BindingInfo[] = this.config.queues.map(queueConfig => ({
      exchange: this.config.exchange,
      queue: queueConfig.name,
      routingKey: queueConfig.routingKey,
      isActive: true,
    }));

    const isHealthy = queues.every(q => q.isHealthy) && exchanges.every(e => e.isHealthy);

    return {
      exchanges,
      queues,
      bindings,
      isHealthy,
      lastValidated: this.lastValidation || new Date(),
    };
  }

  /**
   * Get routing key for event type
   */
  getRoutingKeyForEventType(eventType: string): string {
    const [category] = eventType.split('.');
    
    switch (category) {
      case 'room':
        return eventType;
      case 'recording':
        return eventType;
      case 'user':
        return eventType;
      case 'auth':
        return eventType;
      case 'feed':
        return eventType;
      default:
        return eventType;
    }
  }

  /**
   * Get queue name for event type
   */
  getQueueNameForEventType(eventType: string): string {
    const [category] = eventType.split('.');
    
    switch (category) {
      case 'room':
        return QueueName.ROOMS;
      case 'recording':
        return QueueName.RECORDINGS;
      case 'user':
        return QueueName.USERS;
      case 'auth':
        return QueueName.USERS; // Auth events go to users queue
      case 'feed':
        return QueueName.FEED;
      default:
        return QueueName.DEAD_LETTER; // Unknown events go to dead letter
    }
  }

  /**
   * Check if topology is initialized
   */
  isTopologyInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Reinitialize topology (useful for configuration changes)
   */
  async reinitialize(): Promise<void> {
    this.isInitialized = false;
    await this.initialize();
  }

  /**
   * Close topology manager
   */
  async close(): Promise<void> {
    this.isInitialized = false;
    this.logger.info('Queue topology manager closed');
  }
}

/**
 * Factory function to create and initialize queue topology manager
 */
export async function createRabbitMQQueueTopology(
  config: RabbitMQConfig,
  connectionManager?: RabbitMQConnectionManager
): Promise<RabbitMQQueueTopology> {
  const topology = new RabbitMQQueueTopology(config, connectionManager);
  await topology.initialize();
  return topology;
}