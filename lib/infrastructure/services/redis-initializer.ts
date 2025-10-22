/**
 * Redis Initialization Service
 * 
 * Handles Redis connection initialization, health checks, and graceful shutdown
 * for the application lifecycle.
 */

import { Container } from '../../container/container.ts';
import { ServiceKeys } from '../../container/registry.ts';
import { RedisConnectionManager } from './redis-connection-manager.ts';
import { RedisService } from '../../domain/services/redis-service.ts';
import { RedisMonitoringService } from './redis-monitoring-service.ts';
import { RedisHealthService } from './redis-health-service.ts';
import { RedisLogger } from './redis-logger.ts';
import { RedisServiceWithLogging } from './redis-service-with-logging.ts';

export class RedisInitializer {
  private container: Container;
  private connectionManager?: RedisConnectionManager;
  private redisService?: RedisService;
  private monitoringService?: RedisMonitoringService;
  private healthService?: RedisHealthService;
  private logger?: RedisLogger;
  private redisServiceWithLogging?: RedisServiceWithLogging;

  constructor(container: Container) {
    this.container = container;
  }

  /**
   * Initialize Redis connection and services
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing Redis services...');

      // Get connection manager and connect
      this.connectionManager = this.container.get<RedisConnectionManager>(ServiceKeys.REDIS_CONNECTION_MANAGER);
      await this.connectionManager.connect();

      // Get Redis service
      this.redisService = this.container.get<RedisService>(ServiceKeys.REDIS_SERVICE);

      // Initialize monitoring and logging services
      this.logger = this.container.get<RedisLogger>(ServiceKeys.REDIS_LOGGER);
      this.monitoringService = this.container.get<RedisMonitoringService>(ServiceKeys.REDIS_MONITORING_SERVICE);
      this.healthService = this.container.get<RedisHealthService>(ServiceKeys.REDIS_HEALTH_SERVICE);
      this.redisServiceWithLogging = this.container.get<RedisServiceWithLogging>(ServiceKeys.REDIS_SERVICE_WITH_LOGGING);

      // Start monitoring
      this.monitoringService.startMonitoring();
      console.log('Redis monitoring started');

      // Log connection event
      this.logger.logConnectionEvent('connect', true, undefined, {
        host: Deno.env.get('REDIS_HOST') || 'localhost',
        port: parseInt(Deno.env.get('REDIS_PORT') || '6379'),
      });

      // Verify connection with ping
      const isHealthy = await this.redisService.ping();
      if (!isHealthy) {
        this.logger.logConnectionEvent('error', false, new Error('Health check failed'));
        throw new Error('Redis health check failed after connection');
      }

      // Perform comprehensive health check
      const healthStatus = await this.healthService.checkHealth();
      console.log(`Redis health status: ${healthStatus.overall}`);
      
      if (healthStatus.overall === 'unhealthy') {
        console.warn('Redis is unhealthy but continuing initialization');
        console.warn('Health issues:', healthStatus.recommendations);
      }

      console.log('Redis services initialized successfully');

      // Set up graceful shutdown handlers
      this.setupShutdownHandlers();

    } catch (error) {
      console.error('Failed to initialize Redis services:', error);
      
      // In development, we might want to continue without Redis
      if (Deno.env.get('NODE_ENV') === 'development') {
        console.warn('Continuing without Redis in development mode');
        return;
      }
      
      throw error;
    }
  }

  /**
   * Get Redis service instance
   */
  getRedisService(): RedisService | undefined {
    return this.redisService;
  }

  /**
   * Get Redis service with logging
   */
  getRedisServiceWithLogging(): RedisServiceWithLogging | undefined {
    return this.redisServiceWithLogging;
  }

  /**
   * Get monitoring service
   */
  getMonitoringService(): RedisMonitoringService | undefined {
    return this.monitoringService;
  }

  /**
   * Get health service
   */
  getHealthService(): RedisHealthService | undefined {
    return this.healthService;
  }

  /**
   * Get logger
   */
  getLogger(): RedisLogger | undefined {
    return this.logger;
  }

  /**
   * Get connection health status
   */
  getHealthStatus() {
    if (!this.connectionManager) {
      return { status: 'not_initialized' };
    }

    const health = this.connectionManager.getHealth();
    return {
      status: health.isConnected ? 'healthy' : 'unhealthy',
      ...health,
    };
  }

  /**
   * Gracefully shutdown Redis connections
   */
  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down Redis services...');

      // Stop monitoring
      if (this.monitoringService) {
        this.monitoringService.stopMonitoring();
        console.log('Redis monitoring stopped');
      }

      // Stop logger
      if (this.logger) {
        this.logger.stop();
        console.log('Redis logger stopped');
      }

      // Log disconnection event
      if (this.logger) {
        this.logger.logConnectionEvent('disconnect', true);
      }

      // Disconnect Redis
      if (this.redisService) {
        await this.redisService.disconnect();
      }

      console.log('Redis services shut down successfully');
    } catch (error) {
      console.error('Error during Redis shutdown:', error);
      
      // Log shutdown error
      if (this.logger) {
        this.logger.logConnectionEvent('error', false, error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdownHandler = async (signal: string) => {
      console.log(`Received ${signal}, shutting down Redis gracefully...`);
      await this.shutdown();
      Deno.exit(0);
    };

    // Handle various shutdown signals
    Deno.addSignalListener('SIGINT', () => shutdownHandler('SIGINT'));
    Deno.addSignalListener('SIGTERM', () => shutdownHandler('SIGTERM'));

    // Handle unhandled promise rejections
    globalThis.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      shutdownHandler('unhandledrejection');
    });
  }

  /**
   * Perform health check on Redis services
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.redisService) {
        return false;
      }

      return await this.redisService.ping();
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * Attempt to reconnect Redis if connection is lost
   */
  async reconnect(): Promise<boolean> {
    try {
      if (!this.connectionManager) {
        return false;
      }

      await this.connectionManager.reconnect();
      return await this.healthCheck();
    } catch (error) {
      console.error('Redis reconnection failed:', error);
      return false;
    }
  }
}