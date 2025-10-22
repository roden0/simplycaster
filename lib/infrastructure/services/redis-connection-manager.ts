/**
 * Redis Connection Manager
 * 
 * Manages Redis connections with health checks, reconnection logic,
 * and connection pooling for reliable Redis operations.
 */

import { createClient, RedisClientType } from 'redis';
import { RedisConfig, validateRedisConfig } from './redis-config.ts';

export interface ConnectionHealth {
  isConnected: boolean;
  lastPing?: Date;
  connectionTime?: Date;
  reconnectAttempts: number;
  lastError?: string;
}

export class RedisConnectionManager {
  private client: RedisClientType | null = null;
  private config: RedisConfig;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private connectionTime?: Date;
  private lastPing?: Date;
  private lastError?: string;
  private reconnectTimer?: number;
  private healthCheckTimer?: number;

  constructor(config: RedisConfig) {
    this.config = config;
    
    // Validate configuration
    const errors = validateRedisConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid Redis configuration: ${errors.join(', ')}`);
    }
  }

  /**
   * Connect to Redis with retry logic
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      // Create Redis client with configuration
      this.client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
          keepAlive: this.config.keepAlive,
          connectTimeout: this.config.commandTimeout,
        },
        password: this.config.password,
        database: this.config.database,
        commandsQueueMaxLength: this.config.maxRetriesPerRequest,
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Connect to Redis
      await this.client.connect();
      
      this.isConnected = true;
      this.connectionTime = new Date();
      this.reconnectAttempts = 0;
      this.lastError = undefined;

      console.log(`Redis connected to ${this.config.host}:${this.config.port}`);

      // Start health check timer
      this.startHealthCheck();

    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error('Redis connection failed:', this.lastError);
      
      // Schedule reconnection if within retry limits
      if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
        this.scheduleReconnect();
      } else {
        throw new Error(`Redis connection failed after ${this.config.maxReconnectAttempts} attempts: ${this.lastError}`);
      }
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    this.stopHealthCheck();
    this.stopReconnectTimer();

    if (this.client) {
      try {
        await this.client.quit();
      } catch (error) {
        console.warn('Error during Redis disconnect:', error);
      }
    }

    this.client = null;
    this.isConnected = false;
    this.connectionTime = undefined;
    this.lastPing = undefined;
    
    console.log('Redis disconnected');
  }

  /**
   * Get Redis client instance
   */
  getClient(): RedisClientType {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client is not connected');
    }
    return this.client;
  }

  /**
   * Check if Redis is healthy
   */
  async ping(): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.ping();
      this.lastPing = new Date();
      return result === 'PONG';
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error('Redis ping failed:', this.lastError);
      return false;
    }
  }

  /**
   * Get connection health status
   */
  getHealth(): ConnectionHealth {
    return {
      isConnected: this.isConnected,
      lastPing: this.lastPing,
      connectionTime: this.connectionTime,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError,
    };
  }

  /**
   * Force reconnection
   */
  async reconnect(): Promise<void> {
    console.log('Forcing Redis reconnection...');
    await this.disconnect();
    this.reconnectAttempts = 0;
    await this.connect();
  }

  /**
   * Setup Redis client event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('error', (error) => {
      this.lastError = error.message;
      console.error('Redis client error:', error);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis client connected');
    });

    this.client.on('ready', () => {
      console.log('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('end', () => {
      console.log('Redis connection ended');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('Redis client reconnecting...');
      this.reconnectAttempts++;
    });
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.retryDelayOnFailover * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    console.log(`Scheduling Redis reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('Reconnection attempt failed:', error);
      }
    }, delay);
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      const isHealthy = await this.ping();
      if (!isHealthy && this.isConnected) {
        console.warn('Redis health check failed, attempting reconnection');
        this.isConnected = false;
        this.scheduleReconnect();
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop health check timer
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Stop reconnect timer
   */
  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}