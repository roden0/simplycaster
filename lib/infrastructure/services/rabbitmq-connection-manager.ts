/**
 * RabbitMQ Connection Manager
 * 
 * Manages RabbitMQ connections with pooling, health monitoring,
 * and automatic reconnection with exponential backoff.
 */

import { connect } from 'amqp-connection-manager';
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import {
  RabbitMQConfig,
  ConnectionState,
  ConnectionHealth,
  ExchangeConfig,
  QueueConfig,
} from '../../domain/types/rabbitmq-config.ts';

/**
 * Connection manager for RabbitMQ with pooling and health monitoring
 */
export class RabbitMQConnectionManager {
  private connection: AmqpConnectionManager | null = null;
  private publishChannel: ChannelWrapper | null = null;
  private consumeChannel: ChannelWrapper | null = null;
  private managementChannel: ChannelWrapper | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private lastSuccessfulOperation: Date | null = null;
  private failedOperations = 0;
  private reconnectAttempts = 0;
  private isClosing = false;

  constructor(private config: RabbitMQConfig) {}

  /**
   * Initialize connection and setup channels
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.CONNECTING) {
      return;
    }

    this.state = ConnectionState.CONNECTING;
    
    try {
      // Create connection with retry logic
      this.connection = connect([this.config.url], {
        connectionOptions: {
          timeout: this.config.connectionOptions.connectionTimeout,
        },
        reconnectTimeInSeconds: this.config.connectionOptions.reconnectDelay / 1000,
        findServers: () => [this.config.url], // Single server for now
      });

      // Setup connection event handlers
      this.setupConnectionEventHandlers();

      // Create channels
      await this.createChannels();

      // Setup exchanges and queues
      await this.setupTopology();

      this.state = ConnectionState.CONNECTED;
      this.lastSuccessfulOperation = new Date();
      this.failedOperations = 0;
      this.reconnectAttempts = 0;

      console.log('✅ RabbitMQ connection established successfully');
    } catch (error) {
      this.state = ConnectionState.DISCONNECTED;
      this.failedOperations++;
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to connect to RabbitMQ:', errorMessage);
      
      // Implement exponential backoff for reconnection
      await this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Create publish and consume channels
   */
  private async createChannels(): Promise<void> {
    if (!this.connection) {
      throw new Error('Connection not established');
    }

    // Create publish channel with confirm mode
    this.publishChannel = this.connection.createChannel({
      name: 'publish-channel',
      setup: async (channel: any) => {
        // Enable publisher confirms
        await channel.confirmSelect();
        return channel;
      },
    });

    // Create consume channel
    this.consumeChannel = this.connection.createChannel({
      name: 'consume-channel',
      setup: async (channel: any) => {
        // Set prefetch for fair dispatch
        await channel.prefetch(1);
        return channel;
      },
    });

    // Create management channel for topology operations
    this.managementChannel = this.connection.createChannel({
      name: 'management-channel',
      setup: async (channel: any) => {
        return channel;
      },
    });

    // Wait for channels to be ready
    await Promise.all([
      this.publishChannel?.waitForConnect(),
      this.consumeChannel?.waitForConnect(),
      this.managementChannel?.waitForConnect(),
    ]);
  }

  /**
   * Setup connection event handlers
   */
  private setupConnectionEventHandlers(): void {
    if (!this.connection) return;

    this.connection.on('connect', () => {
      console.log('🔗 RabbitMQ connection established');
      this.state = ConnectionState.CONNECTED;
      this.lastSuccessfulOperation = new Date();
      this.reconnectAttempts = 0;
    });

    this.connection.on('disconnect', (params: any) => {
      console.warn('⚠️ RabbitMQ connection lost:', params.err?.message);
      if (!this.isClosing) {
        this.state = ConnectionState.RECONNECTING;
        this.failedOperations++;
      }
    });

    this.connection.on('connectFailed', (params: any) => {
      console.error('❌ RabbitMQ connection failed:', params.err?.message);
      this.state = ConnectionState.DISCONNECTED;
      this.failedOperations++;
      this.reconnectAttempts++;
    });

    // Setup channel event handlers
    this.setupChannelEventHandlers();
  }

  /**
   * Setup channel event handlers
   */
  private setupChannelEventHandlers(): void {
    if (this.publishChannel) {
      this.publishChannel.on('error', (error) => {
        console.error('❌ Publish channel error:', error.message);
        this.failedOperations++;
      });

      this.publishChannel.on('close', () => {
        console.warn('⚠️ Publish channel closed');
      });
    }

    if (this.consumeChannel) {
      this.consumeChannel.on('error', (error) => {
        console.error('❌ Consume channel error:', error.message);
        this.failedOperations++;
      });

      this.consumeChannel.on('close', () => {
        console.warn('⚠️ Consume channel closed');
      });
    }

    if (this.managementChannel) {
      this.managementChannel.on('error', (error) => {
        console.error('❌ Management channel error:', error.message);
        this.failedOperations++;
      });

      this.managementChannel.on('close', () => {
        console.warn('⚠️ Management channel closed');
      });
    }
  }

  /**
   * Setup RabbitMQ topology (exchanges and queues)
   */
  private async setupTopology(): Promise<void> {
    if (!this.publishChannel) {
      throw new Error('Publish channel not available');
    }

    try {
      // Setup exchanges
      const exchanges = await this.getExchangeConfigs();
      for (const exchange of exchanges) {
        await this.publishChannel.assertExchange(
          exchange.name,
          exchange.type,
          {
            durable: exchange.durable,
            autoDelete: exchange.autoDelete,
            arguments: exchange.arguments,
          }
        );
      }

      // Setup queues and bindings
      for (const queueConfig of this.config.queues) {
        await this.setupQueue(queueConfig);
      }

      console.log('✅ RabbitMQ topology setup completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to setup RabbitMQ topology:', errorMessage);
      throw error;
    }
  }

