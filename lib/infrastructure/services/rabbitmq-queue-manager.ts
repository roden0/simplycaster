/**
 * RabbitMQ Queue Management Utilities
 * 
 * Provides utilities for queue declaration, binding logic, topology validation,
 * and queue monitoring and statistics.
 */

import type { ChannelWrapper } from 'amqp-connection-manager';
import {
  RabbitMQConfig,
  QueueConfig,
  ExchangeConfig,
  QueueName,
  ExchangeName,
  ConnectionState,
} from '../../domain/types/rabbitmq-config.ts';
import { RabbitMQConnectionManager } from './rabbitmq-connection-manager.ts';
import { RabbitMQQueueTopology, TopologyStatus, QueueStats } from './rabbitmq-queue-topology.ts';
import { RabbitMQLogger, createRabbitMQLogger } from './rabbitmq-logger.ts';

/**
 * Queue management operation result
 */
export interface QueueOperationResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  error?: Error;
}

/**
 * Queue health check result
 */
export interface QueueHealthCheck {
  queueName: string;
  isHealthy: boolean;
  messageCount: number;
  consumerCount: number;
  lastChecked: Date;
  issues: string[];
}

/**
 * Queue monitoring metrics
 */
export interface QueueMonitoringMetrics {
  queueName: string;
  messageCount: number;
  consumerCount: number;
  messageRate: number;
  deliveryRate: number;
  ackRate: number;
  nackRate: number;
  rejectRate: number;
  averageMessageSize: number;
  memoryUsage: number;
  diskUsage: number;
  timestamp: Date;
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  results: QueueOperationResult[];
  summary: string;
}

/**
 * Queue purge options
 */
export interface QueuePurgeOptions {
  queueName: string;
  confirmPurge: boolean;
  reason?: string;
}

/**
 * Queue binding options
 */
export interface QueueBindingOptions {
  queueName: string;
  exchangeName: string;
  routingKey: string;
  arguments?: Record<string, unknown>;
}

/**
 * RabbitMQ Queue Manager
 */
export class RabbitMQQueueManager {
  private connectionManager: RabbitMQConnectionManager;
  private topology: RabbitMQQueueTopology;
  private logger: RabbitMQLogger;
  private monitoringInterval?: number;
  private isMonitoring = false;

  constructor(
    private config: RabbitMQConfig,
    connectionManager?: RabbitMQConnectionManager,
    topology?: RabbitMQQueueTopology
  ) {
    this.connectionManager = connectionManager || new RabbitMQConnectionManager(config);
    this.topology = topology || new RabbitMQQueueTopology(config, this.connectionManager);
    this.logger = createRabbitMQLogger();
  }