  /**
   * Setup individual queue with bindings
   */
  private async setupQueue(queueConfig: QueueConfig): Promise<void> {
    if (!this.publishChannel) {
      throw new Error('Publish channel not available');
    }

    // Assert main queue
    await this.publishChannel.assertQueue(queueConfig.name, queueConfig.options);

    // Determine which exchange to bind to based on queue name
    let exchangeName = this.config.exchange;
    if (queueConfig.name.includes('email')) {
      // Import here to avoid circular dependency
      const { ExchangeName } = await import('../../domain/types/rabbitmq-config.ts');
      exchangeName = ExchangeName.EMAIL;
    }

    // Bind queue to appropriate exchange
    await this.publishChannel.bindQueue(
      queueConfig.name,
      exchangeName,
      queueConfig.routingKey
    );

    // Setup dead letter queue if configured
    if (queueConfig.deadLetterQueue) {
      const dlqName = queueConfig.deadLetterQueue.queueName;
      const dlqExchange = queueConfig.deadLetterQueue.exchange;
      const dlqRoutingKey = queueConfig.deadLetterQueue.routingKey;

      // Assert dead letter queue
      await this.publishChannel.assertQueue(dlqName, {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': queueConfig.deadLetterQueue.messageTtl,
        },
      });

      // Bind dead letter queue to dead letter exchange
      await this.publishChannel.bindQueue(dlqName, dlqExchange, dlqRoutingKey);
    }
  }

  /**
   * Get exchange configurations
   */
  private async getExchangeConfigs(): Promise<ExchangeConfig[]> {
    // Import here to avoid circular dependency
    const { createDefaultExchanges } = await import('./rabbitmq-config.ts');
    return await createDefaultExchanges();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private async scheduleReconnect(): Promise<void> {
    if (this.isClosing || this.reconnectAttempts >= this.config.connectionOptions.reconnectAttempts) {
      console.error('❌ Maximum reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      this.config.connectionOptions.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.config.connectionOptions.maxReconnectDelay
    );

    console.log(`⏳ Scheduling reconnection attempt ${this.reconnectAttempts + 1} in ${delay}ms`);

    setTimeout(async () => {
      if (!this.isClosing) {
        try {
          await this.connect();
        } catch (error) {
          // Error already logged in connect method
        }
      }
    }, delay);
  }

  /**
   * Get publish channel
   */
  getPublishChannel(): ChannelWrapper {
    if (!this.publishChannel) {
      throw new Error('Publish channel not available. Connection may not be established.');
    }
    return this.publishChannel;
  }

  /**
   * Get consume channel
   */
  getConsumeChannel(): ChannelWrapper {
    if (!this.consumeChannel) {
      throw new Error('Consume channel not available. Connection may not be established.');
    }
    return this.consumeChannel;
  }

  /**
   * Get management channel for topology operations
   */
  getManagementChannel(): ChannelWrapper {
    if (!this.managementChannel) {
      throw new Error('Management channel not available. Connection may not be established.');
    }
    return this.managementChannel;
  }

  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connection is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      if (this.state !== ConnectionState.CONNECTED || !this.publishChannel) {
        return false;
      }

      // Try to perform a lightweight operation to verify connection
      await this.publishChannel.checkQueue('amq.rabbitmq.reply-to');
      
      this.lastSuccessfulOperation = new Date();
      return true;
    } catch (error) {
      this.failedOperations++;
      return false;
    }
  }

  /**
   * Get connection health status
   */
  async getHealth(): Promise<ConnectionHealth> {
    const isHealthy = await this.isHealthy();
    
    return {
      isHealthy,
      state: this.state,
      lastSuccessfulOperation: this.lastSuccessfulOperation || undefined,
      failedOperations: this.failedOperations,
      details: {
        reconnectAttempts: this.reconnectAttempts,
        hasPublishChannel: !!this.publishChannel,
        hasConsumeChannel: !!this.consumeChannel,
        hasManagementChannel: !!this.managementChannel,
        isClosing: this.isClosing,
      },
    };
  }

  /**
   * Ping RabbitMQ to test connectivity
   */
  async ping(): Promise<void> {
    if (!this.publishChannel) {
      throw new Error('Connection not available');
    }

    try {
      // Use a lightweight operation to test connectivity
      await this.publishChannel.checkQueue('amq.rabbitmq.reply-to');
      this.lastSuccessfulOperation = new Date();
    } catch (error) {
      this.failedOperations++;
      throw new Error(`RabbitMQ ping failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Close connection and cleanup resources
   */
  async close(): Promise<void> {
    this.isClosing = true;
    this.state = ConnectionState.CLOSING;

    try {
      if (this.publishChannel) {
        await this.publishChannel.close();
        this.publishChannel = null;
      }

      if (this.consumeChannel) {
        await this.consumeChannel.close();
        this.consumeChannel = null;
      }

      if (this.managementChannel) {
        await this.managementChannel.close();
        this.managementChannel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      this.state = ConnectionState.CLOSED;
      console.log('✅ RabbitMQ connection closed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error closing RabbitMQ connection:', errorMessage);
      throw error;
    }
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      state: this.state,
      lastSuccessfulOperation: this.lastSuccessfulOperation,
      failedOperations: this.failedOperations,
      reconnectAttempts: this.reconnectAttempts,
      isClosing: this.isClosing,
    };
  }
}