  /**
   * Initialize queue manager
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing RabbitMQ queue manager');

      // Ensure connection and topology are ready
      await this.connectionManager.connect();
      
      if (!this.topology.isTopologyInitialized()) {
        await this.topology.initialize();
      }

      this.logger.info('Queue manager initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to initialize queue manager', { error: errorMessage });
      throw new Error(`Queue manager initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Declare a new queue with configuration
   */
  async declareQueue(queueConfig: QueueConfig): Promise<QueueOperationResult> {
    try {
      const channel = this.connectionManager.getManagementChannel();
      
      await channel.assertQueue(queueConfig.name, {
        durable: queueConfig.options.durable,
        exclusive: queueConfig.options.exclusive,
        autoDelete: queueConfig.options.autoDelete,
        arguments: queueConfig.options.arguments,
      });

      this.logger.info('Queue declared successfully', {
        queueName: queueConfig.name,
        durable: queueConfig.options.durable,
      });

      return {
        success: true,
        message: `Queue ${queueConfig.name} declared successfully`,
        details: {
          queueName: queueConfig.name,
          durable: queueConfig.options.durable,
          arguments: queueConfig.options.arguments,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to declare queue', {
        queueName: queueConfig.name,
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to declare queue ${queueConfig.name}: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(errorMessage),
      };
    }
  }

  /**
   * Delete a queue
   */
  async deleteQueue(queueName: string, ifUnused = false, ifEmpty = false): Promise<QueueOperationResult> {
    try {
      const channel = this.connectionManager.getManagementChannel();
      
      await channel.deleteQueue(queueName, {
        ifUnused,
        ifEmpty,
      });

      this.logger.info('Queue deleted successfully', {
        queueName,
        ifUnused,
        ifEmpty,
      });

      return {
        success: true,
        message: `Queue ${queueName} deleted successfully`,
        details: { queueName, ifUnused, ifEmpty },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to delete queue', {
        queueName,
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to delete queue ${queueName}: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(errorMessage),
      };
    }
  }

  /**
   * Purge messages from a queue
   */
  async purgeQueue(options: QueuePurgeOptions): Promise<QueueOperationResult> {
    if (!options.confirmPurge) {
      return {
        success: false,
        message: 'Queue purge requires explicit confirmation',
      };
    }

    try {
      const channel = this.connectionManager.getManagementChannel();
      
      const result = await channel.purgeQueue(options.queueName);

      this.logger.warn('Queue purged', {
        queueName: options.queueName,
        messageCount: result.messageCount,
        reason: options.reason || 'No reason provided',
      });

      return {
        success: true,
        message: `Queue ${options.queueName} purged successfully`,
        details: {
          queueName: options.queueName,
          purgedMessages: result.messageCount,
          reason: options.reason,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to purge queue', {
        queueName: options.queueName,
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to purge queue ${options.queueName}: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(errorMessage),
      };
    }
  }

  /**
   * Bind a queue to an exchange
   */
  async bindQueue(options: QueueBindingOptions): Promise<QueueOperationResult> {
    try {
      const channel = this.connectionManager.getManagementChannel();
      
      await channel.bindQueue(
        options.queueName,
        options.exchangeName,
        options.routingKey,
        options.arguments
      );

      this.logger.info('Queue bound to exchange', {
        queueName: options.queueName,
        exchangeName: options.exchangeName,
        routingKey: options.routingKey,
      });

      return {
        success: true,
        message: `Queue ${options.queueName} bound to exchange ${options.exchangeName}`,
        details: {
          queueName: options.queueName,
          exchangeName: options.exchangeName,
          routingKey: options.routingKey,
          arguments: options.arguments,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to bind queue', {
        queueName: options.queueName,
        exchangeName: options.exchangeName,
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to bind queue ${options.queueName}: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(errorMessage),
      };
    }
  }

  /**
   * Unbind a queue from an exchange
   */
  async unbindQueue(options: QueueBindingOptions): Promise<QueueOperationResult> {
    try {
      const channel = this.connectionManager.getManagementChannel();
      
      await channel.unbindQueue(
        options.queueName,
        options.exchangeName,
        options.routingKey,
        options.arguments
      );

      this.logger.info('Queue unbound from exchange', {
        queueName: options.queueName,
        exchangeName: options.exchangeName,
        routingKey: options.routingKey,
      });

      return {
        success: true,
        message: `Queue ${options.queueName} unbound from exchange ${options.exchangeName}`,
        details: {
          queueName: options.queueName,
          exchangeName: options.exchangeName,
          routingKey: options.routingKey,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to unbind queue', {
        queueName: options.queueName,
        exchangeName: options.exchangeName,
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to unbind queue ${options.queueName}: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(errorMessage),
      };
    }
  }

  /**
   * Check if a queue exists
   */
  async queueExists(queueName: string): Promise<boolean> {
    try {
      const channel = this.connectionManager.getManagementChannel();
      await channel.checkQueue(queueName);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get queue information
   */
  async getQueueInfo(queueName: string): Promise<QueueStats | null> {
    try {
      return await this.topology.getQueueStats(queueName);
    } catch (error) {
      this.logger.error('Failed to get queue info', {
        queueName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Perform health check on a queue
   */
  async checkQueueHealth(queueName: string): Promise<QueueHealthCheck> {
    const issues: string[] = [];
    let isHealthy = true;
    let messageCount = 0;
    let consumerCount = 0;

    try {
      const queueInfo = await this.getQueueInfo(queueName);
      
      if (!queueInfo) {
        issues.push('Queue does not exist or is not accessible');
        isHealthy = false;
      } else {
        messageCount = queueInfo.messageCount;
        consumerCount = queueInfo.consumerCount;

        // Check for potential issues
        if (messageCount > 10000) {
          issues.push(`High message count: ${messageCount}`);
        }

        if (messageCount > 0 && consumerCount === 0) {
          issues.push('Messages in queue but no consumers');
        }

        if (!queueInfo.isHealthy) {
          issues.push('Queue reported as unhealthy');
          isHealthy = false;
        }
      }
    } catch (error) {
      issues.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
      isHealthy = false;
    }

    return {
      queueName,
      isHealthy,
      messageCount,
      consumerCount,
      lastChecked: new Date(),
      issues,
    };
  }

  /**
   * Perform health check on all configured queues
   */
  async checkAllQueuesHealth(): Promise<QueueHealthCheck[]> {
    const healthChecks: QueueHealthCheck[] = [];

    for (const queueConfig of this.config.queues) {
      const healthCheck = await this.checkQueueHealth(queueConfig.name);
      healthChecks.push(healthCheck);

      // Also check dead letter queue if configured
      if (queueConfig.deadLetterQueue) {
        const dlqHealthCheck = await this.checkQueueHealth(queueConfig.deadLetterQueue.queueName);
        healthChecks.push(dlqHealthCheck);
      }
    }

    return healthChecks;
  }

  /**
   * Get comprehensive queue monitoring metrics
   */
  async getQueueMonitoringMetrics(queueName: string): Promise<QueueMonitoringMetrics | null> {
    try {
      const queueInfo = await this.getQueueInfo(queueName);
      
      if (!queueInfo) {
        return null;
      }

      // Note: In a production environment, you would get these metrics from RabbitMQ Management API
      // This is a simplified implementation with basic metrics
      return {
        queueName,
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount,
        messageRate: queueInfo.messageRate,
        deliveryRate: queueInfo.deliveryRate,
        ackRate: 0, // Would need Management API
        nackRate: 0, // Would need Management API
        rejectRate: 0, // Would need Management API
        averageMessageSize: 0, // Would need Management API
        memoryUsage: 0, // Would need Management API
        diskUsage: 0, // Would need Management API
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to get queue monitoring metrics', {
        queueName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get monitoring metrics for all queues
   */
  async getAllQueueMetrics(): Promise<QueueMonitoringMetrics[]> {
    const metrics: QueueMonitoringMetrics[] = [];

    for (const queueConfig of this.config.queues) {
      const queueMetrics = await this.getQueueMonitoringMetrics(queueConfig.name);
      if (queueMetrics) {
        metrics.push(queueMetrics);
      }

      // Also get metrics for dead letter queue if configured
      if (queueConfig.deadLetterQueue) {
        const dlqMetrics = await this.getQueueMonitoringMetrics(queueConfig.deadLetterQueue.queueName);
        if (dlqMetrics) {
          metrics.push(dlqMetrics);
        }
      }
    }

    return metrics;
  }

  /**
   * Validate topology setup
   */
  async validateTopology(): Promise<QueueOperationResult> {
    try {
      const validation = await this.topology.validateTopology();
      
      if (validation.isValid) {
        return {
          success: true,
          message: 'Topology validation passed',
          details: {
            warnings: validation.warnings,
          },
        };
      } else {
        return {
          success: false,
          message: 'Topology validation failed',
          details: {
            errors: validation.errors,
            warnings: validation.warnings,
          },
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Topology validation error: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(errorMessage),
      };
    }
  }

  /**
   * Get topology status
   */
  async getTopologyStatus(): Promise<TopologyStatus> {
    return await this.topology.getTopologyStatus();
  }

  /**
   * Recreate all queues (useful for configuration changes)
   */
  async recreateQueues(): Promise<BulkOperationResult> {
    const results: QueueOperationResult[] = [];
    let successfulOperations = 0;
    let failedOperations = 0;

    this.logger.info('Starting queue recreation process');

    for (const queueConfig of this.config.queues) {
      // Delete existing queue (if it exists)
      const deleteResult = await this.deleteQueue(queueConfig.name, false, false);
      results.push(deleteResult);

      if (deleteResult.success) {
        successfulOperations++;
      } else {
        failedOperations++;
        // Continue with recreation even if deletion failed
      }

      // Recreate queue
      const createResult = await this.declareQueue(queueConfig);
      results.push(createResult);

      if (createResult.success) {
        successfulOperations++;
        
        // Rebind queue
        const bindResult = await this.bindQueue({
          queueName: queueConfig.name,
          exchangeName: this.config.exchange,
          routingKey: queueConfig.routingKey,
        });
        results.push(bindResult);

        if (bindResult.success) {
          successfulOperations++;
        } else {
          failedOperations++;
        }
      } else {
        failedOperations++;
      }
    }

    const totalOperations = results.length;
    const summary = `Queue recreation completed: ${successfulOperations}/${totalOperations} operations successful`;

    this.logger.info('Queue recreation process completed', {
      totalOperations,
      successfulOperations,
      failedOperations,
    });

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      results,
      summary,
    };
  }

  /**
   * Start monitoring queues
   */
  startMonitoring(intervalMs = 30000): void {
    if (this.isMonitoring) {
      this.logger.warn('Queue monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        const healthChecks = await this.checkAllQueuesHealth();
        const unhealthyQueues = healthChecks.filter(check => !check.isHealthy);

        if (unhealthyQueues.length > 0) {
          this.logger.warn('Unhealthy queues detected', {
            unhealthyCount: unhealthyQueues.length,
            queues: unhealthyQueues.map(q => ({
              name: q.queueName,
              issues: q.issues,
            })),
          });
        }

        // Log metrics for all queues
        const metrics = await this.getAllQueueMetrics();
        this.logger.debug('Queue monitoring metrics', { metrics });
      } catch (error) {
        this.logger.error('Queue monitoring error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, intervalMs);

    this.logger.info('Queue monitoring started', { intervalMs });
  }

  /**
   * Stop monitoring queues
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    this.logger.info('Queue monitoring stopped');
  }

  /**
   * Check if monitoring is active
   */
  isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionManager.getConnectionState();
  }

  /**
   * Close queue manager
   */
  async close(): Promise<void> {
    this.stopMonitoring();
    await this.topology.close();
    this.logger.info('Queue manager closed');
  }
}

/**
 * Factory function to create and initialize queue manager
 */
export async function createRabbitMQQueueManager(
  config: RabbitMQConfig,
  connectionManager?: RabbitMQConnectionManager,
  topology?: RabbitMQQueueTopology
): Promise<RabbitMQQueueManager> {
  const manager = new RabbitMQQueueManager(config, connectionManager, topology);
  await manager.initialize();
  return manager;
}